import { readFile } from "node:fs/promises";

const dataUrl = new URL("../data/benchmark.json", import.meta.url);
const data = JSON.parse(await readFile(dataUrl, "utf8"));
const matrix = JSON.parse(await readFile(new URL("../data/task-matrix.json", import.meta.url), "utf8"));
const hard70 = JSON.parse(await readFile(new URL("../data/hard70.json", import.meta.url), "utf8"));
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

check(data.version === 1, "version must be 1");
check(/^\d{4}-\d{2}-\d{2}$/.test(data.updatedAt ?? ""), "updatedAt must use YYYY-MM-DD");
check(!Number.isNaN(Date.parse(`${data.updatedAt}T00:00:00Z`)), "updatedAt must be a valid date");

for (const key of ["tasks", "repositories", "domains"]) {
  check(Number.isInteger(data.summary?.[key]) && data.summary[key] > 0, `summary.${key} must be a positive integer`);
}

check(Array.isArray(data.models) && data.models.length > 0, "models must be a non-empty array");

const ids = new Set();
const scoreKeys = ["public", "private", "fail2Pass", "pass2Pass", "overall", "issue", "expert", "engineering"];
const depths = new Set(["default", "high", "max", "xhigh"]);

for (const [index, model] of (data.models ?? []).entries()) {
  const prefix = `models[${index}]`;
  check(typeof model.id === "string" && model.id.length > 0, `${prefix}.id is required`);
  check(!ids.has(model.id), `${prefix}.id must be unique (${model.id})`);
  ids.add(model.id);
  check(typeof model.family === "string" && model.family.length > 0, `${prefix}.family is required`);
  check(depths.has(model.reasoningDepth), `${prefix}.reasoningDepth is invalid`);
  check(typeof model.harness === "string" && model.harness.length > 0, `${prefix}.harness is required`);

  for (const key of scoreKeys) {
    const value = model.scores?.[key];
    check(typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100, `${prefix}.scores.${key} must be between 0 and 100`);
  }

  for (const key of ["input", "output"]) {
    const value = model.tokens?.[key];
    check(typeof value === "number" && Number.isFinite(value) && value >= 0, `${prefix}.tokens.${key} must be a non-negative number`);
  }
}

check(hard70.version === 1, "hard70.version must be 1");
check(Array.isArray(hard70.taskIds) && hard70.taskIds.length === 70, "hard70.taskIds must contain exactly 70 tasks");
check(new Set(hard70.taskIds ?? []).size === 70, "hard70.taskIds must be unique");
check(Array.isArray(hard70.modelIds) && hard70.modelIds.length > 0, "hard70.modelIds must be a non-empty array");
check(new Set(hard70.modelIds ?? []).size === hard70.modelIds?.length, "hard70.modelIds must be unique");

const matrixTasks = new Map((matrix.tasks ?? []).map((task) => [task.publishedTaskId, task]));
for (const taskId of hard70.taskIds ?? []) {
  check(/^\d{3}$/.test(taskId), `Hard70 task ID must use three digits (${taskId})`);
  check(matrixTasks.has(taskId), `Hard70 task is missing from task-matrix.json (${taskId})`);
}
for (const modelId of hard70.modelIds ?? []) {
  check(ids.has(modelId), `Hard70 model is missing from benchmark.json (${modelId})`);
  check(matrix.models?.some((model) => model.id === modelId), `Hard70 model is missing from task-matrix.json (${modelId})`);
  for (const taskId of hard70.taskIds ?? []) {
    check([0, 1].includes(matrixTasks.get(taskId)?.results?.[modelId]?.reward), `Hard70 result is missing for ${modelId} task ${taskId}`);
  }
}

if (failures.length > 0) {
  console.error("Benchmark data validation failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Benchmark data is valid: ${data.models.length} model configurations.`);
}
