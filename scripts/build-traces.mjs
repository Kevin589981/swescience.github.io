import fs, { mkdtempSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const runsRoot = process.env.TRACE_RUNS_ROOT ?? "/Users/fnlp/workspace/agent/opus-test/runs";
const benchmarkRoot = path.dirname(runsRoot);
const reportsRoot = path.join(benchmarkRoot, "reports");
const gptSelectionFile = path.join(repoRoot, "scripts/data/gpt-run-selection.json");
const gptMacPrimaryRoot = process.env.GPT_MAC_PRIMARY_ROOT ?? "/Users/fnlp/workspace/agent/my_science_bench";
const gptMacPlatformRoot = process.env.GPT_MAC_PLATFORM_ROOT ?? "/Users/fnlp/workspace/agent/my_science_bench_platform_amd64";
const gptWslArchive = process.env.GPT_WSL_ARCHIVE ?? "/Users/fnlp/Downloads/wsl_selected_runs_without_agent_verifier.tar.gz";
const gptWslRunsRoot = process.env.GPT_WSL_RUNS_ROOT ?? null;
let gptExtractedRunsRoot = null;
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
    .replace(/[a-z0-9.-]+\.sii\.edu\.cn/gi, "<redacted>")
    .replace(/host\.docker\.internal(?::\d+)?/gi, "<redacted>")
    .replace(/\bartifacts\/model\.patch\b/gi, "<patch-omitted>")
    .replace(/\bmodel\.patch\b/gi, "<patch-omitted>")
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

function findFiles(root, predicate) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (predicate(file, entry.name)) files.push(file);
    }
  }
  return files.sort();
}

// Codex's canonical trajectory can omit reasoning items even though the local
// rollout stream retained them. Keep only their positions; private text is
// deliberately never copied into the published trace.
function readCodexReasoningAnchors(runRoot) {
  const homeRoots = [path.join(runRoot, ".codex-home"), path.join(runRoot, "artifacts/.codex-home")];
  const rolloutFiles = homeRoots.flatMap((root) => findFiles(root, (_file, name) => /^rollout-.*\.jsonl$/.test(name)));
  const anchors = [];
  let visibleAnchor = 0;

  for (const file of rolloutFiles) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type !== "response_item" || !event.payload) continue;
      const item = event.payload;
      if (item.type === "reasoning") {
        anchors.push(visibleAnchor);
      } else if ((item.type === "message" && item.role === "assistant")
        || ["function_call", "custom_tool_call", "computer_call", "local_shell_call"].includes(item.type)) {
        visibleAnchor += 1;
      }
    }
  }

  return anchors;
}

function normalizeClaudeEvents(events, runRoot) {
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

function normalizeCodexEvents(events, runRoot, model, reasoningAnchors = []) {
  const completed = events.filter((event) => event.type === "item.completed");
  const lastAgentMessage = completed.findLastIndex((event) => event.item?.type === "agent_message");
  const normalized = [];
  let reasoningIndex = 0;
  let visibleAnchor = 0;

  const add = (kind, fields = {}) => {
    normalized.push({
      id: `event-${normalized.length + 1}`,
      sequence: normalized.length + 1,
      kind,
      timestamp: null,
      elapsedSec: 0,
      ...fields,
    });
  };

  const flushReasoning = () => {
    while (reasoningIndex < reasoningAnchors.length && reasoningAnchors[reasoningIndex] <= visibleAnchor) {
      add("thinking", { label: "Reasoning block", redacted: true });
      reasoningIndex += 1;
    }
  };

  const addAnchored = (kind, fields = {}) => {
    flushReasoning();
    add(kind, fields);
    visibleAnchor += 1;
  };

  add("lifecycle", {
    label: "Session start",
    details: { cwd: "/workspace/task", model, tools: ["Shell", "File edit"] },
  });

  completed.forEach((event, completedIndex) => {
    const item = event.item ?? {};
    flushReasoning();
    if (item.type === "agent_message") {
      const output = preview(item.text, completedIndex === lastAgentMessage ? maxFinalChars : maxPreviewChars, runRoot);
      addAnchored(completedIndex === lastAgentMessage ? "final" : "assistant", {
        text: output.text,
        truncated: output.truncated,
      });
      return;
    }

    if (item.type === "reasoning") {
      add("thinking", { label: "Reasoning block", redacted: true });
      return;
    }

    if (item.type === "command_execution") {
      const omitResult = /(?:^|\/)artifacts\/model\.patch\b/.test(item.command ?? "");
      const rawResult = String(item.aggregated_output ?? "");
      const result = omitResult || /^diff --git /m.test(rawResult)
        ? { text: "[agent patch content omitted from the published trace]", truncated: false }
        : preview(rawResult, maxPreviewChars, runRoot);
      addAnchored("tool", {
        toolUseId: item.id ?? null,
        name: "Shell",
        input: { command: preview(item.command, 1800, runRoot).text },
        result: {
          isError: item.status === "failed" || (typeof item.exit_code === "number" && item.exit_code !== 0),
          text: result.text,
          truncated: result.truncated,
        },
      });
      return;
    }

    if (item.type === "file_change") {
      addAnchored("tool", {
        toolUseId: item.id ?? null,
        name: "File edit",
        input: {
          paths: (item.changes ?? []).map((change) => sanitizeText(change.path, runRoot)).join(", "),
        },
        result: { isError: item.status === "failed", text: item.status ?? "completed", truncated: false },
      });
      return;
    }

    if (item.type === "todo_list") {
      const text = (item.items ?? []).map((todo) => `${todo.completed ? "[x]" : "[ ]"} ${todo.text}`).join("\n");
      const output = preview(text, maxPreviewChars, runRoot);
      addAnchored("message", { label: "Plan update", text: output.text, truncated: output.truncated });
      return;
    }

    if (item.type === "error") {
      const output = preview(item.message, maxPreviewChars, runRoot);
      add("message", { label: "Runtime notice", text: output.text, truncated: output.truncated });
    }
  });

  flushReasoning();
  while (reasoningIndex < reasoningAnchors.length) {
    add("thinking", { label: "Reasoning block", redacted: true });
    reasoningIndex += 1;
  }

  return normalized;
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

function locateOpusRun(legacyTaskId) {
  const directory = path.join(runsRoot, `task_${legacyTaskId}`);
  if (!fs.existsSync(directory)) throw new Error(`Missing task directory: ${directory}`);
  const name = fs.readdirSync(directory).find((entry) => entry.includes(`-${legacyTaskId}-${runSuffix}`));
  if (!name) throw new Error(`Missing UCloud Opus run for task ${legacyTaskId}`);
  return path.join(directory, name);
}

function ensureGptWslRunsRoot() {
  if (gptWslRunsRoot) {
    if (!fs.existsSync(gptWslRunsRoot)) throw new Error(`GPT_WSL_RUNS_ROOT does not exist: ${gptWslRunsRoot}`);
    return gptWslRunsRoot;
  }
  if (!fs.existsSync(gptWslArchive)) {
    throw new Error(`GPT WSL source is unavailable. Set GPT_WSL_RUNS_ROOT to an extracted archive or GPT_WSL_ARCHIVE to the tarball (missing ${gptWslArchive}).`);
  }
  if (!gptExtractedRunsRoot) {
    gptExtractedRunsRoot = mkdtempSync(path.join(tmpdir(), "swe-science-gpt-"));
    execFileSync("tar", ["-xzf", gptWslArchive, "-C", gptExtractedRunsRoot], { stdio: "inherit" });
  }
  return gptExtractedRunsRoot;
}

function locateGptRun(entry) {
  const root = entry.source === "mac-primary"
    ? gptMacPrimaryRoot
    : entry.source === "mac-platform-amd64"
      ? gptMacPlatformRoot
      : ensureGptWslRunsRoot();
  const taskRoot = path.join(root, entry.source === "wsl-archive" ? `task_${entry.sourceTaskDir}` : "runs", ...(entry.source === "wsl-archive" ? [] : [`task_${entry.sourceTaskDir}`]));
  const expected = entry.runName ? path.join(taskRoot, entry.runName) : null;
  if (expected && fs.existsSync(expected)) return expected;
  if (!fs.existsSync(taskRoot)) throw new Error(`Missing GPT task directory: ${taskRoot}`);
  const candidates = fs.readdirSync(taskRoot)
    .filter((name) => fs.existsSync(path.join(taskRoot, name, "trial.json")))
    .filter((name) => !name.includes("without_auxiliary"));
  if (candidates.length === 1) return path.join(taskRoot, candidates[0]);
  const rerun = candidates.find((name) => name.includes("rerun"));
  if (rerun) return path.join(taskRoot, rerun);
  throw new Error(`Missing or ambiguous GPT run ${entry.runName} in ${taskRoot}`);
}

const experiments = [
  {
    id: "claude-opus-5-max",
    label: "Claude Opus 5 Max",
    model: "Claude Opus 5",
    harness: "Claude Code",
    parser: "claude",
    outputDir: "claude-opus-5-max",
    locateRun: locateOpusRun,
  },
  {
    id: "glm-5-2-max",
    label: "GLM-5.2 Max",
    model: "GLM-5.2",
    harness: "Codex",
    parser: "codex",
    outputDir: "glm-5-2-max",
    auditFile: path.join(reportsRoot, "glm-5.2-max-with_auxiliary-002-120-audit/selected_runs_and_evidence.json"),
  },
  {
    id: "qwen3-8-27b-max",
    label: "Qwen3.8-27B Max",
    model: "Qwen3.8-27B",
    harness: "Claude Code",
    parser: "claude",
    outputDir: "qwen3-8-27b-max",
    auditFile: path.join(reportsRoot, "qwen3.8-27b-responses-withaux-002-120-audit/selected_runs_and_token_usage.json"),
  },
  {
    id: "gpt-5-6-sol-max",
    label: "GPT-5.6-sol Max",
    model: "GPT-5.6-sol",
    harness: "Codex",
    parser: "codex",
    outputDir: "gpt-5-6-sol-max",
    selectionFile: gptSelectionFile,
  },
];

function selectedRunMap(experiment) {
  if (experiment.selectionFile) {
    const selection = readJson(experiment.selectionFile);
    if (Array.isArray(selection.entries)) {
      if (selection.entries.length !== 119) throw new Error(`Expected 119 GPT run selections in ${experiment.selectionFile}`);
      return new Map(selection.entries.map((entry) => [entry.legacyTaskId, entry]));
    }
    const macPrimary = new Set(selection.macPrimaryTaskIds ?? []);
    const macPlatform = new Set(selection.macPlatformTaskIds ?? []);
    const entries = [];
    for (let legacy = 2; legacy <= 120; legacy += 1) {
      const legacyTaskId = String(legacy).padStart(3, "0");
      const source = macPrimary.has(legacyTaskId) ? "mac-primary" : macPlatform.has(legacyTaskId) ? "mac-platform-amd64" : "wsl-archive";
      const sourceTaskDir = selection.wslTaskDirOverrides?.[legacyTaskId] ?? legacyTaskId;
      let runName = null;
      if (source === "mac-primary") runName = `codex-gpt-5.6-sol-${legacyTaskId}-xhigh-1`;
      if (source === "mac-platform-amd64") runName = selection.macPlatformRunOverrides?.[legacyTaskId]
        ?? `gpt-5.6-sol-xhigh-with_auxiliary-${legacyTaskId}-withaux-gpt-5.6-sol-xhigh-fair-20260801T0815Z`;
      if (source === "wsl-archive") runName = selection.wslRunOverrides?.[legacyTaskId] ?? null;
      entries.push({ publishedTaskId: legacyTaskId === "120" ? "001" : legacyTaskId, legacyTaskId, source, sourceTaskDir, runName });
    }
    return new Map(entries.map((entry) => [entry.legacyTaskId, entry]));
  }
  if (!experiment.auditFile) return null;
  const selected = readJson(experiment.auditFile);
  const entries = Array.isArray(selected) ? selected : selected.tasks;
  if (!Array.isArray(entries) || entries.length !== 119) throw new Error(`Expected 119 selected runs in ${experiment.auditFile}`);
  return new Map(entries.map((entry) => {
    const runPath = entry.trial_root ?? entry.run_path;
    if (!runPath) throw new Error(`Selected run has no path for task ${entry.task_id}`);
    return [String(entry.task_id).replace(/^task_/, ""), path.isAbsolute(runPath) ? runPath : path.join(benchmarkRoot, runPath)];
  }));
}

function locateSelectedRun(experiment, legacyTaskId, runMap) {
  const selected = experiment.locateRun ? null : runMap.get(legacyTaskId);
  const runRoot = experiment.locateRun
    ? experiment.locateRun(legacyTaskId)
    : experiment.selectionFile
      ? locateGptRun(selected)
      : selected;
  if (!runRoot || !fs.existsSync(runRoot)) throw new Error(`Missing selected ${experiment.id} run for task ${legacyTaskId}`);
  return runRoot;
}

function buildTask(experiment, legacyTaskId, runMap) {
  const runRoot = locateSelectedRun(experiment, legacyTaskId, runMap);
  const trial = readJson(path.join(runRoot, "trial.json"));
  const trajectory = readJson(path.join(runRoot, "logs/trajectory.json"));
  const verifierLog = fs.readFileSync(path.join(runRoot, "logs/verifier.log"), "utf8");
  const publishedTaskId = legacyTaskId === "120" ? "001" : legacyTaskId;
  const publishedTask = taskById.get(publishedTaskId);
  if (!publishedTask) throw new Error(`Missing published task ${publishedTaskId} in data/tasks.csv`);
  const trajectoryHasReasoning = trajectory.events?.some((event) => event.item?.type === "reasoning");
  const reasoningAnchors = experiment.parser === "codex" && !trajectoryHasReasoning ? readCodexReasoningAnchors(runRoot) : [];
  const events = experiment.parser === "codex"
    ? normalizeCodexEvents(trajectory.events ?? [], runRoot, experiment.model, reasoningAnchors)
    : normalizeClaudeEvents(trajectory.events ?? [], runRoot);
  const directUsage = trial.agent_run?.usage ?? {};
  const trajectoryUsage = trajectory.events?.findLast((event) => event.type === "turn.completed" && event.usage)?.usage ?? {};
  const inputTokens = directUsage.input_tokens ?? trajectoryUsage.input_tokens ?? null;
  const outputTokens = directUsage.output_tokens ?? trajectoryUsage.output_tokens ?? null;
  const usage = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: directUsage.total_tokens ?? trajectoryUsage.total_tokens ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null),
    cache_read_tokens: directUsage.cache_read_tokens ?? trajectoryUsage.cache_read_tokens ?? trajectoryUsage.cached_input_tokens ?? null,
    cache_creation_tokens: directUsage.cache_creation_tokens ?? trajectoryUsage.cache_creation_tokens ?? null,
    call_count: directUsage.call_count ?? trajectoryUsage.call_count ?? null,
    cost_usd: directUsage.cost_usd ?? trajectoryUsage.cost_usd ?? null,
    reasoning_output_tokens: directUsage.reasoning_output_tokens ?? trajectoryUsage.reasoning_output_tokens ?? null,
  };
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
      id: `${experiment.id}-${publishedTaskId}`,
      model: trial.agent_run?.model ?? experiment.model,
      harness: experiment.harness,
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
      reasoningOutputTokens: usage.reasoning_output_tokens ?? null,
    },
    evaluation,
    events,
  };
}

fs.rmSync(obsoleteOutputRoot, { recursive: true, force: true });

const registry = [];
for (const experiment of experiments) {
  const outputRoot = path.join(repoRoot, "public/traces", experiment.outputDir);
  const runMap = selectedRunMap(experiment);
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  const tasks = [];
  for (let legacy = 2; legacy <= 120; legacy += 1) {
    const legacyTaskId = String(legacy).padStart(3, "0");
    const task = buildTask(experiment, legacyTaskId, runMap);
    const file = `task-${task.task.publishedTaskId}.json`;
    fs.writeFileSync(path.join(outputRoot, file), `${JSON.stringify(task)}\n`);
    tasks.push({
      ...task.task,
      run: { id: task.run.id, model: task.run.model, harness: task.run.harness },
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
    experiment: { id: experiment.id, label: experiment.label, harness: experiment.harness },
    taskCount: tasks.length,
    tasks,
  };
  fs.writeFileSync(path.join(outputRoot, "index.json"), `${JSON.stringify(index)}\n`);
  registry.push({ id: experiment.id, label: experiment.label, harness: experiment.harness, path: experiment.outputDir, taskCount: tasks.length });
  console.log(`Wrote ${tasks.length} ${experiment.label} trace records.`);
}

fs.writeFileSync(path.join(repoRoot, "public/traces/index.json"), `${JSON.stringify({ version: 1, experiments: registry })}\n`);
