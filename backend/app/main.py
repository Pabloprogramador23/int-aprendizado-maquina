"""Ponto de entrada do Backend (FastAPI).

Servidor local de demonstração — sem autenticação, sem deploy em nuvem
(fora de escopo, ver _reversa_sdd/prd.md seção 5).
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.routers import chat, dataset, training

app = FastAPI(
    title="Assistente de Negócios — API",
    description="Backend do trabalho final: carrega base, treina LoRA sob demanda e serve chat.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dataset.router)
app.include_router(training.router)
app.include_router(chat.router)


@app.get("/")
def raiz():
    return {"status": "ok", "servico": "Assistente de Negócios API"}
