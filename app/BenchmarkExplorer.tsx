"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ScatterShapeProps, TooltipContentProps } from "recharts";

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
  { id: "opus", model: "Claude-Opus-5 (max)", harness: "Claude Code", color: "#ec5b3f", shape: "circle", publicScore: 96.64, privateScore: 75.11, fail2Pass: 68.60, pass2Pass: 97.37, overall: 47.90, issue: 38.46, expert: 65.31, engineering: 27.78, input: 7.048, output: 0.110 },
  { id: "deepseek-pro", model: "DeepSeek-V4-Pro (max)", harness: "Claude Code", color: "#f0a202", shape: "circle", publicScore: 100.00, privateScore: 73.16, fail2Pass: 65.77, pass2Pass: 96.58, overall: 42.02, issue: 26.92, expert: 57.14, engineering: 44.44, input: 11.430, output: 0.092 },
  { id: "kimi", model: "Kimi-K3 (max)", harness: "Kimi Code", color: "#7c3aed", shape: "circle", publicScore: 98.32, privateScore: 66.34, fail2Pass: 57.55, pass2Pass: 94.94, overall: 35.29, issue: 25.00, expert: 44.90, engineering: 38.89, input: 4.926, output: 0.060 },
  { id: "glm", model: "GLM-5.2 (max)", harness: "Codex", color: "#d83c91", shape: "circle", publicScore: 94.12, privateScore: 63.61, fail2Pass: 53.81, pass2Pass: 97.53, overall: 31.93, issue: 17.31, expert: 46.94, engineering: 33.33, input: 3.345, output: 0.094 },
  { id: "gpt", model: "GPT-5.6-sol (max)", harness: "Codex", color: "#1967d2", shape: "circle", publicScore: 99.16, privateScore: 78.82, fail2Pass: 72.30, pass2Pass: 97.66, overall: 46.22, issue: 36.54, expert: 59.18, engineering: 38.89, input: 4.199, output: 0.025 },
  { id: "nex", model: "Nex N2", harness: "Codex", color: "#0ea5b7", shape: "circle", publicScore: 93.28, privateScore: 61.89, fail2Pass: 51.09, pass2Pass: 94.92, overall: 24.37, issue: 11.54, expert: 36.73, engineering: 27.78, input: 8.033, output: 0.136 },
  { id: "deepseek-max", model: "DeepSeek-V4-flash (max)", harness: "Claude Code", color: "#159b76", shape: "circle", publicScore: 98.32, privateScore: 61.41, fail2Pass: 52.34, pass2Pass: 95.74, overall: 23.53, issue: 19.23, expert: 26.53, engineering: 27.78, input: 21.990, output: 0.156 },
  { id: "deepseek-high", model: "DeepSeek-V4-flash (high)", harness: "Claude Code", color: "#159b76", shape: "circle", publicScore: 100.00, privateScore: 58.77, fail2Pass: 47.67, pass2Pass: 95.02, overall: 19.33, issue: 11.54, expert: 28.57, engineering: 16.67, input: 7.238, output: 0.164 },
  { id: "qwen", model: "Qwen3.5-397B", harness: "Codex", color: "#d97706", shape: "circle", publicScore: 96.64, privateScore: 51.79, fail2Pass: 38.33, pass2Pass: 95.16, overall: 14.29, issue: 5.77, expert: 24.49, engineering: 11.11, input: 6.376, output: 0.031 },
];

const DEPTH_CONNECTIONS = [
  { from: "deepseek-high", to: "deepseek-max" },
] as const;

const getModelFamily = (modelName: string) => modelName.replace(/\s*\((?:xhigh|high|max)\)$/, "");
const getReasoningDepth = (modelName: string) => modelName.match(/\((xhigh|high|max)\)$/)?.[1] ?? "default";

const SCORE_COLUMNS = [
  ["publicScore", "Public"], ["privateScore", "Private"], ["fail2Pass", "Fail2Pass"],
  ["pass2Pass", "Pass2Pass"], ["overall", "Overall"], ["issue", "Issue"],
  ["expert", "Expert"], ["engineering", "Engineering"],
] as const;

type ScoreKey = typeof SCORE_COLUMNS[number][0];
type SortKey = ScoreKey | "model" | "harness";
type TokenMetric = "input" | "output";
type ChartStyle = "paper" | "console";

const SORT_OPTIONS: ReadonlyArray<readonly [SortKey, string]> = [
  ["model", "LLM"], ["harness", "Harness"],
  ...SCORE_COLUMNS,
];

const formatPct = (value: number) => `${value.toFixed(2)}%`;

type ChartDatum = ModelResult & {
  x: number;
  y: number;
  family: string;
  depth: string;
};

type LabelPlacement = {
  dx: number;
  dy: number;
  anchor: "start" | "middle" | "end";
};

type LabelBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function overlapArea(first: LabelBox, second: LabelBox) {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  return width * height;
}

function createLabelLayout(data: ChartDatum[], metricMax: number, chartWidth: number) {
  const compact = chartWidth <= 520;
  const chartHeight = chartWidth <= 800 ? 400 : 470;
  const plotLeft = 62;
  const plotRight = Math.max(plotLeft + 180, chartWidth - 22);
  const plotTop = 22;
  const plotBottom = chartHeight - 72;
  const fontFactor = compact ? 5.3 : 6.35;
  const labelHeight = compact ? 13 : 15;

  const points = data.map((datum) => ({
    datum,
    x: plotLeft + (datum.x / metricMax) * (plotRight - plotLeft),
    y: plotTop + (1 - datum.y / 50) * (plotBottom - plotTop),
    width: datum.family.length * fontFactor + datum.depth.length * (compact ? 4.3 : 5) + 12,
  }));

  const pointBoxes = points.map(({ datum, x, y }) => ({
    id: datum.id,
    left: x - 13,
    right: x + 13,
    top: y - 13,
    bottom: y + 13,
  }));
  const placed: LabelBox[] = [];
  const layout: Record<string, LabelPlacement> = {};

  [...points].sort((a, b) => b.width - a.width).forEach(({ datum, x, y, width }) => {
    const preferLeft = datum.x / metricMax > 0.64;
    const preferBelow = datum.y / 50 > 0.82;
    const horizontal = preferLeft
      ? [{ dx: -10, anchor: "end" as const }, { dx: 10, anchor: "start" as const }]
      : [{ dx: 10, anchor: "start" as const }, { dx: -10, anchor: "end" as const }];
    const vertical = preferBelow ? [18, -11] : [-11, 18];
    const candidates: LabelPlacement[] = [
      { ...horizontal[0], dy: vertical[0] },
      { ...horizontal[1], dy: vertical[0] },
      { ...horizontal[0], dy: vertical[1] },
      { ...horizontal[1], dy: vertical[1] },
      { dx: 0, dy: preferBelow ? 29 : -22, anchor: "middle" },
      { dx: 0, dy: preferBelow ? -22 : 29, anchor: "middle" },
      { ...horizontal[0], dy: preferBelow ? 37 : -30 },
      { ...horizontal[1], dy: preferBelow ? -30 : 37 },
    ];

    const evaluated = candidates.map((candidate, priority) => {
      const labelX = x + candidate.dx;
      const left = candidate.anchor === "start" ? labelX : candidate.anchor === "end" ? labelX - width : labelX - width / 2;
      const box: LabelBox = {
        left,
        right: left + width,
        top: y + candidate.dy - labelHeight,
        bottom: y + candidate.dy + 2,
      };
      const labelCollision = placed.reduce((total, other) => total + overlapArea(box, other), 0);
      const pointCollision = pointBoxes.reduce((total, other) => {
        if (other.id === datum.id) return total;
        return total + overlapArea(box, other);
      }, 0);
      const overflow = Math.max(0, 8 - box.left)
        + Math.max(0, box.right - (chartWidth - 8))
        + Math.max(0, 6 - box.top)
        + Math.max(0, box.bottom - (plotBottom + 22));
      const score = labelCollision * 120 + pointCollision * 45 + overflow * 1000 + priority;
      return { candidate, box, score };
    });

    const best = evaluated.reduce((current, option) => option.score < current.score ? option : current);
    layout[datum.id] = best.candidate;
    placed.push(best.box);
  });

  return layout;
}

function ChartTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload as ChartDatum;

  return (
    <div className="chart-tooltip">
      <strong>{datum.model}</strong>
      <span>{formatPct(datum.overall)} · {datum.x.toFixed(3)}M</span>
    </div>
  );
}

export function BenchmarkExplorer() {
  const [tokenMetric, setTokenMetric] = useState<TokenMetric>("input");
  const [activeId, setActiveId] = useState<string>(MODELS[0].id);
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [chartStyle, setChartStyle] = useState<ChartStyle>("paper");
  const [chartWidth, setChartWidth] = useState(960);
  const chartRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const observer = new ResizeObserver(([entry]) => {
      setChartWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);

  const sorted = useMemo(() => [...MODELS].sort((a, b) => {
    const leftValue = a[sortKey];
    const rightValue = b[sortKey];
    const difference = typeof leftValue === "string"
      ? leftValue.localeCompare(String(rightValue))
      : leftValue - Number(rightValue);
    return sortDirection === "desc" ? -difference : difference;
  }), [sortDirection, sortKey]);

  const activeModel = MODELS.find((model) => model.id === activeId) ?? MODELS[0];
  const isConsoleChart = chartStyle === "console";
  const chartColors = { grid: "var(--chart-grid)", axis: "var(--chart-axis)", text: "var(--chart-text)", pointSurface: "var(--surface)", label: "var(--ink)" };
  const metricMax = tokenMetric === "input" ? 24 : 0.18;
  const ticks = tokenMetric === "input" ? [0, 5, 10, 15, 20] : [0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.18];
  const chartData = useMemo<ChartDatum[]>(() => MODELS.map((model) => {
    const family = getModelFamily(model.model);
    return {
      ...model,
      x: model[tokenMetric],
      y: model.overall,
      family,
      depth: getReasoningDepth(model.model),
    };
  }), [tokenMetric]);
  const labelLayout = useMemo(() => createLabelLayout(chartData, metricMax, chartWidth), [chartData, chartWidth, metricMax]);

  function renderPoint(props: ScatterShapeProps) {
    const datum = props.payload as ChartDatum;
    const { cx, cy } = props;
    if (cx == null || cy == null) return null;

    const selected = activeId === datum.id || props.isActive;
    const placement = labelLayout[datum.id] ?? { dx: 9, dy: -11, anchor: "start" as const };
    const labelX = cx + placement.dx;
    const labelY = cy + placement.dy;

    return (
      <g className={`chart-point${selected ? " selected" : ""}`} style={{ color: datum.color }}>
        <circle className="chart-point-hit" cx={cx} cy={cy} r={15} />
        <circle className="chart-point-halo" cx={cx} cy={cy} r={selected ? 13 : 9} fill={datum.color} />
        <circle className="chart-point-ring" cx={cx} cy={cy} r={selected ? 8 : 6} fill={chartColors.pointSurface} stroke={datum.color} strokeWidth={1.5} />
        <circle className="chart-point-core" cx={cx} cy={cy} r={selected ? 5.5 : 4} fill={datum.color} />
        <text className="chart-point-label" x={labelX} y={labelY} fill={chartColors.label} textAnchor={placement.anchor} aria-hidden="true">
          {datum.family}
          <tspan className="chart-point-depth" dx={4} fill={datum.color}>{datum.depth}</tspan>
        </text>
      </g>
    );
  }

  function sortBy(key: SortKey) {
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
          <p><time className="updated-at" dateTime="2026-08-16">Updated Aug 16, 2026</time>Pass@1 versus mean token consumption per task. Select a point or model to inspect the configuration.</p>
        </div>

        <div className="chart-toolbar">
          <div className="chart-controls">
            <div className="segmented-control" aria-label="Token metric">
              <button className={tokenMetric === "input" ? "active" : ""} onClick={() => setTokenMetric("input")}>Input tokens</button>
              <button className={tokenMetric === "output" ? "active" : ""} onClick={() => setTokenMetric("output")}>Output tokens</button>
            </div>
            <div className="segmented-control chart-style-toggle" aria-label="Chart appearance">
              <button className={chartStyle === "paper" ? "active" : ""} onClick={() => setChartStyle("paper")} aria-pressed={chartStyle === "paper"}>Paper</button>
              <button className={chartStyle === "console" ? "active" : ""} onClick={() => setChartStyle("console")} aria-pressed={chartStyle === "console"}>Console</button>
            </div>
          </div>
          <div className="chart-summary" aria-live="polite">
            <span style={{ backgroundColor: activeModel.color }} />
            <strong>{activeModel.model}</strong>
            <span>{formatPct(activeModel.overall)} Pass@1</span>
            <span>{tokenMetric === "input" ? `${activeModel.input.toFixed(3)}M input` : `${activeModel.output.toFixed(3)}M output`}</span>
          </div>
        </div>

        <figure ref={chartRef} className={`interactive-chart chart-${chartStyle}`} onMouseDown={(event) => event.preventDefault()}>
          <figcaption className="sr-only">Interactive scatter plot of model Pass@1 against mean token use.</figcaption>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart accessibilityLayer={false} margin={{ top: 22, right: 14, bottom: 8, left: 0 }}>
              <CartesianGrid vertical={isConsoleChart} stroke={chartColors.grid} strokeDasharray={isConsoleChart ? "3 5" : undefined} />
              <XAxis
                type="number"
                dataKey="x"
                domain={[0, metricMax]}
                ticks={ticks}
                allowDataOverflow
                tickLine={false}
                axisLine={{ stroke: chartColors.axis }}
                height={64}
                tick={{ fill: chartColors.text, fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
                label={{ value: `Mean ${tokenMetric} tokens per task (millions)`, position: "insideBottom", offset: -32, fill: chartColors.text, fontSize: 13 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={[0, 50]}
                ticks={[0, 10, 20, 30, 40, 50]}
                allowDataOverflow
                tickLine={false}
                axisLine={{ stroke: chartColors.axis }}
                width={62}
                tick={{ fill: chartColors.text, fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
                label={{ value: "Pass@1 (%)", angle: -90, position: "insideLeft", fill: chartColors.text, fontSize: 13 }}
              />
              <Tooltip cursor={false} content={ChartTooltip} isAnimationActive={false} />
              <ReferenceLine
                segment={[{ x: 0, y: activeModel.overall }, { x: activeModel[tokenMetric], y: activeModel.overall }]}
                stroke={activeModel.color}
                strokeDasharray="3 3"
                strokeOpacity={0.42}
                ifOverflow="hidden"
                zIndex={100}
              />
              <ReferenceLine
                segment={[{ x: activeModel[tokenMetric], y: 0 }, { x: activeModel[tokenMetric], y: activeModel.overall }]}
                stroke={activeModel.color}
                strokeDasharray="3 3"
                strokeOpacity={0.42}
                ifOverflow="hidden"
                zIndex={100}
              />
              {DEPTH_CONNECTIONS.map(({ from, to }) => {
                const first = MODELS.find((model) => model.id === from)!;
                const second = MODELS.find((model) => model.id === to)!;
                return (
                  <ReferenceLine
                    key={`${from}-${to}`}
                    segment={[
                      { x: first[tokenMetric], y: first.overall },
                      { x: second[tokenMetric], y: second.overall },
                    ]}
                    stroke={first.color}
                    strokeWidth={2}
                    strokeOpacity={0.7}
                    ifOverflow="hidden"
                    zIndex={120}
                  />
                );
              })}
              <Scatter
                data={chartData}
                shape={renderPoint}
                activeShape={renderPoint}
                isAnimationActive={false}
                zIndex={300}
                onMouseEnter={(point) => setActiveId((point.payload as ChartDatum).id)}
                onClick={(point) => setActiveId((point.payload as ChartDatum).id)}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </figure>

        <div className="model-legend" aria-label="Model configurations">
          {MODELS.map((model) => (
            <button key={model.id} className={activeId === model.id ? "active" : ""} onClick={() => setActiveId(model.id)}>
              <span className={`legend-shape shape-${model.shape}${model.hollow ? " hollow" : ""}`} style={{ "--point-color": model.color } as React.CSSProperties} />
              {model.model}
            </button>
          ))}
        </div>
        <p className="chart-note">All configurations are evaluated on the same 119 tasks. Token counts are per-task means; same-color lines connect different reasoning depths of the same model.</p>
      </section>

      <section className="results-section" aria-labelledby="results-title">
        <div className="section-heading">
          <div>
            <span className="section-number">02</span>
            <h2 id="results-title">Model results</h2>
          </div>
          <p>Task-level means from Table 2. Select any column heading or use the sorting controls to reorder the table.</p>
        </div>

        <div className="table-meta">
          <span>9 configurations</span>
          <div className="table-sort-controls" aria-label="Table sorting options">
            <label>
              <span>Sort by</span>
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                {SORT_OPTIONS.map(([key, label]) => <option value={key} key={key}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>Order</span>
              <select value={sortDirection} onChange={(event) => setSortDirection(event.target.value as "asc" | "desc")}>
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col" className="rank-column">Rank</th>
                <th scope="col" className="model-column">
                  <button onClick={() => sortBy("model")}>LLM<span aria-hidden="true">{sortKey === "model" ? (sortDirection === "desc" ? " ↓" : " ↑") : ""}</span></button>
                </th>
                <th scope="col">
                  <button onClick={() => sortBy("harness")}>Harness<span aria-hidden="true">{sortKey === "harness" ? (sortDirection === "desc" ? " ↓" : " ↑") : ""}</span></button>
                </th>
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
