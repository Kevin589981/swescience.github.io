import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const feishuSourcesRoot = process.env.FEISHU_SOURCES_DIR ?? "/tmp";

const paths = {
  opusFeishu: path.join(feishuSourcesRoot, "opus-per-task.json"),
  gptFeishu: path.join(feishuSourcesRoot, "gpt-per-task.json"),
  glmFeishu: path.join(feishuSourcesRoot, "glm-per-task.json"),
  qwenFeishu: path.join(feishuSourcesRoot, "qwen-per-task.json"),
};

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing source file: ${file}`);
  return fs.readFileSync(file, "utf8");
}

function parseFraction(value) {
  const match = value.match(/^(\d+)\/(\d+)$/);
  return match ? { passed: Number(match[1]), total: Number(match[2]) } : null;
}

function parseFeishuRows(file) {
  const content = JSON.parse(read(file)).data.document.content;
  const rows = new Map();
  for (const line of content.split(/\r?\n/)) {
    const fields = line.split("|").map((field) => field.trim());
    const taskMatch = fields[1]?.match(/(?:\\\[)?(\d{3})(?:\\\])?/);
    if (!taskMatch) continue;
    const fractions = fields.map(parseFraction).filter(Boolean);
    if (fractions.length < 2) continue;
    const rewardField = fields.find((field, index) => index > 1 && /^[01]$/.test(field));
    rows.set(taskMatch[1], { public: fractions[0], private: fractions[1], reward: Number(rewardField ?? 0) });
  }
  return rows;
}

function parseFeishuGpt(file) {
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
const pendingIds = targetIds.filter((id) => !includedIds.includes(id));

const feishuSources = [
  { id: "opus", file: paths.opusFeishu, source: "Feishu: Claude Opus Max Public/Private audit" },
  { id: "glm", file: paths.glmFeishu, source: "Feishu: GLM-5.2 Public/Private audit" },
  { id: "qwen-3-8-27b", file: paths.qwenFeishu, source: "Feishu: Qwen3.8-27B Public/Private audit" },
].map((entry) => ({ ...entry, rows: parseFeishuRows(entry.file) }));
const gptRows = publishGptXhigh ? parseFeishuGpt(paths.gptFeishu) : null;

const taskIds = [...feishuSources[0].rows.keys()].sort();
if (taskIds.length !== 119) throw new Error(`Expected 119 tasks, found ${taskIds.length}`);
const ablationIds = new Set();
for (let id = 2; id <= 82; id += 1) ablationIds.add(String(id).padStart(3, "0"));
[84, 86, 90, 111, 114].forEach((id) => ablationIds.add(String(id).padStart(3, "0")));
for (let id = 97; id <= 101; id += 1) ablationIds.add(String(id).padStart(3, "0"));

const results = {};
for (const taskId of taskIds) {
  const oldId = Number(taskId);
  const publishedId = String(121 - oldId).padStart(3, "0");
  const row = feishuSources[0].rows.get(taskId);
  const taskResults = {};
  for (const entry of feishuSources) {
    const result = entry.rows.get(taskId);
    if (!result) throw new Error(`Missing Feishu result for ${entry.id} task ${taskId}`);
    taskResults[entry.id] = { ...result, transition: null, source: entry.source };
  }

  if (publishGptXhigh) {
    const gpt = gptRows.get(taskId);
    if (!gpt) throw new Error(`Missing Feishu result for GPT task ${taskId}`);
    taskResults.gpt = { ...gpt, transition: null, source: "Feishu: GPT-5.6-sol comparison audit" };
  }

  results[publishedId] = {
    publishedTaskId: publishedId,
    legacyTaskId: taskId,
    taskType: row.task_type,
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
