import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadWorkspace, contextFromWorkspace, checkWorkspace } from "../src/workspace.mjs";
import { compileSchemas, GRAPH_SCHEMA_NAMES } from "../src/core/schemas.mjs";
import { projection, markdown } from "./fixture.mjs";

function fixture(t, payload = projection()) {
  const root = mkdtempSync(join(tmpdir(), "context-graph-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "CONTEXT.md"), markdown(payload));
  return root;
}

test("CLI and library preserve binding constraints beyond the budget and report omissions", (t) => {
  const root = fixture(t); const workspace = loadWorkspace(root);
  const result = contextFromWorkspace(workspace, { task: "Explain the sample product", products: ["sample"], budget: 1 });
  assert.equal(result.overBudget, true); assert.equal(result.binding.length, 2);
  assert.match(result.text, /project decisions/); assert.match(result.text, /old record is deprecated/);
  assert.deepEqual(result.report.truncated, ["ctx:44444444"]); assert.equal(result.report.inaccessible.length, 1);
  const cli = spawnSync(process.execPath, ["bin/context-graph.mjs", "context", "--root", root, "--task", "Explain the sample product", "--product", "sample", "--budget", "1", "--json"], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr); assert.deepEqual(JSON.parse(cli.stdout), result);
});

test("changed text is checked against shared projection rules", (t) => {
  const result = checkWorkspace(loadWorkspace(fixture(t)), { lines: [{ path: "docs/guide.md", line: 5, text: "This old record describes the project." }] });
  assert.equal(result.findings.length, 1); assert.equal(result.findings[0].kind, "term-drift"); assert.equal(result.findings[0].line, 5);
});

test("unresolved, expired, mismatched and escaped projections refuse context", (t) => {
  const payload = projection(); const root = fixture(t, payload);
  assert.throws(() => loadWorkspace(root, { today: "2100-01-01" }), { code: "PROJECTION_STALE" });
  payload.gate_config.projections.push({ path: "missing.md", handle: "ctx:55555555", product: "missing" });
  writeFileSync(join(root, "CONTEXT.md"), markdown(payload)); assert.throws(() => loadWorkspace(root), { code: "FILE_UNREADABLE" });
  const outside = fixture(t); symlinkSync(join(outside, "CONTEXT.md"), join(root, "missing.md"));
  assert.throws(() => loadWorkspace(root), { code: "PATH_REFUSED" });
  rmSync(join(root, "missing.md")); payload.gate_config.projections[1].path = "../outside.md";
  writeFileSync(join(root, "CONTEXT.md"), markdown(payload)); assert.throws(() => loadWorkspace(root), { code: "PATH_REFUSED" });
});

test("unknown products and routine classification cannot silently get a story bundle", (t) => {
  const workspace = loadWorkspace(fixture(t));
  assert.throws(() => contextFromWorkspace(workspace, { task: "Repair API", classes: ["routine"] }), { code: "CLASS_UNSUPPORTED" });
  assert.throws(() => contextFromWorkspace(workspace, { task: "Describe product", products: ["absent"] }), { code: "PRODUCT_UNKNOWN" });
});

test("all shipped graph schemas compile and core namespaces import without private adapters", async () => {
  const raw = Object.fromEntries(GRAPH_SCHEMA_NAMES.map((name) => [name, JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), "utf8"))]));
  const schemas = compileSchemas(raw); assert.equal(schemas.node({}), false);
  const core = await import("../src/index.mjs"); assert.equal(typeof core.serve.makeServer, "function"); assert.equal(typeof core.intent.mintIntent, "function");
});
