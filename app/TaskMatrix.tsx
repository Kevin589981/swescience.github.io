"use client";

import matrixData from "@/data/task-matrix.json";
import { getModelDisplayName } from "@/lib/benchmark";
import Link from "next/link";
import { useMemo, useState } from "react";

type Metric = { passed: number; total: number };
type MatrixResult = {
  public: Metric;
  private: Metric;
  reward: number;
  transition: null;
  source: string;
};
type MatrixModel = {
  id: string;
  family: string;
  reasoningDepth: "default" | "high" | "max" | "xhigh";
  harness: string;
  scores: { overall: number };
};
type MatrixTask = {
  publishedTaskId: string;
  legacyTaskId: string;
  scientificKnowledgeAblation?: boolean;
  results: Record<string, MatrixResult>;
};
type MatrixPayload = {
  referenceModel: { label: string; overallPassAt1: number };
  includedModels: string[];
  pendingModels: string[];
  models: MatrixModel[];
  tasks: MatrixTask[];
};

const data = matrixData as MatrixPayload;
const MODEL_COLORS: Record<string, string> = {
  opus: "#a96f62",
  gpt: "#647f9d",
  glm: "#96758a",
  "qwen-3-8-27b": "#628d82",
};

function MatrixCell({ result }: { result: MatrixResult }) {
  const ratio = result.private.total ? result.private.passed / result.private.total : 0;
  const passed = result.reward === 1;
  const style = { "--matrix-intensity": ratio } as React.CSSProperties;

  return (
    <div
      className={`matrix-cell ${passed ? "is-pass" : "is-fail"}`}
      style={style}
      title={`${passed ? "PASS" : "FAIL"} | private ${result.private.passed}/${result.private.total}`}
    >
      <strong>{passed ? "PASS" : "FAIL"}</strong>
    </div>
  );
}

export function TaskMatrix() {
  const [query, setQuery] = useState("");
  const [ablationOnly, setAblationOnly] = useState(false);
  const models = useMemo(() => data.models.filter((model) => data.includedModels.includes(model.id)), []);
  const tasks = useMemo(() => data.tasks.filter((task) => {
    const matchesQuery = !query || task.publishedTaskId.includes(query.padStart(3, "0"));
    return matchesQuery && (!ablationOnly || task.scientificKnowledgeAblation);
  }), [ablationOnly, query]);

  return (
    <main className="matrix-page matrix-gradient">
      <header className="matrix-header">
        <Link className="matrix-wordmark" href="/">SWE-bench Science</Link>
      </header>

      <section className="matrix-intro">
        <div className="matrix-kicker">Task-level results</div>
        <h1>Pass@1 matrix</h1>
        <p>
          One row per published task and one column per available model. The cell label is the task-level private-test Pass@1 result.
          Background intensity adds private-test progress as a visual cue.
        </p>
      </section>

      <section className="matrix-controls" aria-label="Matrix controls">
        <label className="matrix-search">
          <span>Find task</span>
          <input value={query} inputMode="numeric" onChange={(event) => setQuery(event.target.value.replace(/[^0-9]/g, "").slice(0, 3))} placeholder="001" />
        </label>
        <label className="matrix-check">
          <input type="checkbox" checked={ablationOnly} onChange={(event) => setAblationOnly(event.target.checked)} />
          <span>Scientific-knowledge ablation only</span>
        </label>
      </section>

      <section className="matrix-legend" aria-label="Legend">
        <span className="matrix-scale-legend">
          <span>Private test pass fraction</span>
          <i className="matrix-scale" />
          <span>0%</span>
          <span>100%</span>
        </span>
        <span className="matrix-legend-note">Continuous scale; PASS / FAIL labels remain authoritative.</span>
      </section>

      <div className="matrix-table-wrap">
        <table className="matrix-table">
          <thead>
            <tr>
              <th scope="col" className="matrix-task-heading">Task</th>
              {models.map((model) => (
                <th scope="col" key={model.id} style={{ "--model-color": MODEL_COLORS[model.id] } as React.CSSProperties}>
                  <span className="matrix-model-dot" />
                  {getModelDisplayName(model)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.publishedTaskId}>
                <th scope="row" className="matrix-task-id">{task.publishedTaskId}</th>
                {models.map((model) => (
                  <td key={model.id}><MatrixCell result={task.results[model.id]} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="matrix-footnote">
        Results are task-level private-test Pass@1 values from the current Feishu audit summaries. Kimi-K3 and DeepSeek-V4-Pro are listed as pending until their per-task summaries arrive.
      </p>
    </main>
  );
}
