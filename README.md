# Assistente de Negócios — Fine-Tuning GPT-2 com LoRA

Trabalho final de pós-graduação: um assistente conversacional especializado em negócios, construído a partir de um GPT-2 em português ajustado via **LoRA** (fine-tuning eficiente em parâmetros). O projeto tem duas partes:

1. **Pipeline de treino original** (`code.ipynb`) — notebook legado que faz a exploração de dados, preparação, tokenização, aplicação de LoRA, treino e avaliação qualitativa do modelo. É a referência de comportamento validada.
2. **Aplicação web** (`backend/` + `frontend/`) — código novo, separado do notebook, que expõe o mesmo pipeline (carregar dataset, treinar sob demanda, conversar com o modelo treinado) por trás de uma API e uma interface de chat.

> O backend e o frontend **não modificam** `code.ipynb` nem os checkpoints em `modelos/` — são consumidores independentes do mesmo dataset e do mesmo modelo base.

## Arquitetura

```
int-aprendizado-maquina/
├── code.ipynb            # notebook legado (pipeline de treino de referência)
├── data/
│   └── negocios.jsonl    # dataset de perguntas e respostas de negócios
├── modelos/               # checkpoints LoRA já treinados (por época) pelo notebook legado
├── backend/               # API FastAPI (código novo)
│   └── app/
│       ├── main.py
│       ├── config.py
│       └── routers/       # dataset, training, chat
├── frontend/               # interface React + Vite (código novo)
└── venv/                   # ambiente Python compartilhado (notebook + backend)
```

- **Modelo base:** `pierreguillou/gpt2-small-portuguese`
- **Técnica:** LoRA (`r=8`, `alpha=16`, `dropout=0.05`, alvo `c_attn`)
- **Backend:** FastAPI, treina em background (thread separada) e faz o modelo responder via `/chat`
- **Frontend:** React 19 + Vite, consome a API e mostra progresso do treino + chat

## Pré-requisitos

- **Python 3.12** (o projeto usa a `venv/` já criada na raiz, com `torch`, `transformers`, `peft`, `accelerate`, `pandas`, `scikit-learn` já instalados)
- **Node.js 22+** e **npm** (para o frontend)
- Não é necessário GPU — sem GPU disponível, o treino roda em CPU (mais lento, mesmo comportamento do notebook legado)

## Como subir o sistema (passo a passo)

### 1. Backend (FastAPI) — porta 8010

Abra um terminal na raiz do projeto:

```bash
# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

Instale as dependências específicas da API (o resto já está na venv):

```bash
pip install fastapi "uvicorn[standard]" pydantic
```

Entre na pasta do backend e suba o servidor:

```bash
cd backend
uvicorn app.main:app --port 8010
```

> **Importante:** use a porta **8010**, não a 8000. O frontend já está configurado para chamar `http://localhost:8010` (`frontend/src/api.js`) — isso foi um ajuste feito porque a porta 8000 tinha conflito no ambiente de desenvolvimento local.

Se tudo deu certo, você verá:

```
INFO:     Application startup complete.
```

Teste rapidamente em outro terminal:

```bash
curl http://localhost:8010/
# {"status":"ok","servico":"Assistente de Negócios API"}
```

Documentação interativa (Swagger) em `http://localhost:8010/docs`.

### 2. Frontend (React + Vite) — porta 5174

Em **outro terminal**, na raiz do projeto:

```bash
cd frontend
npm install       # só na primeira vez, ou se package.json mudou
npm run dev -- --port 5174
```

> Também aqui, use a porta **5174** (não a padrão 5173) — é a porta liberada no CORS do backend (`CORS_ORIGINS` em `backend/app/config.py`) usada neste ambiente.

Acesse `http://localhost:5174` no navegador.

### 3. Ordem de uso na interface

O fluxo esperado é o mesmo do enunciado do trabalho:

1. **Carregar dataset** — `POST /dataset/carregar` (carrega `data/negocios.jsonl`)
2. **Iniciar treino** — `POST /treino/iniciar` com hiperparâmetros (épocas, taxa de aprendizado, tamanho do lote, temperatura, penalidade de repetição)
3. **Acompanhar progresso** — a interface faz polling em `GET /treino/status/{id_execucao}` até `status: "concluido"`
4. **Conversar** — `POST /chat` envia uma pergunta e recebe a resposta do modelo treinado

## Endpoints da API

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/dataset/carregar` | Carrega `data/negocios.jsonl` |
| `POST` | `/treino/iniciar` | Inicia o treino em background com os hiperparâmetros enviados |
| `GET` | `/treino/status/{id_execucao}` | Consulta progresso do treino |
| `POST` | `/chat` | Envia uma pergunta ao modelo treinado |
| `GET` | `/status` | Verifica se o modelo está pronto para o chat |

Corpo de exemplo para `/treino/iniciar`:

```json
{
  "epocas": 3,
  "taxa_aprendizado": 0.0005,
  "tamanho_lote": 2,
  "temperatura": 0.8,
  "penalidade_repeticao": 1.2
}
```

## Como subir com Docker (opção alternativa)

Em vez de rodar backend e frontend manualmente, você pode usar Docker Compose. Isso builda o backend em Python 3.12 e o frontend como um build estático servido por Nginx.

Pré-requisito: Docker e Docker Compose instalados.

Na raiz do projeto:

```bash
docker compose up --build
```

- Backend fica em `http://localhost:8010`
- Frontend fica em `http://localhost:5174`

Para rodar em segundo plano: `docker compose up --build -d`. Para parar: `docker compose down`.

**Observações:**
- O volume `./data:/code/data:ro` monta o dataset real do projeto (somente leitura) dentro do container.
- `modelos/` (checkpoints do notebook legado) não precisa ser montado — o backend novo treina o adaptador LoRA em memória a cada sessão, sem persistência em disco.
- O build do backend baixa `torch`/`transformers` via pip — a primeira build pode demorar bastante (pacotes grandes) mesmo sem GPU.

## Solução de problemas

- **`[Errno 10048] ... apenas uma utilização de cada endereço de soquete`** — já existe um processo escutando na porta 8010 ou 5174. Encontre e finalize o processo antigo (`netstat -ano | findstr :8010` no Windows) antes de subir de novo.
- **Frontend não conecta ("Não foi possível conectar ao servidor")** — confirme que o backend está rodando em `http://localhost:8010` antes de abrir o frontend.
- **Treino muito lento** — esperado sem GPU; o notebook legado tem o mesmo comportamento em CPU.
- **`ModuleNotFoundError: fastapi` (ou uvicorn/pydantic)** — a venv não tem essas três libs por padrão; rode `pip install fastapi "uvicorn[standard]" pydantic` com a venv ativada.

## Escopo e limitações (por design)

- Aplicação de demonstração de sessão única: **sem autenticação** e **sem persistência em banco de dados**
- Sem deploy em nuvem — uso local apenas
- O backend nunca escreve em `data/negocios.jsonl` (dataset é somente leitura) nem em `code.ipynb`

Especificações completas do sistema (requisitos, arquitetura, decisões técnicas) estão em `_reversa_sdd/`.
