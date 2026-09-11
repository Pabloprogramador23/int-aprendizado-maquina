"""Endpoint de conversa com o modelo (inference-api RF-01..RF-05, EC-01..EC-04)."""
from fastapi import APIRouter, HTTPException

from app.config import DEFAULT_PENALIDADE_REPETICAO, DEFAULT_TEMPERATURA
from app.ml.model import model_service
from app.schemas import ChatRequest, ChatResponse, StatusModeloResponse

router = APIRouter(tags=["chat"])


@router.get("/status", response_model=StatusModeloResponse)
def status_modelo():
    return StatusModeloResponse(
        modelo_pronto=model_service.pronto_para_chat,
        modelo_ativo=model_service.checkpoint_ativo,
    )


@router.post("/chat", response_model=ChatResponse)
def chat(requisicao: ChatRequest):
    # EC-01: pergunta vazia é rejeitada pela validação do Pydantic (min_length=1)

    if not model_service.pronto_para_chat:
        # EC-02: modelo ainda não treinado/carregado
        raise HTTPException(status_code=503, detail="Modelo ainda não disponível — treine antes de conversar")

    temperatura = requisicao.temperatura if requisicao.temperatura is not None else DEFAULT_TEMPERATURA
    penalidade = (
        requisicao.penalidade_repeticao
        if requisicao.penalidade_repeticao is not None
        else DEFAULT_PENALIDADE_REPETICAO
    )

    try:
        resposta = model_service.gerar_resposta(
            pergunta=requisicao.pergunta,
            contexto=requisicao.contexto or "",
            temperatura=temperatura,
            penalidade_repeticao=penalidade,
        )
    except Exception as exc:  # noqa: BLE001 — EC-04: erro interno durante geração
        raise HTTPException(status_code=500, detail="Erro ao gerar resposta do modelo") from exc

    return ChatResponse(resposta=resposta)
