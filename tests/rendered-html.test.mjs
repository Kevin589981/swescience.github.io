import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("renders the SWE-bench Science project page", async () => {
  const html = await readFile(new URL("../out/index.html", import.meta.url), "utf8");
  assert.match(html, /<title>SWE-bench Science — Leaderboard<\/title>/i);
  assert.match(html, /Leaderboard/);
  assert.match(html, /Model results/);
  assert.match(html, /119/);
  assert.match(html, /huggingface\.co\/datasets\/OpenMOSS-Team\/SWE-bench-Science/);
  assert.match(html, /github\.com\/OpenMOSS\/SWE-bench-Science/);
});
