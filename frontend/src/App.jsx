import { useEffect, useRef, useState } from "react";
import {
  carregarBase,
  enviarPergunta,
  iniciarTreino,
  statusModelo,
  statusTreino,
  sugestoesTeste,
} from "./api";
import GraficoEpocas from "./GraficoEpocas";

const HIPERPARAMETROS_PADRAO = {
  epocas: 3,
  taxa_aprendizado: 0.0005,
  tamanho_lote: 2,
  temperatura: 0.8,
  penalidade_repeticao: 1.2,
};

function Badge({ tom, children }) {
  const cores = {
    boa: { bg: "rgba(120,200,150,0.12)", cor: "var(--good)" },
    erro: { bg: "rgba(220,90,80,0.12)", cor: "var(--bad)" },
    neutra: { bg: "var(--surface-2)", cor: "var(--text-dim)" },
  };
  const c = cores[tom] ?? cores.neutra;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 100,
        background: c.bg,
        color: c.cor,
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

function Secao({ numero, titulo, subtitulo, children }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "24px 28px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "var(--accent-dim)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontFamily: "JetBrains Mono, monospace",
              fontWeight: 600,
              color: "var(--accent)",
            }}
          >
            {numero}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{titulo}</div>
            {subtitulo && (
              <div className="mono" style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}>
                {subtitulo}
              </div>
            )}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function CampoHiperparametro({ label, valor, onChange, step, min }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</label>
      <input
        className="mono"
        type="number"
        value={valor}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "12px 14px",
          fontSize: 16,
          fontWeight: 600,
        }}
      />
    </div>
  );
}

function TelaTreino({ hiperparametros, setHiperparametros, onTreinoConcluido }) {
  const [baseStatus, setBaseStatus] = useState("nao_carregada"); // nao_carregada | carregando | carregada | erro
  const [baseInfo, setBaseInfo] = useState(null);
  const [erroBase, setErroBase] = useState(null);

  const [treino, setTreino] = useState({ status: "idle" }); // idle | pendente | em_andamento | concluido | erro
  const [erroTreino, setErroTreino] = useState(null);
  const pollRef = useRef(null);

  async function handleCarregarBase() {
    setBaseStatus("carregando");
    setErroBase(null);
    try {
      const info = await carregarBase();
      setBaseInfo(info);
      setBaseStatus("carregada");
    } catch (e) {
      setErroBase(e.message);
      setBaseStatus("erro");
    }
  }

  async function handleTreinar() {
    setErroTreino(null);
    try {
      const { id_execucao } = await iniciarTreino(hiperparametros);
      setTreino({ status: "pendente", id_execucao, epoca_atual: 0, epoca_total: hiperparametros.epocas });

      pollRef.current = setInterval(async () => {
        try {
          const s = await statusTreino(id_execucao);
          setTreino(s);
          if (s.status === "concluido") {
            clearInterval(pollRef.current);
            onTreinoConcluido();
          }
          if (s.status === "erro") {
            clearInterval(pollRef.current);
            setErroTreino(s.mensagem_erro);
          }
        } catch (e) {
          clearInterval(pollRef.current);
          setErroTreino(e.message);
        }
      }, 1200);
    } catch (e) {
      setErroTreino(e.message);
    }
  }

  useEffect(() => () => clearInterval(pollRef.current), []);

  const treinando = treino.status === "pendente" || treino.status === "em_andamento";
  const progresso =
    treino.epoca_total > 0 ? Math.round((treino.epoca_atual / treino.epoca_total) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <Secao numero="1" titulo="Base de dados" subtitulo="negocios.jsonl">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="mono" style={{ fontSize: 13, color: "var(--text-dim)" }}>
            {baseInfo
              ? `${baseInfo.total_exemplos} exemplos · ${baseInfo.proporcao_input_vazio_pct}% sem contexto`
              : "Carregar base para começar"}
          </div>
          {baseStatus === "carregada" ? (
            <Badge tom="boa">Carregada</Badge>
          ) : baseStatus === "erro" ? (
            <Badge tom="erro">Erro</Badge>
          ) : (
            <button
              onClick={handleCarregarBase}
              disabled={baseStatus === "carregando"}
              style={estiloBotaoSecundario}
            >
              {baseStatus === "carregando" ? "Carregando…" : "Carregar base"}
            </button>
          )}
        </div>
        {erroBase && <div style={{ color: "var(--bad)", fontSize: 13 }}>{erroBase}</div>}

        {baseInfo && (
          <div
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "14px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>
              Limpeza automática aplicada antes do treino
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", fontSize: 13 }}>
              <span>
                <strong>{baseInfo.total_original}</strong> exemplos originais
              </span>
              <span>
                <strong style={{ color: baseInfo.duplicatas_removidas > 0 ? "var(--bad)" : "var(--good)" }}>
                  {baseInfo.duplicatas_removidas}
                </strong>{" "}
                duplicados removidos
              </span>
              <span>
                <strong style={{ color: baseInfo.vazios_removidos > 0 ? "var(--bad)" : "var(--good)" }}>
                  {baseInfo.vazios_removidos}
                </strong>{" "}
                com campo essencial vazio
              </span>
              <span>
                <strong style={{ color: baseInfo.respostas_curtas_removidas > 0 ? "var(--bad)" : "var(--good)" }}>
                  {baseInfo.respostas_curtas_removidas}
                </strong>{" "}
                respostas curtas demais (&lt; {baseInfo.limite_min_resposta_chars} caracteres)
              </span>
              <span style={{ color: "var(--text-dim)" }}>
                → <strong style={{ color: "var(--text)" }}>{baseInfo.total_exemplos}</strong> exemplos limpos
              </span>
            </div>
            <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>
              Split: <strong style={{ color: "var(--text)" }}>{baseInfo.total_treino}</strong> treino ·{" "}
              <strong style={{ color: "var(--text)" }}>{baseInfo.total_validacao}</strong> validação ·{" "}
              <strong style={{ color: "var(--text)" }}>{baseInfo.total_teste}</strong> teste (80/10/10, nunca usado no treino)
            </div>
          </div>
        )}
      </Secao>

      <Secao numero="2" titulo="Hiperparâmetros">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
          <CampoHiperparametro
            label="Épocas"
            valor={hiperparametros.epocas}
            step={1}
            min={1}
            onChange={(v) => setHiperparametros((h) => ({ ...h, epocas: v }))}
          />
          <CampoHiperparametro
            label="Taxa de aprendizado"
            valor={hiperparametros.taxa_aprendizado}
            step={0.0001}
            min={0.00001}
            onChange={(v) => setHiperparametros((h) => ({ ...h, taxa_aprendizado: v }))}
          />
          <CampoHiperparametro
            label="Tamanho do lote"
            valor={hiperparametros.tamanho_lote}
            step={1}
            min={1}
            onChange={(v) => setHiperparametros((h) => ({ ...h, tamanho_lote: v }))}
          />
          <CampoHiperparametro
            label="Temperatura"
            valor={hiperparametros.temperatura}
            step={0.1}
            min={0.1}
            onChange={(v) => setHiperparametros((h) => ({ ...h, temperatura: v }))}
          />
          <CampoHiperparametro
            label="Penalidade de repetição"
            valor={hiperparametros.penalidade_repeticao}
            step={0.1}
            min={1}
            onChange={(v) => setHiperparametros((h) => ({ ...h, penalidade_repeticao: v }))}
          />
        </div>
      </Secao>

      <Secao numero="3" titulo="Treinar">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="mono" style={{ fontSize: 13, color: "var(--text-dim)" }}>
            {treino.status === "concluido"
              ? `Modelo treinado, loss final ${treino.loss_atual}`
              : treinando
                ? `Época ${treino.epoca_atual} de ${treino.epoca_total}`
                : "Pronto para treinar"}
          </div>
          <button
            onClick={handleTreinar}
            disabled={baseStatus !== "carregada" || treinando}
            style={estiloBotaoPrimario(baseStatus !== "carregada" || treinando)}
          >
            {treinando ? "Treinando…" : treino.status === "concluido" ? "Retreinar" : "Treinar"}
          </button>
        </div>

        {(treinando || treino.status === "concluido") && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ height: 8, borderRadius: 100, background: "var(--surface-2)", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${treino.status === "concluido" ? 100 : progresso}%`,
                    background: "var(--accent)",
                    borderRadius: 100,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              {treino.loss_atual != null && (
                <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  loss de validação (época {treino.epoca_atual}): {treino.loss_atual}
                </div>
              )}
            </div>

            <div
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "16px 18px",
              }}
            >
              <GraficoEpocas historicoEpocas={treino.historico_epocas} lossInicial={treino.loss_validacao_inicial} />
            </div>

            {treino.historico_epocas?.length > 0 && (
              <div
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "16px 18px",
                  overflowX: "auto",
                }}
              >
                <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
                  loss por época (treino x validação) e perplexidade
                </div>
                <table className="mono" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "var(--text-dim)", textAlign: "left" }}>
                      <th style={{ padding: "4px 8px 8px 0", fontWeight: 500 }}>Época</th>
                      <th style={{ padding: "4px 8px 8px 0", fontWeight: 500 }}>Loss treino</th>
                      <th style={{ padding: "4px 8px 8px 0", fontWeight: 500 }}>Loss validação</th>
                      <th style={{ padding: "4px 8px 8px 0", fontWeight: 500 }}>Perplexidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {treino.historico_epocas.map((h) => (
                      <tr key={h.epoca} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "6px 8px 6px 0" }}>{h.epoca}</td>
                        <td style={{ padding: "6px 8px 6px 0" }}>{h.loss_treino}</td>
                        <td style={{ padding: "6px 8px 6px 0", color: "var(--text)", fontWeight: 600 }}>
                          {h.loss_validacao}
                        </td>
                        <td style={{ padding: "6px 8px 6px 0", color: "var(--accent)" }}>
                          {h.perplexidade_validacao}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {treino.status === "concluido" && treino.loss_teste != null && (
              <div
                style={{
                  background: "rgba(120,200,150,0.08)",
                  border: "1px solid rgba(120,200,150,0.25)",
                  borderRadius: 12,
                  padding: "16px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div className="mono" style={{ fontSize: 12, color: "var(--good)" }}>
                  avaliação final — conjunto de teste (118 exemplos, nunca vistos no treino)
                </div>
                <div style={{ display: "flex", gap: 24, fontSize: 13 }}>
                  <span>
                    loss de teste: <strong style={{ color: "var(--text)" }}>{treino.loss_teste}</strong>
                  </span>
                  <span>
                    perplexidade: <strong style={{ color: "var(--text)" }}>{treino.perplexidade_teste}</strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {erroTreino && <div style={{ color: "var(--bad)", fontSize: 13 }}>{erroTreino}</div>}
      </Secao>
    </div>
  );
}

function TelaChat({ modeloPronto, hiperparametros }) {
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [sugestoes, setSugestoes] = useState([]);

  useEffect(() => {
    if (!modeloPronto) return;
    sugestoesTeste()
      .then((r) => setSugestoes(r.sugestoes))
      .catch(() => setSugestoes([]));
  }, [modeloPronto]);

  async function enviarTexto(pergunta) {
    if (!pergunta.trim() || enviando) return;

    setMensagens((m) => [...m, { autor: "usuario", texto: pergunta }]);
    setTexto("");
    setEnviando(true);
    setErro(null);

    try {
      const { resposta } = await enviarPergunta({
        pergunta,
        temperatura: hiperparametros.temperatura,
        penalidade_repeticao: hiperparametros.penalidade_repeticao,
      });
      setMensagens((m) => [...m, { autor: "modelo", texto: resposta }]);
    } catch (e2) {
      setErro(e2.message);
    } finally {
      setEnviando(false);
    }
  }

  function handleEnviar(e) {
    e.preventDefault();
    enviarTexto(texto.trim());
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div style={{ flex: 1, padding: 24, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        {mensagens.length === 0 && (
          <div style={{ margin: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 18, maxWidth: 440 }}>
            <div style={{ color: "var(--text-dim)", fontSize: 14, textAlign: "center" }}>
              {modeloPronto ? "Faça uma pergunta ao modelo." : "Aguardando o treino terminar…"}
            </div>
            {modeloPronto && sugestoes.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                <div className="mono" style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "center" }}>
                  sugestões do conjunto de teste (nunca visto no treino)
                </div>
                {sugestoes.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => enviarTexto(s.pergunta)}
                    disabled={enviando}
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "10px 14px",
                      fontSize: 13,
                      color: "var(--text)",
                      textAlign: "left",
                      cursor: enviando ? "not-allowed" : "pointer",
                    }}
                  >
                    {s.pergunta}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {mensagens.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.autor === "usuario" ? "flex-end" : "flex-start",
              maxWidth: "78%",
              background: m.autor === "usuario" ? "var(--accent)" : "var(--surface-2)",
              color: m.autor === "usuario" ? "#0d0f14" : "var(--text)",
              padding: "12px 16px",
              borderRadius: m.autor === "usuario" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              fontSize: 14,
              lineHeight: 1.5,
              border: m.autor === "usuario" ? "none" : "1px solid var(--border)",
            }}
          >
            {m.texto}
          </div>
        ))}
        {enviando && (
          <div
            style={{
              alignSelf: "flex-start",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              padding: "14px 18px",
              borderRadius: "16px 16px 16px 4px",
              color: "var(--text-dim)",
              fontSize: 13,
            }}
          >
            digitando…
          </div>
        )}
      </div>

      {erro && <div style={{ color: "var(--bad)", fontSize: 13, padding: "0 20px 12px" }}>{erro}</div>}

      <form
        onSubmit={handleEnviar}
        style={{ padding: "16px 20px 22px", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}
      >
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={!modeloPronto}
          placeholder={modeloPronto ? "Digite sua pergunta…" : "Aguarde o treino terminar"}
          style={{
            flex: 1,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 100,
            padding: "13px 18px",
            fontSize: 14,
          }}
        />
        <button
          type="submit"
          disabled={!modeloPronto || enviando}
          style={estiloBotaoPrimario(!modeloPronto || enviando, { borderRadius: "50%", width: 44, height: 44, padding: 0 })}
        >
          →
        </button>
      </form>
    </div>
  );
}

const estiloBotaoPrimario = (desabilitado, extra = {}) => ({
  background: desabilitado ? "var(--surface-2)" : "var(--accent)",
  color: desabilitado ? "var(--text-dim)" : "#0d0f14",
  border: "none",
  borderRadius: 10,
  padding: "12px 24px",
  fontSize: 14,
  fontWeight: 700,
  cursor: desabilitado ? "not-allowed" : "pointer",
  ...extra,
});

const estiloBotaoSecundario = {
  background: "transparent",
  color: "var(--accent)",
  border: "1px solid var(--accent)",
  borderRadius: 10,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

export default function App() {
  const [aba, setAba] = useState("treino");
  const [hiperparametros, setHiperparametros] = useState(HIPERPARAMETROS_PADRAO);
  const [modeloPronto, setModeloPronto] = useState(false);
  const [backendOnline, setBackendOnline] = useState(true);

  useEffect(() => {
    statusModelo()
      .then((s) => setModeloPronto(s.modelo_pronto))
      .catch(() => setBackendOnline(false));
  }, []);

  return (
    <div
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "40px 24px 64px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
        minHeight: "100vh",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)" }}>
            Assistente de Negócios
          </div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Console de Treino</div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setAba("treino")}
            style={{ ...estiloAba, ...(aba === "treino" ? estiloAbaAtiva : {}) }}
          >
            Treino
          </button>
          <button onClick={() => setAba("chat")} style={{ ...estiloAba, ...(aba === "chat" ? estiloAbaAtiva : {}) }}>
            Chat
          </button>
        </div>
      </div>

      {!backendOnline && (
        <div style={{ background: "rgba(220,90,80,0.12)", border: "1px solid var(--bad)", borderRadius: 12, padding: 16, color: "var(--bad)" }}>
          Não foi possível conectar ao servidor. Verifique se o Backend está rodando em http://localhost:8010.
        </div>
      )}

      {/* Os dois ficam sempre montados (só escondidos por CSS) — trocar de aba
          não pode desmontar a tela de treino, senão o polling do progresso
          para e o histórico se perde no meio de um treino em andamento. */}
      <div style={{ display: aba === "treino" ? "block" : "none" }}>
        <TelaTreino
          hiperparametros={hiperparametros}
          setHiperparametros={setHiperparametros}
          onTreinoConcluido={() => setModeloPronto(true)}
        />
      </div>
      <div style={{ display: aba === "chat" ? "block" : "none", flex: 1, minHeight: 560 }}>
        <TelaChat modeloPronto={modeloPronto} hiperparametros={hiperparametros} />
      </div>
    </div>
  );
}

const estiloAba = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--text-dim)",
  borderRadius: 10,
  padding: "10px 18px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const estiloAbaAtiva = {
  background: "var(--accent-dim)",
  color: "var(--accent)",
  border: "1px solid var(--accent)",
};
