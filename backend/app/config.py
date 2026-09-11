"""Configuração e constantes do Backend.

Valores de hiperparâmetros padrão espelham os usados no notebook legado
(code.ipynb) para manter o comportamento de referência já validado.
Ver _reversa_sdd/aplicacao-lora/design.md e _reversa_sdd/tokenizacao/design.md.
"""
from pathlib import Path

# Modelo base (mesmo do pipeline legado, não alterar sem revisar as specs)
MODELO_BASE = "pierreguillou/gpt2-small-portuguese"

# Caminho do dataset (arquivo do colega, nunca escrito por este backend)
CAMINHO_DATASET = Path(__file__).resolve().parents[2] / "data" / "negocios.jsonl"

# Tokenização
MAX_LENGTH = 256

# Configuração LoRA (mesma validada no notebook legado)
LORA_R = 8
LORA_ALPHA = 16
LORA_DROPOUT = 0.05
LORA_TARGET_MODULES = ["c_attn"]

# Padrões de hiperparâmetros de treino (pré-preenchidos na UI)
DEFAULT_EPOCAS = 3
DEFAULT_TAXA_APRENDIZADO = 5e-4
DEFAULT_TAMANHO_LOTE = 2
DEFAULT_TEMPERATURA = 0.8
DEFAULT_PENALIDADE_REPETICAO = 1.2

# Geração
MAX_NEW_TOKENS = 80

# CORS: origens permitidas para o Frontend local
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
