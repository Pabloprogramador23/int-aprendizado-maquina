"""Carregamento e preparação de dados.

Reimplementação do comportamento documentado em
_reversa_sdd/preparacao-dados/design.md e _reversa_sdd/tokenizacao/design.md
(extraídos de code.ipynb). Não lê nem modifica o notebook original — apenas
reproduz a lógica já validada, como código novo.
"""
from pathlib import Path

import pandas as pd
import torch
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader

from app.config import CAMINHO_DATASET, MAX_LENGTH


def carregar_dataset(caminho: Path = CAMINHO_DATASET) -> pd.DataFrame:
    if not caminho.exists():
        raise FileNotFoundError(f"Dataset não encontrado em {caminho}")
    return pd.read_json(caminho, lines=True)


# Abaixo de quantos caracteres uma resposta é considerada defeituosa/incompleta
# demais para servir de sinal de treino (ex.: o output de 1 caractere já
# documentado na extração do notebook original).
LIMITE_MIN_RESPOSTA = 15


def limpar_dataset(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Remove defeitos objetivos da base antes do treino e devolve um relatório
    com o que foi removido, para exibir na interface.

    Critérios aplicados, nesta ordem:
    1. Linhas totalmente duplicadas (mesmo instruction+input+output)
    2. Linhas com `instruction` ou `output` vazio/nulo (campo essencial ausente)
    3. Linhas com `output` menor que LIMITE_MIN_RESPOSTA caracteres (resposta
       incompleta/defeituosa demais para ensinar o modelo)

    Não filtra por similaridade semântica entre exemplos (isso exigiria um
    modelo de embeddings à parte) — os critérios acima são objetivos e
    reproduzíveis, defensáveis numa apresentação.
    """
    total_original = len(df)

    duplicatas_mask = df.duplicated()
    duplicatas_removidas = int(duplicatas_mask.sum())
    df = df[~duplicatas_mask].copy()

    instrucao_vazia = df["instruction"].fillna("").str.strip().eq("")
    resposta_vazia = df["output"].fillna("").str.strip().eq("")
    vazios_mask = instrucao_vazia | resposta_vazia
    vazios_removidos = int(vazios_mask.sum())
    df = df[~vazios_mask].copy()

    curta_mask = df["output"].str.strip().str.len() < LIMITE_MIN_RESPOSTA
    respostas_curtas_removidas = int(curta_mask.sum())
    df = df[~curta_mask].copy()

    df = df.reset_index(drop=True)
    total_limpo = len(df)

    relatorio = {
        "total_original": total_original,
        "total_limpo": total_limpo,
        "total_removido": total_original - total_limpo,
        "duplicatas_removidas": duplicatas_removidas,
        "vazios_removidos": vazios_removidos,
        "respostas_curtas_removidas": respostas_curtas_removidas,
        "limite_min_resposta_chars": LIMITE_MIN_RESPOSTA,
    }
    return df, relatorio


def montar_pergunta(instrucao: str, contexto: str = "") -> str:
    """Junta instrução e contexto opcional num único bloco de pergunta.

    O passo a passo do professor define apenas 2 marcadores fixos
    (### Pergunta: / ### Resposta:) — não existe um terceiro marcador de
    contexto. Quando há contexto, ele entra dentro do próprio bloco de
    pergunta, separado por uma linha em branco (alinhado com o notebook
    de referência mais recente do grupo)."""
    instrucao = (instrucao or "").strip()
    contexto = (contexto or "").strip()
    if contexto:
        return f"{instrucao}\n\n{contexto}"
    return instrucao


def formatar_prompt(pergunta: str, contexto: str = "") -> str:
    """Formato usado na hora de conversar (a resposta fica em aberto)."""
    pergunta_completa = montar_pergunta(pergunta, contexto)
    return f"### Pergunta:\n{pergunta_completa}\n\n### Resposta:\n"


def formatar_exemplo(instruction: str, input_: str, output: str) -> str:
    """Formato usado no treino: prompt + resposta (sem o eos_token, que é
    adicionado por quem chama, junto ao tokenizador)."""
    prompt = formatar_prompt(instruction, input_)
    return f"{prompt}{(output or '').strip()}"


def dividir_treino_validacao_teste(df: pd.DataFrame, seed: int = 42):
    """80% treino / 10% validação / 10% teste, com checagem de vazamento.

    Mesmo padrão de reprodutibilidade e de proporção usado nos dois notebooks
    de referência (original e atualizado do colega): dois splits em sequência
    (80/20, depois 50/50 sobre os 20%) resultam em 80/10/10. A validação
    acompanha cada época; o teste fica reservado e nunca é usado durante o
    treino — só serve pra sugestões de perguntas no chat e, futuramente, para
    uma avaliação final.
    """
    df_treino, df_resto = train_test_split(df, test_size=0.20, random_state=seed, shuffle=True)
    df_validacao, df_teste = train_test_split(df_resto, test_size=0.50, random_state=seed, shuffle=True)

    i_tr, i_va, i_te = set(df_treino.index), set(df_validacao.index), set(df_teste.index)
    assert not (i_tr & i_va) and not (i_tr & i_te) and not (i_va & i_te), "Vazamento entre conjuntos!"

    return df_treino, df_validacao, df_teste


def tokenizar_dataframe(df: pd.DataFrame, tokenizador, max_length: int = MAX_LENGTH):
    textos = df.apply(
        lambda linha: formatar_exemplo(linha["instruction"], linha.get("input", ""), linha["output"])
        + tokenizador.eos_token,
        axis=1,
    )

    dados_tokenizados = []
    for texto in textos:
        codificacao = tokenizador(
            texto,
            truncation=True,
            max_length=max_length,
            padding=False,
            add_special_tokens=False,
        )
        dados_tokenizados.append(
            {
                "input_ids": codificacao["input_ids"],
                "attention_mask": codificacao["attention_mask"],
            }
        )
    return dados_tokenizados


def montar_lote(tokenizador):
    """Collate function com padding dinâmico, labels de padding = -100.

    Mesma lógica de code.ipynb célula 47, ver
    _reversa_sdd/tokenizacao/design.md.
    """

    def _collate(exemplos):
        lote = tokenizador.pad(exemplos, padding=True, return_tensors="pt")
        labels = lote["input_ids"].clone()
        labels[lote["attention_mask"] == 0] = -100
        lote["labels"] = labels
        return lote

    return _collate


def sugestoes_teste(df_teste: pd.DataFrame, n: int = 3) -> list[dict]:
    """Sorteia n exemplos do conjunto de teste (nunca usado no treino) para
    sugerir como perguntas clicáveis na tela de chat.

    Sem seed fixa de propósito: a divisão treino/validação/teste em si
    precisa ser reprodutível (seed=42 em `dividir_treino_validacao_teste`),
    mas as sugestões de pergunta devem variar a cada chamada — senão o chat
    sempre mostraria as 3 mesmas perguntas."""
    amostra = df_teste.sample(n=min(n, len(df_teste)))
    return [
        {
            "pergunta": linha["instruction"],
            "contexto": linha.get("input") or "",
            "resposta_esperada": linha["output"],
        }
        for _, linha in amostra.iterrows()
    ]


def montar_dataloader_unico(
    df: pd.DataFrame, tokenizador, tamanho_lote: int, max_length: int = MAX_LENGTH, embaralhar: bool = False
) -> DataLoader:
    """Monta um único DataLoader a partir de um DataFrame já pronto — usado
    para validação e teste, que nunca precisam de shuffle."""
    dados = tokenizar_dataframe(df, tokenizador, max_length)
    return DataLoader(dados, batch_size=tamanho_lote, shuffle=embaralhar, collate_fn=montar_lote(tokenizador))


def montar_dataloaders(
    df_treino: pd.DataFrame, df_validacao: pd.DataFrame, tokenizador, tamanho_lote: int, max_length: int = MAX_LENGTH
):
    """Recebe os splits já prontos (ver `dividir_treino_validacao_teste`) —
    o split acontece uma única vez, ao carregar a base, não a cada treino."""
    dados_treino = tokenizar_dataframe(df_treino, tokenizador, max_length)
    dados_validacao = tokenizar_dataframe(df_validacao, tokenizador, max_length)

    collate_fn = montar_lote(tokenizador)

    carregador_treino = DataLoader(
        dados_treino, batch_size=tamanho_lote, shuffle=True, collate_fn=collate_fn
    )
    carregador_validacao = DataLoader(
        dados_validacao, batch_size=tamanho_lote, shuffle=False, collate_fn=collate_fn
    )
    return carregador_treino, carregador_validacao
