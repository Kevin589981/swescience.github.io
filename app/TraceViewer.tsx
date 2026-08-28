"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Metric = {
  name: string | null;
  kind: string | null;
  collected: number | null;
  passed: number | null;
  failed: number | null;
  skipped: number | null;
  allPassed: boolean | null;
  returnCode: number | null;
};

type TraceIndexEntry = {
  publishedTaskId: string;
  title: string;
  domain: string | null;
  language: string | null;
  sourceRepository: string | null;
  run: { id: string; model: string; harness: string };
  summary: {
    status: string | null;
    agentDurationSec: number | null;
    workflowDurationSec: number | null;
    normalizedEventCount: number;
  };
  usage: { totalTokens: number | null; costUsd: number | null };
  evaluation: { public: Metric | null; private: Metric | null; reward: number; scoreMode: string };
  file: string;
};

type TraceEvent = {
  id: string;
  sequence: number;
  kind: "lifecycle" | "assistant" | "thinking" | "tool" | "message" | "final";
  elapsedSec: number;
  timestamp: string | null;
  label?: string;
  text?: string;
  truncated?: boolean;
  redacted?: boolean;
  name?: string;
  input?: Record<string, string | number | boolean> | null;
  result?: { isError: boolean; text: string; truncated: boolean };
  details?: { cwd?: string; model?: string; tools?: string[] };
  stopReason?: string | null;
};

type TraceRecord = {
  version: number;
  task: {
    publishedTaskId: string;
    title: string;
    domain: string | null;
    language: string | null;
    sourceRepository: string | null;
  };
  run: {
    id: string;
    model: string;
    harness: string;
  };
  summary: {
    status: string | null;
    agentReturnCode: number | null;
    workflowReturnCode: number | null;
    agentDurationSec: number | null;
    verifierDurationSec: number | null;
    workflowDurationSec: number | null;
    startedAt: string | null;
    finishedAt: string | null;
    rawEventCount: number;
    normalizedEventCount: number;
    eventCounts: Record<string, number>;
    toolCounts: Record<string, number>;
  };
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    cacheReadTokens: number | null;
    cacheCreationTokens: number | null;
    callCount: number | null;
    costUsd: number | null;
  };
  evaluation: {
    public: Metric | null;
    private: Metric | null;
    reward: number;
    scoreMode: string;
    verifierReturnCode: number | null;
    logSummary: string;
    verifierLog: string;
  };
  events: TraceEvent[];
};

type Tab = "trace" | "evaluation";

type Experiment = { id: string; label: string; harness: string; path: string; taskCount: number };

const DATA_ROOT = "../../traces";

function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : new Intl.NumberFormat("en-US").format(value);
}

function formatCost(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : `$${value.toFixed(2)}`;
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "-";
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes) return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
  return `${remainder}s`;
}

function formatElapsed(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatMetric(metric: Metric | null) {
  if (!metric || metric.collected === null) return "-";
  return `${metric.passed ?? 0}/${metric.collected}`;
}

function metricLabel(metric: Metric | null) {
  if (!metric || metric.collected === null) return "Not recorded";
  const passed = metric.passed ?? 0;
  const suffix = metric.failed ? `, ${metric.failed} failed` : "";
  return `${passed}/${metric.collected} passed${suffix}`;
}

function eventLabel(event: TraceEvent) {
  if (event.kind === "tool") return `Tool: ${event.name ?? "unknown"}`;
  if (event.kind === "assistant") return "Assistant";
  if (event.kind === "thinking") return "Reasoning";
  if (event.kind === "final") return "Final response";
  return event.label ?? event.kind;
}

function isFocusEvent(event: TraceEvent) {
  if (event.kind === "thinking") return false;
  if (event.kind !== "tool") return true;
  return /edit/i.test(event.name ?? "") || Boolean(event.result?.isError);
}

function SummaryMetric({ label, metric }: { label: string; metric: Metric | null }) {
  return (
    <div className="trace-summary-metric">
      <span>{label}</span>
      <strong>{formatMetric(metric)}</strong>
      <small>{metricLabel(metric)}</small>
    </div>
  );
}

function EventBody({ event }: { event: TraceEvent }) {
  if (event.kind === "thinking") {
    return <details className="trace-thinking"><summary>Reasoning block redacted</summary><p>Private chain-of-thought is omitted from the published trace.</p></details>;
  }

  if (event.kind === "tool") {
    return (
      <div className="trace-tool-body">
        <div className="trace-code-label">Input</div>
        <pre>{JSON.stringify(event.input ?? {}, null, 2)}</pre>
        {event.result && (
          <details className={`trace-tool-result ${event.result.isError ? "is-error" : ""}`}>
            <summary>{event.result.isError ? "Tool result · error" : "Tool result"}{event.result.truncated ? " · truncated" : ""}</summary>
            <pre>{event.result.text || "(empty result)"}</pre>
          </details>
        )}
      </div>
    );
  }

  if (event.kind === "lifecycle") {
    return (
      <div className="trace-lifecycle-details">
        <span>cwd {event.details?.cwd ?? "/workspace/task"}</span>
        <span>model {event.details?.model ?? "claude-opus-5"}</span>
        <span>tools {(event.details?.tools ?? []).join(", ") || "-"}</span>
      </div>
    );
  }

  return (
    <div className="trace-event-text">
      <p>{event.text || "(empty message)"}</p>
      {event.truncated && <span className="trace-truncated">Preview truncated</span>}
    </div>
  );
}

function TraceTimeline({ events }: { events: TraceEvent[] }) {
  const [viewMode, setViewMode] = useState<"focus" | "full">("focus");
  const focusEvents = useMemo(() => events.filter(isFocusEvent), [events]);
  const visibleEvents = viewMode === "full" ? events : focusEvents;

  return (
    <section className="trace-panel trace-timeline-panel">
      <div className="trace-panel-heading">
        <div><span className="trace-eyebrow">Run trace</span><h2>{visibleEvents.length}{viewMode === "focus" && visibleEvents.length !== events.length ? ` of ${events.length}` : ""} normalized events</h2></div>
        <div className="trace-view-toggle" role="group" aria-label="Trace event visibility">
          <button type="button" className={viewMode === "focus" ? "active" : ""} aria-pressed={viewMode === "focus"} onClick={() => setViewMode("focus")}>Focus <span aria-hidden="true">{focusEvents.length}</span></button>
          <button type="button" className={viewMode === "full" ? "active" : ""} aria-pressed={viewMode === "full"} onClick={() => setViewMode("full")}>Full <span aria-hidden="true">{events.length}</span></button>
        </div>
      </div>
      <div className="trace-timeline" aria-label="Normalized agent event timeline">
        {visibleEvents.map((event) => (
          <article className={`trace-event trace-event-${event.kind}`} id={event.id} key={event.id}>
            <div className="trace-event-rail"><span>{event.sequence}</span></div>
            <div className="trace-event-card">
              <header><strong>{eventLabel(event)}</strong><time>+{formatElapsed(event.elapsedSec)}</time></header>
              <EventBody event={event} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function EvaluationPanel({ trace }: { trace: TraceRecord }) {
  return (
    <section className="trace-panel trace-evaluation-panel">
      <div className="trace-panel-heading"><div><span className="trace-eyebrow">Evaluation</span><h2>Verifier results</h2></div></div>
      <div className="trace-evaluation-grid">
        <SummaryMetric label="Public tests" metric={trace.evaluation.public} />
        <SummaryMetric label="Private tests" metric={trace.evaluation.private} />
        <div className="trace-summary-metric"><span>Pass@1 reward</span><strong>{trace.evaluation.reward === 1 ? "PASS" : "FAIL"}</strong><small>Score mode: {trace.evaluation.scoreMode}</small></div>
      </div>
      <div className="trace-log-summary"><div className="trace-code-label">Verifier summary</div><pre>{trace.evaluation.logSummary || "No structured verifier summary recorded."}</pre></div>
      <details className="trace-log-block"><summary>Full verifier.log</summary><pre>{trace.evaluation.verifierLog || "No verifier log recorded."}</pre></details>
    </section>
  );
}

function TraceSummary({ trace }: { trace: TraceRecord }) {
  const { task, run, summary, usage, evaluation } = trace;
  return (
    <aside className="trace-sidebar">
      <div className="trace-side-heading"><span className="trace-eyebrow">Task trace</span><strong>{task.publishedTaskId}</strong></div>
      <h1>{task.title}</h1>
      <div className="trace-tags"><span>{task.domain ?? "Scientific software"}</span><span>{task.language ?? "mixed"}</span></div>
      <div className={`trace-status ${evaluation.reward === 1 ? "is-pass" : "is-fail"}`}><strong>{evaluation.reward === 1 ? "PASS@1" : "FAIL@1"}</strong><span>{summary.status ?? "unknown"}</span></div>
      <div className="trace-summary-metrics">
        <SummaryMetric label="Public" metric={evaluation.public} />
        <SummaryMetric label="Private" metric={evaluation.private} />
      </div>
      <dl className="trace-facts">
        <div><dt>Model</dt><dd>{run.model}</dd></div>
        <div><dt>Harness</dt><dd>{run.harness}</dd></div>
        <div><dt>Agent time</dt><dd>{formatDuration(summary.agentDurationSec)}</dd></div>
        <div><dt>Workflow time</dt><dd>{formatDuration(summary.workflowDurationSec)}</dd></div>
        <div><dt>Input tokens</dt><dd>{formatNumber(usage.inputTokens)}</dd></div>
        <div><dt>Output tokens</dt><dd>{formatNumber(usage.outputTokens)}</dd></div>
        <div><dt>Total tokens</dt><dd>{formatNumber(usage.totalTokens)}</dd></div>
        <div><dt>Cache read</dt><dd>{formatNumber(usage.cacheReadTokens)}</dd></div>
        <div><dt>Cache creation</dt><dd>{formatNumber(usage.cacheCreationTokens)}</dd></div>
        <div><dt>API calls</dt><dd>{formatNumber(usage.callCount)}</dd></div>
        <div><dt>Estimated cost</dt><dd>{formatCost(usage.costUsd)}</dd></div>
        <div><dt>Raw events</dt><dd>{formatNumber(summary.rawEventCount)}</dd></div>
        <div><dt>Visible events</dt><dd>{formatNumber(summary.normalizedEventCount)}</dd></div>
        <div><dt>Verifier</dt><dd>{evaluation.verifierReturnCode === 0 ? "passed" : `failed (${evaluation.verifierReturnCode ?? "-"})`}</dd></div>
      </dl>
      <div className="trace-side-links">
        {task.sourceRepository && <a href={task.sourceRepository} target="_blank" rel="noreferrer">Source repository <span aria-hidden="true">↗</span></a>}
      </div>
    </aside>
  );
}

export function TraceViewer() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedExperiment, setSelectedExperiment] = useState("");
  const [index, setIndex] = useState<TraceIndexEntry[]>([]);
  const [trace, setTrace] = useState<TraceRecord | null>(null);
  const [selectedTask, setSelectedTask] = useState("001");
  const [tab, setTab] = useState<Tab>("trace");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("task");
    fetch(`${DATA_ROOT}/index.json`)
      .then((response) => { if (!response.ok) throw new Error(`Index request failed (${response.status})`); return response.json(); })
      .then((payload: { experiments: Experiment[] }) => {
        const available = payload.experiments ?? [];
        setExperiments(available);
        const requestedExperiment = new URLSearchParams(window.location.search).get("experiment");
        const match = available.find((experiment) => experiment.id === requestedExperiment) ?? available[0];
        if (match) setSelectedExperiment(match.id);
        if (!requested && !requestedExperiment) window.history.replaceState(null, "", `${window.location.pathname}?experiment=${encodeURIComponent(match?.id ?? "")}&task=001`);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => {
    const experiment = experiments.find((item) => item.id === selectedExperiment);
    if (!experiment) return;
    const requestedTask = new URLSearchParams(window.location.search).get("task");
    fetch(`${DATA_ROOT}/${experiment.path}/index.json`)
      .then((response) => { if (!response.ok) throw new Error(`Model index request failed (${response.status})`); return response.json(); })
      .then((payload: { tasks: TraceIndexEntry[] }) => {
        const available = payload.tasks ?? [];
        setIndex(available);
        const match = available.find((entry) => entry.publishedTaskId === requestedTask) ?? available[0];
        if (match) {
          setSelectedTask(match.publishedTaskId);
          window.history.replaceState(null, "", `${window.location.pathname}?experiment=${encodeURIComponent(experiment.id)}&task=${match.publishedTaskId}`);
        }
      })
      .catch((reason: Error) => setError(reason.message));
  }, [experiments, selectedExperiment]);

  useEffect(() => {
    const entry = index.find((item) => item.publishedTaskId === selectedTask);
    const experiment = experiments.find((item) => item.id === selectedExperiment);
    if (!entry || !experiment) return;
    fetch(`${DATA_ROOT}/${experiment.path}/${entry.file}`)
      .then((response) => { if (!response.ok) throw new Error(`Trace request failed (${response.status})`); return response.json(); })
      .then((payload: TraceRecord) => setTrace(payload))
      .catch((reason: Error) => setError(reason.message));
  }, [experiments, index, selectedExperiment, selectedTask]);

  const currentIndex = useMemo(() => index.find((entry) => entry.publishedTaskId === selectedTask) ?? null, [index, selectedTask]);

  function selectTask(taskId: string) {
    const entry = index.find((item) => item.publishedTaskId === taskId);
    setSelectedTask(taskId);
    setTrace(null);
    setError(null);
    setTab("trace");
    if (entry) window.history.replaceState(null, "", `${window.location.pathname}?experiment=${encodeURIComponent(selectedExperiment)}&task=${taskId}`);
  }

  function selectExperiment(experimentId: string) {
    setSelectedExperiment(experimentId);
    setIndex([]);
    setTrace(null);
    setError(null);
    setSelectedTask("001");
    setTab("trace");
    window.history.replaceState(null, "", `${window.location.pathname}?experiment=${encodeURIComponent(experimentId)}&task=001`);
  }

  return (
    <main className="trace-page">
      <header className="trace-header">
        <Link className="trace-wordmark" href="/">SWE-bench Science <span>/</span> Trace browser</Link>
        <nav className="trace-nav" aria-label="Trace navigation">
          <Link href="/">Home</Link>
          <Link href="/task-matrix/gradient/">Task matrix <span aria-hidden="true">↗</span></Link>
        </nav>
      </header>
      <section className="trace-toolbar">
        <label className="trace-model-select"><span>Model</span><select value={selectedExperiment} onChange={(event) => selectExperiment(event.target.value)} disabled={!experiments.length}>
          {experiments.map((experiment) => <option value={experiment.id} key={experiment.id}>{experiment.label} · {experiment.harness}</option>)}
        </select></label>
        <label className="trace-task-select"><span>Task</span><select value={selectedTask} onChange={(event) => selectTask(event.target.value)} disabled={!index.length}>
          {index.map((entry) => <option value={entry.publishedTaskId} key={entry.publishedTaskId}>{entry.publishedTaskId} · {entry.title}</option>)}
        </select></label>
      </section>
      {error && <div className="trace-error" role="alert">{error}</div>}
      {!error && !trace && <div className="trace-loading">Loading trace index and task record…</div>}
      {trace && currentIndex && (
        <>
          <div className="trace-layout"><TraceSummary trace={trace} /><div className="trace-main"><nav className="trace-tabs" aria-label="Trace sections">
            <button className={tab === "trace" ? "active" : ""} onClick={() => setTab("trace")}>Trace</button>
            <button className={tab === "evaluation" ? "active" : ""} onClick={() => setTab("evaluation")}>Evaluation</button>
          </nav>
          {tab === "trace" && <TraceTimeline events={trace.events} />}
          {tab === "evaluation" && <EvaluationPanel trace={trace} />}
          </div></div>
          <footer className="trace-footer"><span>Normalized agent trace</span><span>{trace.summary.normalizedEventCount} visible events · {trace.summary.rawEventCount} raw events</span></footer>
        </>
      )}
    </main>
  );
}
