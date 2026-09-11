"""Estado compartilhado do processo (em memória, sem persistência em disco).

Cobre RF-01 (dataset carregado) e o dicionário de execuções de treino
(training-api spec, seção 9 — Modelo de Dados).
"""
import threading
from typing import Optional

import pandas as pd

_lock = threading.Lock()

dataset_treino: Optional[pd.DataFrame] = None
dataset_validacao: Optional[pd.DataFrame] = None
dataset_teste: Optional[pd.DataFrame] = None

# id_execucao -> { status, epoca_atual, epoca_total, loss_atual, mensagem_erro }
execucoes: dict[str, dict] = {}

# impede duas execuções de treino simultâneas (EC-03 da spec training-api)
treino_em_andamento: bool = False


def get_lock() -> threading.Lock:
    return _lock
