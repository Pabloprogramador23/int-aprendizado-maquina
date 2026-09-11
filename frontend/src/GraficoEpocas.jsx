// Gráfico didático clássico de "loss curve": treino x validação por época,
// com eixos, grade, legenda e pontos marcados — o padrão usado em qualquer
// relatório de treino de machine learning.
const COR_TREINO = "oklch(0.75 0.15 55)"; // laranja quente
const COR_VALIDACAO = "oklch(0.72 0.16 292)"; // roxo (accent do app)

export default function GraficoEpocas({ historicoEpocas, lossInicial }) {
  if (!historicoEpocas || historicoEpocas.length === 0) {
    return (
      <div
        style={{
          height: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-dim)",
          fontSize: 12,
        }}
      >
        Aguardando a primeira época terminar…
      </div>
    );
  }

  const pontosValidacao = [
    ...(lossInicial != null ? [{ epoca: 0, valor: lossInicial }] : []),
    ...historicoEpocas.map((h) => ({ epoca: h.epoca, valor: h.loss_validacao })),
  ];
  const pontosTreino = historicoEpocas.map((h) => ({ epoca: h.epoca, valor: h.loss_treino }));

  const largura = 640;
  const altura = 340;
  const margem = { topo: 36, direita: 24, baixo: 44, esquerda: 52 };
  const larguraPlot = largura - margem.esquerda - margem.direita;
  const alturaPlot = altura - margem.topo - margem.baixo;

  const epocaMin = 0;
  const epocaMax = Math.max(...historicoEpocas.map((h) => h.epoca));

  const todosValores = [...pontosValidacao, ...pontosTreino].map((p) => p.valor);
  const valorMin = Math.min(...todosValores);
  const valorMax = Math.max(...todosValores);
  const folga = (valorMax - valorMin) * 0.15 || 0.2;
  const yMin = Math.max(0, valorMin - folga);
  const yMax = valorMax + folga;

  const x = (epoca) =>
    margem.esquerda + (epocaMax > epocaMin ? ((epoca - epocaMin) / (epocaMax - epocaMin)) * larguraPlot : larguraPlot / 2);
  const y = (valor) => margem.topo + (1 - (valor - yMin) / (yMax - yMin)) * alturaPlot;

  const linha = (pontos) => pontos.map((p) => `${x(p.epoca)},${y(p.valor)}`).join(" ");

  const numLinhasGrade = 4;
  const linhasGrade = Array.from({ length: numLinhasGrade + 1 }, (_, i) => {
    const valor = yMin + (i / numLinhasGrade) * (yMax - yMin);
    return { valor, py: y(valor) };
  });

  const epocasEixoX = Array.from({ length: epocaMax - epocaMin + 1 }, (_, i) => epocaMin + i);
  const poucosPontos = pontosValidacao.length <= 6;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 20, justifyContent: "center", fontSize: 12 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: COR_TREINO, display: "inline-block" }} />
          Loss de treino
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: COR_VALIDACAO, display: "inline-block" }} />
          Loss de validação
        </span>
      </div>

      <svg viewBox={`0 0 ${largura} ${altura}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {/* grade horizontal + rótulos do eixo Y */}
        {linhasGrade.map((l, i) => (
          <g key={i}>
            <line
              x1={margem.esquerda}
              x2={largura - margem.direita}
              y1={l.py}
              y2={l.py}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text x={margem.esquerda - 8} y={l.py + 4} textAnchor="end" fontSize="11" fill="var(--text-dim)" fontFamily="monospace">
              {l.valor.toFixed(2)}
            </text>
          </g>
        ))}

        {/* eixo X: rótulos de época */}
        {epocasEixoX.map((e) => (
          <text
            key={e}
            x={x(e)}
            y={altura - margem.baixo + 20}
            textAnchor="middle"
            fontSize="11"
            fill="var(--text-dim)"
            fontFamily="monospace"
          >
            {e === 0 ? "início" : e}
          </text>
        ))}
        <text
          x={margem.esquerda + larguraPlot / 2}
          y={altura - 4}
          textAnchor="middle"
          fontSize="11"
          fill="var(--text-dim)"
        >
          Época
        </text>
        <text
          x={14}
          y={margem.topo + alturaPlot / 2}
          textAnchor="middle"
          fontSize="11"
          fill="var(--text-dim)"
          transform={`rotate(-90, 14, ${margem.topo + alturaPlot / 2})`}
        >
          Loss
        </text>

        {/* linha de validação (inclui o ponto "início", antes do treino) */}
        <polyline points={linha(pontosValidacao)} fill="none" stroke={COR_VALIDACAO} strokeWidth="2.5" strokeLinejoin="round" />
        {pontosValidacao.map((p) => (
          <g key={`v${p.epoca}`}>
            <circle cx={x(p.epoca)} cy={y(p.valor)} r="4" fill={COR_VALIDACAO} />
            {poucosPontos && (
              <text
                x={x(p.epoca)}
                y={y(p.valor) - 12}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill={COR_VALIDACAO}
                fontFamily="monospace"
                style={{ paintOrder: "stroke", stroke: "var(--surface-2)", strokeWidth: 3 }}
              >
                {p.valor.toFixed(3)}
              </text>
            )}
          </g>
        ))}

        {/* linha de treino (só existe a partir da época 1) */}
        <polyline points={linha(pontosTreino)} fill="none" stroke={COR_TREINO} strokeWidth="2.5" strokeLinejoin="round" />
        {pontosTreino.map((p) => (
          <g key={`t${p.epoca}`}>
            <circle cx={x(p.epoca)} cy={y(p.valor)} r="4" fill={COR_TREINO} />
            {poucosPontos && (
              <text
                x={x(p.epoca)}
                y={y(p.valor) + 20}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill={COR_TREINO}
                fontFamily="monospace"
                style={{ paintOrder: "stroke", stroke: "var(--surface-2)", strokeWidth: 3 }}
              >
                {p.valor.toFixed(3)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
