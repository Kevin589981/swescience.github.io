import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const runsRoot = process.env.TRACE_RUNS_ROOT ?? "/Users/fnlp/workspace/agent/opus-test/runs";
const outputRoot = path.join(repoRoot, "public/traces/claude-opus-5-max");
const obsoleteOutputRoot = path.join(repoRoot, "public/traces/opus-5-max-ucloud");
const runSuffix = "claude-opus-5-max-ucloud-withaux-002-120-20260814-r1";
const maxPreviewChars = 1200;
const maxFinalChars = 3200;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const [headers, ...records] = rows;
  return records.filter((record) => record.some(Boolean)).map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""])));
}

const taskCsv = parseCsv(fs.readFileSync(path.join(repoRoot, "data/tasks.csv"), "utf8"));
const taskById = new Map(taskCsv.map((task) => [task.task_id, task]));
if (taskCsv.length !== 119 || taskById.size !== 119) throw new Error("data/tasks.csv must contain 119 unique published tasks");

function truncate(value, limit = maxPreviewChars) {
  const text = String(value ?? "");
  if (text.length <= limit) return { text, truncated: false };
  return { text: `${text.slice(0, limit)}\n... [truncated]`, truncated: true };
}

function sanitizeText(value, runRoot) {
  return String(value ?? "")
    .replaceAll(runRoot, "<run>")
    .replace(/\/Users\/[^\s/]+\/workspace\/agent\/opus-test/g, "<host-workspace>")
    .replace(/\/workspace\/task_\d+/g, "/workspace/task")
    .replace(/\/app\/private_tests\/task_\d+/g, "/verifier/private_tests")
    .replace(/\/claude-home\//g, "<agent-home>/")
    .replaceAll("linux/amd64", "<redacted>")
    .replace(/api\.modelverse\.cn/gi, "<redacted>")
    .replace(/\bUCloud\b/g, "<redacted>")
    .replace(/\b((?:ANTHROPIC|OPENAI|HF|HUGGINGFACE|DOCKER)[A-Z0-9_]*_API_KEY)\s*=\s*[^\s]+/gi, "$1=<redacted>")
    .replace(/\b(?:sk|rk)-[A-Za-z0-9_-]{12,}\b/g, "<redacted>");
}

function preview(value, limit, runRoot) {
  const result = truncate(sanitizeText(value, runRoot), limit);
  return result;
}

function safeInput(input, runRoot) {
  if (!input || typeof input !== "object") return null;
  const allowed = ["command", "description", "file_path", "path", "limit", "offset", "replace_all", "old_string", "new_string"];
  const output = {};
  for (const key of allowed) {
    if (!(key in input)) continue;
    const value = input[key];
    if (typeof value === "string") {
      output[key] = preview(value, key === "command" ? 1800 : 900, runRoot).text;
    } else if (typeof value === "number" || typeof value === "boolean") {
      output[key] = value;
    }
  }
  return output;
}

function resultContent(block) {
  if (!block) return "";
  if (typeof block === "string") return block;
  if (Array.isArray(block)) return block.map(resultContent).filter(Boolean).join("\n");
  if (typeof block === "object") {
    if (typeof block.content === "string") return block.content;
    if (Array.isArray(block.content)) return resultContent(block.content);
    if (typeof block.text === "string") return block.text;
  }
  return "";
}

function eventTimestamp(event) {
  const timestamp = event?.timestamp;
  if (!timestamp) return null;
  const time = Date.parse(timestamp);
  return Number.isFinite(time) ? time : null;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const normalized = String(value).replace(/NZ$/, "Z");
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function normalizeEvents(events, runRoot) {
  const normalized = [];
  const toolItems = new Map();
  const firstTimestamp = events.map(eventTimestamp).find((time) => time !== null) ?? 0;
  let lastTimestamp = firstTimestamp;

  const add = (event) => {
    const sourceTimestamp = eventTimestamp(event.source);
    if (sourceTimestamp !== null) lastTimestamp = sourceTimestamp;
    const timestamp = sourceTimestamp ?? lastTimestamp;
    const item = {
      id: `event-${normalized.length + 1}`,
      sequence: normalized.length + 1,
      kind: event.kind,
      timestamp: event.source?.timestamp ?? null,
      elapsedSec: Math.max(0, Number(((timestamp - firstTimestamp) / 1000).toFixed(3))),
    };
    for (const [key, value] of Object.entries(event)) {
      if (key !== "source" && value !== undefined) item[key] = value;
    }
    normalized.push(item);
    return item;
  };

  for (const event of events) {
    if (event.type === "tool_progress") continue;

    if (event.type === "system") {
      if (event.subtype === "init") {
        add({
          kind: "lifecycle",
          source: event,
          label: "Session start",
          details: {
            cwd: "/workspace/task",
            model: event.model,
            tools: event.tools ?? [],
          },
        });
      }
      continue;
    }

    if (event.type === "assistant") {
      for (const block of event.message?.content ?? []) {
        if (block.type === "tool_use") {
          const item = add({
            kind: "tool",
            source: event,
            toolUseId: block.id,
            name: block.name,
            input: safeInput(block.input, runRoot),
            omitResult: Object.values(block.input ?? {}).some((value) => typeof value === "string" && /(?:^|\/)artifacts\/model\.patch\b/.test(value)),
          });
          toolItems.set(block.id, item);
        } else if (block.type === "thinking") {
          add({
            kind: "thinking",
            source: event,
            label: "Reasoning block",
            redacted: true,
          });
        } else if (block.type === "text") {
          const text = preview(block.text, maxPreviewChars, runRoot);
          add({
            kind: "assistant",
            source: event,
            text: text.text,
            truncated: text.truncated,
          });
        }
      }
      continue;
    }

    if (event.type === "user") {
      const blocks = event.message?.content ?? [];
      let attached = false;
      for (const block of blocks) {
        if (block.type !== "tool_result") continue;
        const item = toolItems.get(block.tool_use_id);
        if (!item) continue;
        const rawResult = resultContent(block.content);
        const result = item.omitResult || /^diff --git /m.test(rawResult)
          ? { text: "[agent patch content omitted from the published trace]", truncated: false }
          : preview(rawResult, maxPreviewChars, runRoot);
        item.result = {
          isError: Boolean(block.is_error),
          text: result.text,
          truncated: result.truncated,
        };
        attached = true;
      }
      if (!attached && typeof event.tool_use_result === "string") {
        const item = [...toolItems.values()].at(-1);
        if (item) {
          const result = item.omitResult || /^diff --git /m.test(event.tool_use_result)
            ? { text: "[agent patch content omitted from the published trace]", truncated: false }
            : preview(event.tool_use_result, maxPreviewChars, runRoot);
          item.result = { isError: false, text: result.text, truncated: result.truncated };
          attached = true;
        }
      }
      if (!attached && blocks.length) {
        const text = preview(resultContent(blocks), maxPreviewChars, runRoot);
        add({ kind: "message", source: event, text: text.text, truncated: text.truncated });
      }
      continue;
    }

    if (event.type === "result") {
      const text = preview(event.result, maxFinalChars, runRoot);
      add({
        kind: "final",
        source: event,
        text: text.text,
        truncated: text.truncated,
        stopReason: event.stop_reason ?? null,
      });
    }
  }

  return normalized.map((event) => {
    const output = { ...event };
    delete output.omitResult;
    return output;
  });
}

function parseEvaluation(verifierLog, trial, runRoot) {
  const summaryLine = verifierLog.split(/\r?\n/).find((line) => line.startsWith("SCI_BENCH_EVAL_SUMMARY="));
  let summary = null;
  try {
    summary = summaryLine ? JSON.parse(summaryLine.slice("SCI_BENCH_EVAL_SUMMARY=".length)) : null;
  } catch {
    summary = null;
  }

  const metric = (value) => value ? {
    name: value.name ?? null,
    kind: value.kind ?? null,
    collected: value.collected ?? null,
    passed: value.passed ?? null,
    failed: value.failed ?? null,
    skipped: value.skipped ?? null,
    allPassed: value.all_passed ?? null,
    returnCode: value.return_code ?? null,
  } : null;

  const publicMetric = metric(summary?.public);
  const privateMetric = metric(summary?.private);
  const compactLog = verifierLog
    .split(/\r?\n/)
    .filter((line) => line.startsWith("[science-bench]"))
    .join("\n");

  return {
    public: publicMetric,
    private: privateMetric,
    reward: summary?.reward ?? (trial.verifier?.return_code === 0 ? 1 : 0),
    scoreMode: summary?.score_mode ?? "private_only",
    verifierReturnCode: trial.verifier?.return_code ?? null,
    logSummary: compactLog,
    verifierLog: sanitizeText(verifierLog, runRoot),
  };
}

function eventCounts(events) {
  return events.reduce((counts, event) => {
    counts[event.kind] = (counts[event.kind] ?? 0) + 1;
    return counts;
  }, {});
}

function locateRun(legacyTaskId) {
  const directory = path.join(runsRoot, `task_${legacyTaskId}`);
  if (!fs.existsSync(directory)) throw new Error(`Missing task directory: ${directory}`);
  const name = fs.readdirSync(directory).find((entry) => entry.includes(`-${legacyTaskId}-${runSuffix}`));
  if (!name) throw new Error(`Missing UCloud Opus run for task ${legacyTaskId}`);
  return path.join(directory, name);
}

function buildTask(legacyTaskId) {
  const runRoot = locateRun(legacyTaskId);
  const trial = readJson(path.join(runRoot, "trial.json"));
  const trajectory = readJson(path.join(runRoot, "logs/trajectory.json"));
  const verifierLog = fs.readFileSync(path.join(runRoot, "logs/verifier.log"), "utf8");
  const publishedTaskId = legacyTaskId === "120" ? "001" : legacyTaskId;
  const publishedTask = taskById.get(publishedTaskId);
  if (!publishedTask) throw new Error(`Missing published task ${publishedTaskId} in data/tasks.csv`);
  const events = normalizeEvents(trajectory.events ?? [], runRoot);
  const usage = trial.agent_run?.usage ?? {};
  const timings = trial.timings ?? {};
  const counts = eventCounts(events);
  const evaluation = parseEvaluation(verifierLog, trial, runRoot);

  return {
    version: 1,
    task: {
      publishedTaskId,
      title: publishedTask.title,
      domain: publishedTask.domain || null,
      language: publishedTask.language || null,
      sourceRepository: publishedTask.repository_url || null,
    },
    run: {
      id: `claude-opus-5-max-${publishedTaskId}`,
      model: trial.agent_run?.model ?? "claude-opus-5",
      harness: "Claude Code",
    },
    summary: {
      status: trial.timings?.workflow?.status ?? null,
      agentReturnCode: trial.agent_run?.return_code ?? null,
      workflowReturnCode: trial.timings?.workflow?.return_code ?? null,
      agentDurationSec: timings.agent?.duration_sec ?? null,
      verifierDurationSec: timings.verifier?.duration_sec ?? null,
      workflowDurationSec: timings.workflow?.duration_sec ?? null,
      startedAt: normalizeTimestamp(timings.workflow?.started_at),
      finishedAt: normalizeTimestamp(timings.workflow?.finished_at),
      rawEventCount: trajectory.event_count ?? trajectory.events?.length ?? 0,
      normalizedEventCount: events.length,
      eventCounts: counts,
      toolCounts: events.filter((event) => event.kind === "tool").reduce((tools, event) => {
        tools[event.name] = (tools[event.name] ?? 0) + 1;
        return tools;
      }, {}),
    },
    usage: {
      inputTokens: usage.input_tokens ?? null,
      outputTokens: usage.output_tokens ?? null,
      totalTokens: usage.total_tokens ?? null,
      cacheReadTokens: usage.cache_read_tokens ?? null,
      cacheCreationTokens: usage.cache_creation_tokens ?? null,
      callCount: usage.call_count ?? null,
      costUsd: usage.cost_usd ?? null,
    },
    evaluation,
    events,
  };
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.rmSync(obsoleteOutputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

const tasks = [];
for (let legacy = 2; legacy <= 120; legacy += 1) {
  const legacyTaskId = String(legacy).padStart(3, "0");
  const task = buildTask(legacyTaskId);
  const file = `task-${task.task.publishedTaskId}.json`;
  fs.writeFileSync(path.join(outputRoot, file), `${JSON.stringify(task)}\n`);
  tasks.push({
    ...task.task,
    run: {
      id: task.run.id,
      model: task.run.model,
      harness: task.run.harness,
    },
    summary: task.summary,
    usage: task.usage,
    evaluation: {
      public: task.evaluation.public,
      private: task.evaluation.private,
      reward: task.evaluation.reward,
      scoreMode: task.evaluation.scoreMode,
    },
    file,
  });
}

tasks.sort((a, b) => a.publishedTaskId.localeCompare(b.publishedTaskId));
const index = {
  version: 1,
  generatedAt: tasks.map((task) => task.summary.finishedAt).filter(Boolean).sort().at(-1) ?? null,
  experiment: {
    id: "claude-opus-5-max",
    label: "Claude Opus 5 Max",
    harness: "Claude Code",
  },
  taskCount: tasks.length,
  tasks,
};
fs.writeFileSync(path.join(outputRoot, "index.json"), `${JSON.stringify(index)}\n`);
fs.writeFileSync(path.join(repoRoot, "public/traces/index.json"), `${JSON.stringify({
  version: 1,
  experiments: [{
    id: index.experiment.id,
    label: index.experiment.label,
    harness: index.experiment.harness,
    path: "claude-opus-5-max",
    taskCount: index.taskCount,
  }],
})}\n`);
console.log(`Wrote ${tasks.length} trace records to ${path.relative(repoRoot, outputRoot)}.`);
