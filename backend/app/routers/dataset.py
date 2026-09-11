"""Endpoint de carregamento, limpeza e split da base (training-api RF-01)."""
from fastapi import APIRouter, HTTPException

from app import state
from app.ml.data import carregar_dataset, dividir_treino_validacao_teste, limpar_dataset, sugestoes_teste
from app.schemas import DatasetCarregarResponse, SugestoesTesteResponse

router = APIRouter(prefix="/dataset", tags=["dataset"])


@router.post("/carregar", response_model=DatasetCarregarResponse)
def carregar():
    try:
        df_bruto = carregar_dataset()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    df_limpo, relatorio = limpar_dataset(df_bruto)
    df_treino, df_validacao, df_teste = dividir_treino_validacao_teste(df_limpo)

    with state.get_lock():
        state.dataset_treino = df_treino
        state.dataset_validacao = df_validacao
        state.dataset_teste = df_teste

    total = len(df_limpo)
    vazios = df_limpo["input"].fillna("").str.strip().eq("").sum() if "input" in df_limpo.columns else 0
    proporcao = round((vazios / total) * 100, 2) if total else 0.0

    return DatasetCarregarResponse(
        total_exemplos=total,
        proporcao_input_vazio_pct=proporcao,
        total_original=relatorio["total_original"],
        total_removido=relatorio["total_removido"],
        duplicatas_removidas=relatorio["duplicatas_removidas"],
        vazios_removidos=relatorio["vazios_removidos"],
        respostas_curtas_removidas=relatorio["respostas_curtas_removidas"],
        limite_min_resposta_chars=relatorio["limite_min_resposta_chars"],
        total_treino=len(df_treino),
        total_validacao=len(df_validacao),
        total_teste=len(df_teste),
    )


@router.get("/sugestoes-teste", response_model=SugestoesTesteResponse)
def sugestoes():
    if state.dataset_teste is None:
        raise HTTPException(status_code=409, detail="Base de dados ainda não carregada")

    return SugestoesTesteResponse(sugestoes=sugestoes_teste(state.dataset_teste, n=3))
