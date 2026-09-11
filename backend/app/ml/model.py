"""Carregamento do modelo base, aplicação de LoRA e geração de texto.

Reimplementação do comportamento documentado em
_reversa_sdd/carregamento-modelo-base/design.md,
_reversa_sdd/aplicacao-lora/design.md e
_reversa_sdd/avaliacao-qualitativa/design.md (extraídos de code.ipynb).
"""
import gc
import threading

import torch
from peft import LoraConfig, TaskType, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer

from app.config import (
    LORA_ALPHA,
    LORA_DROPOUT,
    LORA_R,
    LORA_TARGET_MODULES,
    MAX_NEW_TOKENS,
    MODELO_BASE,
)
from app.ml.data import formatar_prompt


class ModelService:
    """Estado do modelo em memória do processo. Singleton do módulo."""

    def __init__(self):
        self._lock = threading.Lock()
        self.tokenizador = None
        self.modelo_base = None
        self.modelo = None  # PeftModel, após LoRA aplicado
        self.dispositivo = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.tipo_numerico = torch.float16 if self.dispositivo.type == "cuda" else torch.float32
        self.pronto_para_chat = False
        self.checkpoint_ativo: str | None = None

    def carregar_base(self):
        """Garante tokenizador + pesos do modelo base carregados (uma vez só,
        é uma operação cara de rede/GPU). NÃO aplica LoRA — isso é feito
        separadamente em `aplicar_lora_fresca`, chamado a cada novo treino."""
        with self._lock:
            if self.modelo_base is not None:
                return

            self.tokenizador = AutoTokenizer.from_pretrained(MODELO_BASE)
            if self.tokenizador.pad_token is None:
                self.tokenizador.pad_token = self.tokenizador.eos_token

            self.modelo_base = AutoModelForCausalLM.from_pretrained(
                MODELO_BASE, dtype=self.tipo_numerico
            )
            self.modelo_base.config.pad_token_id = self.tokenizador.pad_token_id
            self.modelo_base.to(self.dispositivo)

    def aplicar_lora_fresca(self):
        """Substitui o adaptador LoRA atual por um novo (pesos zerados/aleatórios
        iniciais do PEFT), garantindo que cada clique em "Treinar" comece do
        modelo base limpo, e não continue treinando em cima de um adaptador
        de uma execução anterior."""
        with self._lock:
            if self.modelo_base is None:
                raise RuntimeError("Modelo base ainda não carregado")

            configuracao_lora = LoraConfig(
                r=LORA_R,
                lora_alpha=LORA_ALPHA,
                target_modules=LORA_TARGET_MODULES,
                lora_dropout=LORA_DROPOUT,
                bias="none",
                task_type=TaskType.CAUSAL_LM,
            )
            self.modelo = get_peft_model(self.modelo_base, configuracao_lora)
            self.pronto_para_chat = False

    def liberar(self):
        with self._lock:
            self.modelo = None
            self.modelo_base = None
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    def gerar_resposta(
        self,
        pergunta: str,
        contexto: str = "",
        temperatura: float = 0.8,
        penalidade_repeticao: float = 1.2,
    ) -> str:
        if self.modelo is None or self.tokenizador is None:
            raise RuntimeError("Modelo ainda não carregado")

        prompt = formatar_prompt(pergunta, contexto or "")
        entrada = self.tokenizador(prompt, return_tensors="pt").to(self.dispositivo)
        tamanho_entrada = entrada["input_ids"].shape[1]

        self.modelo.eval()
        self.modelo.config.use_cache = True

        # Amostragem pura por temperatura tende a puxar o modelo de volta para o
        # conhecimento geral do pré-treino (ex.: menciona assuntos aleatórios da
        # web) em vez do estilo mais direto aprendido no fine-tuning. Restringir
        # com top_k/top_p (nucleus sampling) mantém a variação que a temperatura
        # deve trazer, mas sem deixar o modelo "esquecer" o ajuste fino.
        amostragem = temperatura is not None and temperatura > 0
        with torch.inference_mode():
            saida = self.modelo.generate(
                **entrada,
                max_new_tokens=MAX_NEW_TOKENS,
                do_sample=amostragem,
                temperature=temperatura if amostragem else None,
                top_k=50 if amostragem else None,
                top_p=0.92 if amostragem else None,
                repetition_penalty=penalidade_repeticao,
                no_repeat_ngram_size=3,
                eos_token_id=self.tokenizador.eos_token_id,
                pad_token_id=self.tokenizador.pad_token_id,
            )

        novos_tokens = saida[0, tamanho_entrada:]
        return self.tokenizador.decode(novos_tokens, skip_special_tokens=True).strip()


# Singleton do módulo — um único modelo em memória por processo do Backend
model_service = ModelService()
