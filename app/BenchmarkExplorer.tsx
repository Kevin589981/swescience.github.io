"use client";

import { formatUpdatedAt, getModelDisplayName } from "@/lib/benchmark";
import type { BenchmarkData } from "@/lib/benchmark";
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
  family: string;
  depth: string;
};

const FAMILY_COLORS: Record<string, string> = {
  "Claude-Opus-5": "#ec5b3f",
  "DeepSeek-V4-Pro": "#f0a202",
  "DeepSeek-V4-flash": "#159b76",
  "GLM-5.2": "#d83c91",
  "GPT-5.6-sol": "#1967d2",
  "Kimi-K3": "#7c3aed",
  "Nex N2": "#0ea5b7",
  "Qwen3.5-397B": "#d97706",
  "Agents-A1": "#0891b2",
  "Qwen3.8-27B": "#0f9f9a",
  "BigBang-v1": "#c026d3",
  "Intern-S2-Preview-397B": "#65a30d",
  "Qwen3.5-9B": "#f59e0b",
  "Qwen3.6-35B-A3B": "#e11d48",
  "Nex-N2-mini": "#06b6d4",
};
const FALLBACK_COLORS = ["#1967d2", "#159b76", "#d83c91", "#d97706", "#7c3aed"];
const DEPTH_ORDER = { default: 0, high: 1, max: 2, xhigh: 3 } as const;

function toModelResults(data: BenchmarkData): ModelResult[] {
  return data.models.map((model, index) => ({
    id: model.id,
    model: getModelDisplayName(model),
    family: model.family,
    depth: model.reasoningDepth,
    harness: model.harness,
    color: FAMILY_COLORS[model.family] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length],
    shape: "circle",
    publicScore: model.scores.public,
    privateScore: model.scores.private,
    fail2Pass: model.scores.fail2Pass,
    pass2Pass: model.scores.pass2Pass,
    overall: model.scores.overall,
    issue: model.scores.issue,
    expert: model.scores.expert,
    engineering: model.scores.engineering,
    input: model.tokens.input,
    output: model.tokens.output,
  }));
}

function getDepthConnections(models: ModelResult[]) {
  const families = new Map<string, ModelResult[]>();
  models.forEach((model) => families.set(model.family, [...(families.get(model.family) ?? []), model]));

  return [...families.values()].flatMap((family) => {
    if (family.length < 2) return [];
    const ordered = [...family].sort((a, b) => DEPTH_ORDER[a.depth as keyof typeof DEPTH_ORDER] - DEPTH_ORDER[b.depth as keyof typeof DEPTH_ORDER]);
    return ordered.slice(1).map((model, index) => ({ from: ordered[index], to: model }));
  });
}

const SCORE_COLUMNS = [
  ["publicScore", "Public"], ["privateScore", "Private"], ["fail2Pass", "Fail2Pass"],
  ["pass2Pass", "Pass2Pass"], ["overall", "Overall"], ["issue", "Issue"],
  ["expert", "Expert"], ["engineering", "Engineering"],
] as const;

type ScoreKey = typeof SCORE_COLUMNS[number][0];
type SortKey = ScoreKey | "model" | "harness";
type TokenMetric = "input" | "output";

const SORT_OPTIONS: ReadonlyArray<readonly [SortKey, string]> = [
  ["model", "LLM"], ["harness", "Harness"],
  ...SCORE_COLUMNS,
];

const formatPct = (value: number) => `${value.toFixed(2)}%`;

type ChartDatum = ModelResult & {
  x: number;
  y: number;
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
  const compact = chartWidth <= 640;
  const chartHeight = chartWidth <= 800 ? 400 : 470;
  const plotLeft = 62;
  const plotRight = Math.max(plotLeft + 180, chartWidth - 22);
  const plotTop = 22;
  const plotBottom = chartHeight - 72;
  const fontFactor = compact ? 5.3 : 6.35;
  const depthFontFactor = compact ? 4.3 : 5;
  const labelAscent = compact ? 11 : 13;
  const labelDescent = compact ? 12 : 14;
  const safeBounds = {
    left: 8,
    right: chartWidth - 8,
    top: 6,
    bottom: plotBottom + 22,
  };

  const points = data.map((datum) => ({
    datum,
    x: plotLeft + (datum.x / metricMax) * (plotRight - plotLeft),
    y: plotTop + (1 - datum.y / 50) * (plotBottom - plotTop),
    width: Math.max(datum.family.length * fontFactor, datum.depth.length * depthFontFactor),
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
    const wouldOverflowLeft = x - width - 10 < safeBounds.left;
    const wouldOverflowRight = x + width + 10 > safeBounds.right;
    const preferLeft = wouldOverflowRight || (!wouldOverflowLeft && datum.x / metricMax > 0.64);
    const wouldOverflowTop = y - 24 - labelAscent < safeBounds.top;
    const wouldOverflowBottom = y + 18 + labelDescent > safeBounds.bottom;
    const preferBelow = wouldOverflowTop || (!wouldOverflowBottom && datum.y / 50 > 0.82);
    const horizontal = preferLeft
      ? [{ dx: -10, anchor: "end" as const }, { dx: 10, anchor: "start" as const }]
      : [{ dx: 10, anchor: "start" as const }, { dx: -10, anchor: "end" as const }];
    const vertical = preferBelow ? [18, -24] : [-24, 18];
    const candidates: LabelPlacement[] = [
      { ...horizontal[0], dy: vertical[0] },
      { ...horizontal[1], dy: vertical[0] },
      { ...horizontal[0], dy: vertical[1] },
      { ...horizontal[1], dy: vertical[1] },
      { dx: 0, dy: preferBelow ? 30 : -36, anchor: "middle" },
      { dx: 0, dy: preferBelow ? -36 : 30, anchor: "middle" },
      { ...horizontal[0], dy: preferBelow ? 40 : -46 },
      { ...horizontal[1], dy: preferBelow ? -46 : 40 },
    ];

    const evaluated = candidates.map((candidate, priority) => {
      const labelX = x + candidate.dx;
      const left = candidate.anchor === "start" ? labelX : candidate.anchor === "end" ? labelX - width : labelX - width / 2;
      const box: LabelBox = {
        left,
        right: left + width,
        top: y + candidate.dy - labelAscent,
        bottom: y + candidate.dy + labelDescent,
      };
      const labelCollision = placed.reduce((total, other) => total + overlapArea(box, other), 0);
      const pointCollision = pointBoxes.reduce((total, other) => {
        if (other.id === datum.id) return total;
        return total + overlapArea(box, other);
      }, 0);
      const inBounds = box.left >= safeBounds.left
        && box.right <= safeBounds.right
        && box.top >= safeBounds.top
        && box.bottom <= safeBounds.bottom;
      const score = labelCollision * 120 + pointCollision * 45 + priority;
      return { candidate, box, inBounds, score };
    });

    const bounded = evaluated.filter((option) => option.inBounds);
    const best = bounded.length
      ? bounded.reduce((current, option) => option.score < current.score ? option : current)
      : (() => {
          const preferredDy = preferBelow ? 18 : -24;
          const labelX = Math.min(
            safeBounds.right - width / 2,
            Math.max(safeBounds.left + width / 2, x),
          );
          const labelY = Math.min(
            safeBounds.bottom - labelDescent,
            Math.max(safeBounds.top + labelAscent, y + preferredDy),
          );
          const box: LabelBox = {
            left: labelX - width / 2,
            right: labelX + width / 2,
            top: labelY - labelAscent,
            bottom: labelY + labelDescent,
          };
          return {
            candidate: { dx: labelX - x, dy: labelY - y, anchor: "middle" as const },
            box,
            inBounds: true,
            score: Number.MAX_SAFE_INTEGER,
          };
        })();
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

export function BenchmarkExplorer({ data }: { data: BenchmarkData }) {
  const models = useMemo(() => toModelResults(data), [data]);
  const [tokenMetric, setTokenMetric] = useState<TokenMetric>("input");
  const [activeId, setActiveId] = useState<string>(() => data.models[0].id);
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
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

  const sorted = useMemo(() => [...models].sort((a, b) => {
    const leftValue = a[sortKey];
    const rightValue = b[sortKey];
    const difference = typeof leftValue === "string"
      ? leftValue.localeCompare(String(rightValue))
      : leftValue - Number(rightValue);
    return sortDirection === "desc" ? -difference : difference;
  }), [models, sortDirection, sortKey]);

  const activeModel = models.find((model) => model.id === activeId) ?? models[0];
  const chartColors = { grid: "var(--chart-grid)", axis: "var(--chart-axis)", text: "var(--chart-text)", pointSurface: "var(--surface)", label: "var(--ink)" };
  const metricMax = tokenMetric === "input" ? 24 : 0.24;
  const ticks = tokenMetric === "input" ? [0, 5, 10, 15, 20] : [0, 0.04, 0.08, 0.12, 0.16, 0.20, 0.24];
  const chartData = useMemo<ChartDatum[]>(() => models.map((model) => ({
    ...model,
    x: model[tokenMetric],
    y: model.overall,
  })), [models, tokenMetric]);
  const depthConnections = useMemo(() => getDepthConnections(models), [models]);
  const labelLayout = useMemo(() => createLabelLayout(chartData, metricMax, chartWidth), [chartData, chartWidth, metricMax]);

  function renderPoint(props: ScatterShapeProps) {
    const datum = props.payload as ChartDatum;
    const { cx, cy } = props;
    if (cx == null || cy == null) return null;

    const selected = activeId === datum.id || props.isActive;
    const placement = labelLayout[datum.id] ?? { dx: 9, dy: -11, anchor: "start" as const };
    const labelX = cx + placement.dx;
    const labelY = cy + placement.dy;
    const depthLineOffset = chartWidth <= 640 ? 10 : 12;

    return (
      <g className={`chart-point${selected ? " selected" : ""}`} style={{ color: datum.color }}>
        <circle className="chart-point-hit" cx={cx} cy={cy} r={15} />
        <circle className="chart-point-halo" cx={cx} cy={cy} r={selected ? 13 : 9} fill={datum.color} />
        <circle className="chart-point-ring" cx={cx} cy={cy} r={selected ? 8 : 6} fill={chartColors.pointSurface} stroke={datum.color} strokeWidth={1.5} />
        <circle className="chart-point-core" cx={cx} cy={cy} r={selected ? 5.5 : 4} fill={datum.color} />
        <text className="chart-point-label" x={labelX} y={labelY} fill={chartColors.label} textAnchor={placement.anchor} aria-hidden="true">
          <tspan x={labelX}>{datum.family}</tspan>
          <tspan className="chart-point-depth" x={labelX} dy={depthLineOffset} fill={datum.color}>{datum.depth}</tspan>
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
          <p><time className="updated-at" dateTime={data.updatedAt}>Updated {formatUpdatedAt(data.updatedAt)}</time>Pass@1 versus mean token consumption per task. Select a point or model to inspect the configuration.</p>
        </div>

        <div className="chart-toolbar">
          <div className="chart-controls">
            <div className="segmented-control" aria-label="Token metric">
              <button className={tokenMetric === "input" ? "active" : ""} onClick={() => setTokenMetric("input")}>Input tokens</button>
              <button className={tokenMetric === "output" ? "active" : ""} onClick={() => setTokenMetric("output")}>Output tokens</button>
            </div>
          </div>
          <div className="chart-summary" aria-live="polite">
            <span style={{ backgroundColor: activeModel.color }} />
            <strong>{activeModel.model}</strong>
            <span>{formatPct(activeModel.overall)} Pass@1</span>
            <span>{tokenMetric === "input" ? `${activeModel.input.toFixed(3)}M input` : `${activeModel.output.toFixed(3)}M output`}</span>
          </div>
        </div>

        <div className="chart-scroll" role="region" aria-label="Scrollable benchmark chart" tabIndex={0}>
          <figure ref={chartRef} className="interactive-chart chart-paper" onMouseDown={(event) => event.preventDefault()}>
            <figcaption className="sr-only">Interactive scatter plot of model Pass@1 against mean token use.</figcaption>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart accessibilityLayer={false} margin={{ top: 22, right: 14, bottom: 8, left: 0 }}>
              <CartesianGrid vertical={false} stroke={chartColors.grid} />
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
              {depthConnections.map(({ from, to }) => {
                return (
                  <ReferenceLine
                    key={`${from.id}-${to.id}`}
                    segment={[
                      { x: from[tokenMetric], y: from.overall },
                      { x: to[tokenMetric], y: to.overall },
                    ]}
                    stroke={from.color}
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
        </div>

        <div className="model-legend" aria-label="Model configurations">
          {models.map((model) => (
            <button key={model.id} className={activeId === model.id ? "active" : ""} onClick={() => setActiveId(model.id)}>
              <span className={`legend-shape shape-${model.shape}${model.hollow ? " hollow" : ""}`} style={{ "--point-color": model.color } as React.CSSProperties} />
              {model.model}
            </button>
          ))}
        </div>
        <p className="chart-note">All configurations are evaluated on the same {data.summary.tasks} tasks. Token counts are per-task means; same-color lines connect different reasoning depths of the same model.</p>
      </section>

      <section className="results-section" aria-labelledby="results-title">
        <div className="section-heading">
          <div>
            <span className="section-number">02</span>
            <h2 id="results-title">Model results</h2>
          </div>
        </div>

        <div className="table-meta">
          <span>{models.length} configurations</span>
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
