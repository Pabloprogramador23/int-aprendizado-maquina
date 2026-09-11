"""Modelos Pydantic de request/response. Ver specs em _reversa_sdd/sdd/*.md."""
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


# --- dataset (training-api RF-01) ---

class DatasetCarregarResponse(BaseModel):
    total_exemplos: int
    proporcao_input_vazio_pct: float
    total_original: int
    total_removido: int
    duplicatas_removidas: int
    vazios_removidos: int
    respostas_curtas_removidas: int
    limite_min_resposta_chars: int
    total_treino: int
    total_validacao: int
    total_teste: int


class SugestaoTeste(BaseModel):
    pergunta: str
    contexto: Optional[str] = None
    resposta_esperada: Optional[str] = None


class SugestoesTesteResponse(BaseModel):
    sugestoes: List[SugestaoTeste]


# --- treino (training-api RF-02, RF-03, RF-06) ---

class TreinoConfig(BaseModel):
    epocas: int = Field(gt=0, le=10)
    taxa_aprendizado: float = Field(gt=0, le=1)
    tamanho_lote: int = Field(gt=0, le=64)
    temperatura: float = Field(gt=0, le=2)


class TreinoIniciarResponse(BaseModel):
    id_execucao: str


class HistoricoEpoca(BaseModel):
    epoca: int
    loss_treino: float
    loss_validacao: float
    perplexidade_validacao: float


class TreinoStatusResponse(BaseModel):
    id_execucao: str
    status: Literal["pendente", "em_andamento", "concluido", "erro"]
    epoca_atual: int
    epoca_total: int
    loss_atual: Optional[float] = None
    mensagem_erro: Optional[str] = None
    historico_loss: List[float] = []
    historico_epocas: List[HistoricoEpoca] = []
    loss_validacao_inicial: Optional[float] = None
    loss_teste: Optional[float] = None
    perplexidade_teste: Optional[float] = None


# --- chat (inference-api RF-01, RF-04) ---

class ChatRequest(BaseModel):
    pergunta: str = Field(min_length=1)
    contexto: Optional[str] = None
    temperatura: Optional[float] = Field(default=None, gt=0, le=2)
    penalidade_repeticao: Optional[float] = Field(default=None, ge=1, le=2)


class ChatResponse(BaseModel):
    resposta: str


class StatusModeloResponse(BaseModel):
    modelo_pronto: bool
    modelo_ativo: Optional[str] = None
