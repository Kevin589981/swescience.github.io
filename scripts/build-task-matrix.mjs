import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const benchmarkRoot = process.env.BENCHMARK_ROOT ?? "/Users/fnlp/workspace/agent/opus-test";

const paths = {
  opus: process.env.OPUS_SELECTION_FILE
    ?? path.join(benchmarkRoot, "reports/ucloud-opus-max-002-120-audit/selected_runs.json"),
  glm: process.env.GLM_SELECTION_FILE
    ?? path.join(benchmarkRoot, "reports/glm-5.2-max-with_auxiliary-002-120-audit/selected_runs_and_evidence.json"),
  qwen: process.env.QWEN_SELECTION_FILE
    ?? path.join(benchmarkRoot, "reports/qwen3.8-27b-responses-withaux-002-120-audit/selected_runs_and_token_usage.json"),
  gpt: process.env.GPT_SELECTION_FILE ?? path.join("/tmp", "gpt-per-task.json"),
};

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing source file: ${file}`);
  return fs.readFileSync(file, "utf8");
}

function metric(value, passedKey = "passed", totalKey = "collected") {
  if (!value || value[passedKey] === undefined || value[totalKey] === undefined) return null;
  return { passed: Number(value[passedKey]), total: Number(value[totalKey]) };
}

function parseSelectedRuns(file) {
  const raw = JSON.parse(read(file));
  const entries = Array.isArray(raw) ? raw : raw.tasks;
  if (!Array.isArray(entries) || entries.length !== 119) throw new Error(`Expected 119 selected runs in ${file}`);
  const rows = new Map();
  for (const entry of entries) {
    const taskId = String(entry.task_id ?? entry.task ?? "").replace(/^task_/, "").padStart(3, "0");
    if (!/^\d{3}$/.test(taskId)) throw new Error(`Selected run has invalid task id in ${file}`);
    const publicMetric = metric(entry.public)
      ?? metric(entry, "public_passed_count", "public_collected")
      ?? metric(entry, "public_passed", "public_collected");
    const privateMetric = metric(entry.private)
      ?? metric(entry, "private_passed_count", "private_collected")
      ?? metric(entry, "private_passed", "private_collected");
    if (!publicMetric || !privateMetric) throw new Error(`Selected run has incomplete metrics for task ${taskId} in ${file}`);
    rows.set(taskId, { public: publicMetric, private: privateMetric, reward: Number(entry.reward ?? 0) });
  }
  if (rows.size !== 119) throw new Error(`Selected run file has duplicate task ids: ${file}`);
  return rows;
}

function parseGptRows(file) {
  const content = JSON.parse(read(file)).data.document.content;
  const rows = new Map();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\| (\d{3}) \| [^|]*?\bpublic (\d+)\/(\d+).*?\bprivate (\d+)\/(\d+).*?\breward (\d+) \|/);
    if (match) rows.set(match[1], {
      public: { passed: Number(match[2]), total: Number(match[3]) },
      private: { passed: Number(match[4]), total: Number(match[5]) },
      reward: Number(match[6]),
    });
  }
  return rows;
}

const benchmark = JSON.parse(read(path.join(repoRoot, "data/benchmark.json")));
const nex = benchmark.models.find((model) => model.id === "nex");
if (!nex) throw new Error("Nex N2 reference model is missing from benchmark.json");
const targetIds = benchmark.models.filter((model) => model.scores.overall > nex.scores.overall).map((model) => model.id);
const publishGptXhigh = process.env.PUBLISH_GPT_XHIGH === "1";
const includedIds = publishGptXhigh
  ? ["opus", "gpt", "glm", "qwen-3-8-27b"]
  : ["opus", "glm", "qwen-3-8-27b"];
const pendingIds = targetIds.filter((id) => !includedIds.includes(id) && (publishGptXhigh || id !== "gpt"));

const selectedSources = [
  { id: "opus", file: paths.opus, source: "Selected Claude Opus Max public/private audit" },
  { id: "glm", file: paths.glm, source: "Selected GLM-5.2 public/private audit" },
  { id: "qwen-3-8-27b", file: paths.qwen, source: "Selected Qwen3.8-27B public/private audit" },
].map((entry) => ({ ...entry, rows: parseSelectedRuns(entry.file) }));
const gptRows = publishGptXhigh ? parseGptRows(paths.gpt) : null;

const taskIds = [...selectedSources[0].rows.keys()].sort();
if (taskIds.length !== 119) throw new Error(`Expected 119 tasks, found ${taskIds.length}`);
const ablationIds = new Set();
for (let id = 2; id <= 82; id += 1) ablationIds.add(String(id).padStart(3, "0"));
[84, 86, 90, 111, 114].forEach((id) => ablationIds.add(String(id).padStart(3, "0")));
for (let id = 97; id <= 101; id += 1) ablationIds.add(String(id).padStart(3, "0"));

const results = {};
for (const taskId of taskIds) {
  const publishedId = taskId === "120" ? "001" : taskId;
  const taskResults = {};
  for (const entry of selectedSources) {
    const result = entry.rows.get(taskId);
    if (!result) throw new Error(`Missing selected result for ${entry.id} task ${taskId}`);
    taskResults[entry.id] = { ...result, transition: null, source: entry.source };
  }

  if (publishGptXhigh) {
    const gpt = gptRows.get(taskId);
    if (!gpt) throw new Error(`Missing selected result for GPT task ${taskId}`);
    taskResults.gpt = { ...gpt, transition: null, source: "Selected GPT-5.6-sol comparison audit" };
  }

  results[publishedId] = {
    publishedTaskId: publishedId,
    legacyTaskId: taskId,
    scientificKnowledgeAblation: ablationIds.has(publishedId),
    results: taskResults,
  };
}

const models = includedIds.map((id) => benchmark.models.find((model) => model.id === id)).filter(Boolean);
const output = {
  version: 1,
  generatedAt: new Date().toISOString().slice(0, 10),
  referenceModel: { id: "nex", label: "Nex N2", overallPassAt1: nex.scores.overall, note: "Reference threshold from the current leaderboard snapshot; no complete Feishu per-task table is available." },
  selectionRule: "Models with benchmark.json overall Pass@1 above Nex N2 (24.37%).",
  includedModels: includedIds,
  pendingModels: pendingIds,
  models,
  tasks: Object.values(results).sort((a, b) => a.publishedTaskId.localeCompare(b.publishedTaskId)),
};

fs.writeFileSync(path.join(repoRoot, "data/task-matrix.json"), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${output.tasks.length} tasks for ${output.includedModels.length} target models.`);
console.log(`Pending target models: ${output.pendingModels.join(", ") || "none"}`);
