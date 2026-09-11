"""Endpoints de treino (training-api RF-02, RF-03, RF-06, EC-01, EC-02, EC-03)."""
from fastapi import APIRouter, HTTPException

from app.ml import training as training_service
from app.schemas import TreinoConfig, TreinoIniciarResponse, TreinoStatusResponse

router = APIRouter(prefix="/treino", tags=["treino"])


@router.post("/iniciar", response_model=TreinoIniciarResponse)
def iniciar(config: TreinoConfig):
    try:
        id_execucao = training_service.iniciar_treino(
            epocas=config.epocas,
            taxa_aprendizado=config.taxa_aprendizado,
            tamanho_lote=config.tamanho_lote,
        )
    except ValueError as exc:
        # EC-02: base não carregada
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PermissionError as exc:
        # EC-03: treino já em andamento
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return TreinoIniciarResponse(id_execucao=id_execucao)


@router.get("/status/{id_execucao}", response_model=TreinoStatusResponse)
def status(id_execucao: str):
    execucao = training_service.obter_status(id_execucao)
    if execucao is None:
        raise HTTPException(status_code=404, detail="Execução de treino não encontrada")

    return TreinoStatusResponse(id_execucao=id_execucao, **execucao)
