import { readFile } from "node:fs/promises";

const dataUrl = new URL("../data/benchmark.json", import.meta.url);
const data = JSON.parse(await readFile(dataUrl, "utf8"));
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

if (failures.length > 0) {
  console.error("Benchmark data validation failed:\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Benchmark data is valid: ${data.models.length} model configurations.`);
}
