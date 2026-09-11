"""Orquestração do treino de LoRA sob demanda (training-api spec).

Reimplementação da lógica documentada em _reversa_sdd/treino/design.md e
_reversa_sdd/aplicacao-lora/design.md (extraídos de code.ipynb). Roda em
thread de background para não bloquear o event loop do FastAPI (RNF-02
da spec training-api).
"""
import math
import threading
import uuid

import torch

from app import state
from app.ml.data import montar_dataloader_unico, montar_dataloaders
from app.ml.model import model_service


def _calcular_loss(carregador) -> float:
    model_service.modelo.eval()
    perdas = []
    with torch.inference_mode():
        for lote in carregador:
            lote_gpu = {nome: tensor.to(model_service.dispositivo) for nome, tensor in lote.items()}
            resultado = model_service.modelo(**lote_gpu)
            perdas.append(resultado.loss.item())
    return sum(perdas) / len(perdas)


def _treinar(id_execucao: str, epocas: int, taxa_aprendizado: float, tamanho_lote: int):
    try:
        model_service.carregar_base()
        model_service.aplicar_lora_fresca()  # sempre parte do modelo limpo, nunca continua treino anterior
        tokenizador = model_service.tokenizador
        modelo = model_service.modelo

        carregador_treino, carregador_validacao = montar_dataloaders(
            state.dataset_treino, state.dataset_validacao, tokenizador, tamanho_lote
        )

        parametros_treinaveis = [p for p in modelo.parameters() if p.requires_grad]
        otimizador = torch.optim.AdamW(parametros_treinaveis, lr=taxa_aprendizado)

        # Loss de validação ANTES de qualquer passo de treino — vira o ponto de
        # partida ("época 0") do gráfico didático de treino x validação.
        loss_validacao_inicial = _calcular_loss(carregador_validacao)
        with state.get_lock():
            state.execucoes[id_execucao]["loss_validacao_inicial"] = round(loss_validacao_inicial, 4)

        modelo.config.use_cache = False

        for epoca in range(1, epocas + 1):
            modelo.train()
            loss_total = 0.0
            for passo, lote in enumerate(carregador_treino, start=1):
                lote_gpu = {nome: tensor.to(model_service.dispositivo) for nome, tensor in lote.items()}
                otimizador.zero_grad(set_to_none=True)
                resultado = modelo(**lote_gpu)
                loss = resultado.loss
                loss.backward()
                otimizador.step()
                valor_loss = loss.item()
                loss_total += valor_loss

                # atualiza o histórico a cada passo para alimentar o gráfico ao vivo
                # (amostrado a cada 2 passos para não sobrecarregar o polling do Frontend)
                if passo % 2 == 0 or passo == len(carregador_treino):
                    with state.get_lock():
                        state.execucoes[id_execucao]["historico_loss"].append(round(valor_loss, 4))
                        state.execucoes[id_execucao]["status"] = "em_andamento"

            loss_media_treino = loss_total / len(carregador_treino)
            loss_validacao = _calcular_loss(carregador_validacao)

            with state.get_lock():
                state.execucoes[id_execucao]["historico_epocas"].append(
                    {
                        "epoca": epoca,
                        "loss_treino": round(loss_media_treino, 4),
                        "loss_validacao": round(loss_validacao, 4),
                        "perplexidade_validacao": round(math.exp(loss_validacao), 2),
                    }
                )
                state.execucoes[id_execucao].update(
                    status="em_andamento",
                    epoca_atual=epoca,
                    loss_atual=round(loss_validacao, 4),
                )

        # Avaliação final no conjunto de teste — nunca visto no treino nem na
        # validação. É a "prova" real de que o modelo generaliza, não só uma
        # fonte de perguntas de exemplo (ver _reversa_sdd/sdd/training-api.md).
        carregador_teste = montar_dataloader_unico(state.dataset_teste, tokenizador, tamanho_lote)
        loss_teste = _calcular_loss(carregador_teste)
        perplexidade_teste = math.exp(loss_teste)

        model_service.modelo.eval()
        model_service.modelo.config.use_cache = True
        model_service.pronto_para_chat = True
        model_service.checkpoint_ativo = f"treino ao vivo, {epocas} época(s), loss teste {round(loss_teste, 4)}"

        with state.get_lock():
            state.execucoes[id_execucao].update(
                status="concluido",
                loss_teste=round(loss_teste, 4),
                perplexidade_teste=round(perplexidade_teste, 2),
            )

    except Exception as exc:  # noqa: BLE001 — precisa capturar qualquer falha do treino (EC-04)
        with state.get_lock():
            state.execucoes[id_execucao].update(status="erro", mensagem_erro=str(exc))
    finally:
        with state.get_lock():
            state.treino_em_andamento = False


def iniciar_treino(epocas: int, taxa_aprendizado: float, tamanho_lote: int) -> str:
    """Valida pré-condições (EC-02, EC-03) e dispara o treino em background."""
    with state.get_lock():
        if state.dataset_treino is None:
            raise ValueError("Base de dados ainda não carregada")
        if state.treino_em_andamento:
            raise PermissionError("Já existe um treino em andamento")

        id_execucao = str(uuid.uuid4())
        state.execucoes[id_execucao] = {
            "status": "pendente",
            "epoca_atual": 0,
            "epoca_total": epocas,
            "loss_atual": None,
            "mensagem_erro": None,
            "historico_loss": [],
            "historico_epocas": [],
            "loss_validacao_inicial": None,
            "loss_teste": None,
            "perplexidade_teste": None,
        }
        state.treino_em_andamento = True

    thread = threading.Thread(
        target=_treinar,
        args=(id_execucao, epocas, taxa_aprendizado, tamanho_lote),
        daemon=True,
    )
    thread.start()
    return id_execucao


def obter_status(id_execucao: str) -> dict | None:
    with state.get_lock():
        execucao = state.execucoes.get(id_execucao)
        return dict(execucao) if execucao else None
