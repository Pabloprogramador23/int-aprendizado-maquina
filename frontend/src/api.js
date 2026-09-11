// Cliente da API do Backend. Ver ../../_reversa_sdd/sdd/training-api.md e inference-api.md
const BASE_URL = "http://localhost:8010";

async function requisicao(caminho, opcoes = {}) {
  const resposta = await fetch(`${BASE_URL}${caminho}`, {
    headers: { "Content-Type": "application/json" },
    ...opcoes,
  });

  if (!resposta.ok) {
    let detalhe = `Erro ${resposta.status}`;
    try {
      const corpo = await resposta.json();
      detalhe = corpo.detail || detalhe;
    } catch {
      // corpo sem JSON, mantém mensagem padrão
    }
    throw new Error(detalhe);
  }

  return resposta.json();
}

export function carregarBase() {
  return requisicao("/dataset/carregar", { method: "POST" });
}

export function sugestoesTeste() {
  return requisicao("/dataset/sugestoes-teste");
}

export function iniciarTreino({ epocas, taxa_aprendizado, tamanho_lote, temperatura }) {
  return requisicao("/treino/iniciar", {
    method: "POST",
    body: JSON.stringify({ epocas, taxa_aprendizado, tamanho_lote, temperatura }),
  });
}

export function statusTreino(idExecucao) {
  return requisicao(`/treino/status/${idExecucao}`);
}

export function statusModelo() {
  return requisicao("/status");
}

export function enviarPergunta({ pergunta, contexto, temperatura, penalidade_repeticao }) {
  return requisicao("/chat", {
    method: "POST",
    body: JSON.stringify({ pergunta, contexto, temperatura, penalidade_repeticao }),
  });
}
