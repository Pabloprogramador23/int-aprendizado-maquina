# Backend — Assistente de Negócios

API em FastAPI que carrega a base de Negócios, treina um adaptador LoRA sob demanda (GPT-2 em português) e serve um chat com o modelo treinado. Ver especificações completas em `../_reversa_sdd/sdd/training-api.md` e `../_reversa_sdd/sdd/inference-api.md`.

Este backend é código novo, separado do pipeline original em `../code.ipynb` — não modifica esse notebook nem os checkpoints em `../modelos/`.

## Como rodar

Recomendado: use o mesmo `venv` já existente na raiz do projeto (já tem `torch`, `transformers`, `peft`, `accelerate`, `pandas`, `scikit-learn` instalados). Só falta instalar as dependências específicas da API:

```bash
# a partir da raiz do projeto (int-aprendizado-maquina/)
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac

pip install fastapi "uvicorn[standard]" pydantic
```

Ou, para um ambiente novo do zero:

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Rodar o servidor (a partir da pasta `backend/`):

```bash
uvicorn app.main:app --reload --port 8000
```

A API sobe em `http://localhost:8000`. Documentação interativa automática em `http://localhost:8000/docs`.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/dataset/carregar` | Carrega `data/negocios.jsonl` |
| `POST` | `/treino/iniciar` | Inicia o treino em background com os hiperparâmetros enviados |
| `GET` | `/treino/status/{id_execucao}` | Consulta progresso do treino |
| `POST` | `/chat` | Envia uma pergunta ao modelo treinado |
| `GET` | `/status` | Verifica se o modelo está pronto para o chat |

## Fluxo esperado (mesma ordem do enunciado do trabalho)

1. `POST /dataset/carregar`
2. `POST /treino/iniciar` com `{ "epocas": 3, "taxa_aprendizado": 0.0005, "tamanho_lote": 2, "temperatura": 0.8 }`
3. Consultar `GET /treino/status/{id_execucao}` periodicamente até `status: "concluido"`
4. `POST /chat` com `{ "pergunta": "..." }`

## Observações

- O treino roda em background (thread separada) para não bloquear a API — o Frontend deve fazer polling no endpoint de status.
- Sem GPU disponível, o treino roda em CPU (mais lento, mesmo comportamento do notebook legado).
- Sem autenticação, sem persistência em banco de dados — aplicação de demonstração de sessão única (ver `_reversa_sdd/prd.md`, seção 5, Não-objetivos).
