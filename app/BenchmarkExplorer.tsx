"use client";

import { useMemo, useState } from "react";

type ModelResult = {
  id: string;
  model: string;
  harness: string;
  color: string;
  shape: "circle" | "square" | "diamond" | "triangle" | "hex";
  hollow?: boolean;
  publicScore: number;
  privateScore: number;
  fail2Pass: number;
  pass2Pass: number;
  overall: number;
  issue: number;
  expert: number;
  engineering: number;
  input: number;
  output: number;
};

const MODELS: ModelResult[] = [
  { id: "opus", model: "Claude-Opus-5 (max)", harness: "Claude Code", color: "#ec5b3f", shape: "square", publicScore: 96.64, privateScore: 75.11, fail2Pass: 68.60, pass2Pass: 97.37, overall: 47.90, issue: 38.46, expert: 65.31, engineering: 27.78, input: 7.048, output: 0.110 },
  { id: "deepseek-pro", model: "DeepSeek-V4-Pro (max)", harness: "Claude Code", color: "#f0b429", shape: "diamond", publicScore: 100.00, privateScore: 73.16, fail2Pass: 65.77, pass2Pass: 96.58, overall: 42.02, issue: 26.92, expert: 57.14, engineering: 44.44, input: 0.094, output: 0.092 },
  { id: "kimi", model: "Kimi-K3 (max)", harness: "Kimi Code", color: "#171c20", shape: "triangle", publicScore: 98.32, privateScore: 66.34, fail2Pass: 57.55, pass2Pass: 94.94, overall: 35.29, issue: 25.00, expert: 44.90, engineering: 38.89, input: 4.926, output: 0.060 },
  { id: "glm", model: "GLM-5.2 (max)", harness: "Codex", color: "#d85ba4", shape: "diamond", publicScore: 94.12, privateScore: 63.61, fail2Pass: 53.81, pass2Pass: 97.53, overall: 31.93, issue: 17.31, expert: 46.94, engineering: 33.33, input: 3.345, output: 0.094 },
  { id: "gpt", model: "GPT-5.6-sol (xhigh)", harness: "Codex", color: "#1967d2", shape: "circle", publicScore: 98.32, privateScore: 68.69, fail2Pass: 61.72, pass2Pass: 93.62, overall: 27.73, issue: 17.31, expert: 38.78, engineering: 27.78, input: 3.924, output: 0.039 },
  { id: "nex", model: "Nex N2", harness: "Codex", color: "#49a8d8", shape: "hex", publicScore: 93.28, privateScore: 61.89, fail2Pass: 51.09, pass2Pass: 94.92, overall: 24.37, issue: 11.54, expert: 36.73, engineering: 27.78, input: 8.033, output: 0.136 },
  { id: "deepseek-max", model: "DeepSeek-V4-flash (max)", harness: "Claude Code", color: "#159b76", shape: "triangle", hollow: true, publicScore: 98.32, privateScore: 61.41, fail2Pass: 52.34, pass2Pass: 95.74, overall: 23.53, issue: 19.23, expert: 26.53, engineering: 27.78, input: 21.990, output: 0.156 },
  { id: "deepseek-high", model: "DeepSeek-V4-flash (high)", harness: "Claude Code", color: "#159b76", shape: "triangle", publicScore: 100.00, privateScore: 58.77, fail2Pass: 47.67, pass2Pass: 95.02, overall: 19.33, issue: 11.54, expert: 28.57, engineering: 16.67, input: 7.238, output: 0.164 },
  { id: "qwen", model: "Qwen3.5-397B", harness: "Codex", color: "#d5bd00", shape: "hex", publicScore: 96.64, privateScore: 51.79, fail2Pass: 38.33, pass2Pass: 95.16, overall: 14.29, issue: 5.77, expert: 24.49, engineering: 11.11, input: 6.376, output: 0.031 },
];

const SCORE_COLUMNS = [
  ["publicScore", "Public"], ["privateScore", "Private"], ["fail2Pass", "Fail2Pass"],
  ["pass2Pass", "Pass2Pass"], ["overall", "Overall"], ["issue", "Issue"],
  ["expert", "Expert"], ["engineering", "Engineering"],
] as const;

type ScoreKey = typeof SCORE_COLUMNS[number][0];
type TokenMetric = "input" | "output";

const formatPct = (value: number) => `${value.toFixed(2)}%`;

export function BenchmarkExplorer() {
  const [tokenMetric, setTokenMetric] = useState<TokenMetric>("input");
  const [activeId, setActiveId] = useState<string>(MODELS[0].id);
  const [sortKey, setSortKey] = useState<ScoreKey>("overall");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => [...MODELS].sort((a, b) => {
    const difference = a[sortKey] - b[sortKey];
    return sortDirection === "desc" ? -difference : difference;
  }), [sortDirection, sortKey]);

  const activeModel = MODELS.find((model) => model.id === activeId) ?? MODELS[0];
  const metricMax = tokenMetric === "input" ? 24 : 0.18;
  const ticks = tokenMetric === "input" ? [0, 5, 10, 15, 20] : [0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.18];

  function sortBy(key: ScoreKey) {
    if (key === sortKey) setSortDirection((direction) => direction === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setSortDirection("desc");
    }
  }

  return (
    <>
      <section className="leaderboard-section" aria-labelledby="leaderboard-title">
        <div className="section-heading">
          <div>
            <span className="section-number">01</span>
            <h2 id="leaderboard-title">Leaderboard</h2>
          </div>
          <p>Pass@1 versus mean token consumption per task. Select a point or model to inspect the configuration.</p>
        </div>

        <div className="chart-toolbar">
          <div className="segmented-control" aria-label="Token metric">
            <button className={tokenMetric === "input" ? "active" : ""} onClick={() => setTokenMetric("input")}>Input tokens</button>
            <button className={tokenMetric === "output" ? "active" : ""} onClick={() => setTokenMetric("output")}>Output tokens</button>
          </div>
          <div className="chart-summary" aria-live="polite">
            <span style={{ backgroundColor: activeModel.color }} />
            <strong>{activeModel.model}</strong>
            <span>{formatPct(activeModel.overall)} Pass@1</span>
            <span>{tokenMetric === "input" ? `${activeModel.input.toFixed(3)}M input` : `${activeModel.output.toFixed(3)}M output`}</span>
          </div>
        </div>

        <figure className="interactive-chart">
          <figcaption className="sr-only">Interactive scatter plot of model Pass@1 against mean token use.</figcaption>
          <div className="y-axis-label">Pass@1 (%)</div>
          <div className="y-ticks" aria-hidden="true">
            {[50, 40, 30, 20, 10, 0].map((tick) => <span key={tick}>{tick}</span>)}
          </div>
          <div className="plot-area">
            {[10, 20, 30, 40, 50].map((tick) => <div className="horizontal-grid" key={tick} style={{ bottom: `${(tick / 50) * 100}%` }} />)}
            {MODELS.map((model) => {
              const xValue = model[tokenMetric];
              const xPct = Math.min(100, Math.max(0, (xValue / metricMax) * 100));
              const yPct = (model.overall / 50) * 100;
              const active = activeId === model.id;
              return (
                <button
                  className={`plot-point shape-${model.shape}${model.hollow ? " hollow" : ""}${active ? " selected" : ""}`}
                  style={{ left: `${xPct}%`, bottom: `${yPct}%`, "--point-color": model.color } as React.CSSProperties}
                  key={model.id}
                  onMouseEnter={() => setActiveId(model.id)}
                  onFocus={() => setActiveId(model.id)}
                  onClick={() => setActiveId(model.id)}
                  aria-label={`${model.model}: ${formatPct(model.overall)} Pass at 1, ${xValue.toFixed(3)} million ${tokenMetric} tokens`}
                >
                  <span className="guide-x" aria-hidden="true" />
                  <span className="guide-y" aria-hidden="true" />
                  <span className="point-visual" />
                  <span className={`point-tooltip${xPct > 72 ? " anchor-right" : ""}`}>
                    <strong>{model.model}</strong>
                    <span>{formatPct(model.overall)} · {xValue.toFixed(3)}M</span>
                  </span>
                </button>
              );
            })}
            <div className="x-ticks" aria-hidden="true">
              {ticks.map((tick) => <span key={tick} style={{ left: `${(tick / metricMax) * 100}%` }}>{tick}</span>)}
            </div>
          </div>
          <div className="x-axis-label">Mean {tokenMetric} tokens per task (millions)</div>
        </figure>

        <div className="model-legend" aria-label="Model configurations">
          {MODELS.map((model) => (
            <button key={model.id} className={activeId === model.id ? "active" : ""} onClick={() => setActiveId(model.id)}>
              <span className={`legend-shape shape-${model.shape}${model.hollow ? " hollow" : ""}`} style={{ "--point-color": model.color } as React.CSSProperties} />
              {model.model}
            </button>
          ))}
        </div>
        <p className="chart-note">All configurations are evaluated on the same 119 tasks. Token counts are per-task means; point color and marker identify the model–harness configuration.</p>
      </section>

      <section className="results-section" aria-labelledby="results-title">
        <div className="section-heading">
          <div>
            <span className="section-number">02</span>
            <h2 id="results-title">Model results</h2>
          </div>
          <p>Task-level means from Table 2. Select a score heading to reorder the table.</p>
        </div>

        <div className="table-meta">
          <span>9 configurations</span>
          <span>Sorted by <strong>{SCORE_COLUMNS.find(([key]) => key === sortKey)?.[1]}</strong> {sortDirection === "desc" ? "↓" : "↑"}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col" className="rank-column">Rank</th>
                <th scope="col" className="model-column">LLM</th>
                <th scope="col">Harness</th>
                {SCORE_COLUMNS.map(([key, label]) => (
                  <th scope="col" key={key} className={key === "overall" ? "overall-column" : ""}>
                    <button onClick={() => sortBy(key)} aria-label={`Sort by ${label}`}>
                      {label}<span aria-hidden="true">{sortKey === key ? (sortDirection === "desc" ? " ↓" : " ↑") : ""}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((model, index) => (
                <tr key={model.id} className={activeId === model.id ? "active-row" : ""} onMouseEnter={() => setActiveId(model.id)}>
                  <td className="rank-column"><span className={index < 3 ? "top-rank" : ""}>{String(index + 1).padStart(2, "0")}</span></td>
                  <th scope="row" className="model-column"><button onClick={() => setActiveId(model.id)}>{model.model}</button></th>
                  <td>{model.harness}</td>
                  {SCORE_COLUMNS.map(([key]) => (
                    <td key={key} className={key === "overall" ? "overall-column" : ""}>{formatPct(model[key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="table-note">Pass@1 requires every applicable private test to pass. Issue, Expert, and Engineering report Pass@1 for the three task paradigms.</p>
      </section>
    </>
  );
}
