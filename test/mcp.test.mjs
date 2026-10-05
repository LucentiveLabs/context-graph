import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { loadWorkspace, contextFromWorkspace } from "../src/workspace.mjs";
import { projection, markdown } from "./fixture.mjs";

test("the actual stdio server returns CLI-equivalent context, reloads changes and has no write tools", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "context-graph-mcp-")); const payload = projection();
  writeFileSync(join(root, "CONTEXT.md"), markdown(payload));
  const client = new Client({ name: "context-graph-test", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: ["bin/context-graph.mjs", "mcp", "--root", root], stderr: "pipe" });
  t.after(async () => { await client.close(); rmSync(root, { recursive: true, force: true }); });
  await client.connect(transport);
  const list = await client.listTools(); assert.deepEqual(list.tools.map((tool) => tool.name).sort(), ["check", "context", "status"]);
  assert.ok(list.tools.every((tool) => tool.annotations.readOnlyHint && !tool.annotations.openWorldHint));
  const request = { task: "Explain the sample product", products: ["sample"], budget: 1 };
  const first = await client.callTool({ name: "context", arguments: request }); assert.ok(!first.isError);
  assert.deepEqual(JSON.parse(first.content[0].text), contextFromWorkspace(loadWorkspace(root), request));
  payload.items[0].text = "Updated sample definition."; writeFileSync(join(root, "CONTEXT.md"), markdown(payload));
  const second = JSON.parse((await client.callTool({ name: "context", arguments: request })).content[0].text);
  assert.notEqual(second.sha256, JSON.parse(first.content[0].text).sha256); assert.match(second.text, /Updated sample definition/);
  const privateRequest = await client.callTool({ name: "explain", arguments: { id: "private" } }); assert.equal(privateRequest.isError, true);
  payload.revalidate_by = "2000-01-01"; writeFileSync(join(root, "CONTEXT.md"), markdown(payload));
  assert.equal((await client.callTool({ name: "context", arguments: request })).isError, true);
});
