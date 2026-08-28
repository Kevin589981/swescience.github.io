import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("renders the SWE-bench Science project page", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>SWE-bench Science — Leaderboard<\/title>/i);
  assert.match(html, /Leaderboard/);
  assert.match(html, /Model results/);
  assert.match(html, /119/);
  assert.match(html, /huggingface\.co\/datasets\/OpenMOSS-Team\/SWE-bench-Science/);
  assert.match(html, /github\.com\/OpenMOSS\/SWE-bench-Science/);
  assert.match(html, /task-matrix\/gradient/);
  assert.doesNotMatch(html, /task-matrix\/trace/);
});

test("exports the task trace viewer", async () => {
  const html = await readFile(new URL("../out/task-matrix/trace/index.html", import.meta.url), "utf8");
  assert.match(html, /SWE-bench Science/);
  assert.match(html, /Loading trace index and task record/);
  assert.match(html, /Task matrix/);
  assert.doesNotMatch(html, /Workspace/);
  assert.doesNotMatch(html, /legacy|UCloud|linux\/amd64|api\.modelverse\.cn/);
});

test("keeps trace entry points inside task details", async () => {
  const html = await readFile(new URL("../out/task-matrix/gradient/index.html", import.meta.url), "utf8");
  assert.match(html, /#task-details/);
  assert.match(html, /Open trace/);
  assert.match(html, /href="\/"/);
  assert.doesNotMatch(html, /Trace browser/);
});

test("publishes one sanitized Opus UCloud trace record per task", async () => {
  const root = new URL("../public/traces/claude-opus-5-max/", import.meta.url);
  const registry = JSON.parse(await readFile(new URL("../public/traces/index.json", import.meta.url), "utf8"));
  assert.equal(registry.experiments.length, 1);
  assert.equal(registry.experiments[0].path, "claude-opus-5-max");
  const index = JSON.parse(await readFile(new URL("index.json", root), "utf8"));
  assert.equal(index.taskCount, 119);
  assert.equal(index.tasks.length, 119);
  assert.equal(index.tasks[0].publishedTaskId, "001");
  assert.equal(index.tasks[1].publishedTaskId, "002");
  assert.equal(index.tasks.at(-1).publishedTaskId, "119");

  const builder = await readFile(new URL("../scripts/build-opus-traces.mjs", import.meta.url), "utf8");
  assert.match(builder, /legacyTaskId === "120" \? "001" : legacyTaskId/);

  for (const entry of index.tasks) {
    await access(new URL(entry.file, root));
    const text = await readFile(new URL(entry.file, root), "utf8");
    const trace = JSON.parse(text);
    assert.equal(trace.task.publishedTaskId, entry.publishedTaskId);
    assert.equal(Object.hasOwn(trace, "workspace"), false);
    assert.equal(typeof trace.evaluation.verifierLog, "string");
    assert.match(trace.evaluation.verifierLog, /science-bench/);
    assert.doesNotMatch(text, /\/Users\/fnlp/);
    assert.doesNotMatch(text, /diff --git a\/source\//);
    assert.doesNotMatch(text, /api\.modelverse\.cn|linux\/amd64|UCloud/);
  }
});
