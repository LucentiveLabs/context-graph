#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { loadWorkspace, contextFromWorkspace, checkWorkspace, workspaceStatus, WorkspaceError } from "../src/workspace.mjs";

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    root: { type: "string", default: process.cwd() }, parent: { type: "string", default: "CONTEXT.md" },
    task: { type: "string" }, product: { type: "string", multiple: true }, class: { type: "string", multiple: true },
    repo: { type: "string" }, path: { type: "string", multiple: true },
    budget: { type: "string", default: "12288" }, json: { type: "boolean" }, help: { type: "boolean" },
  } });
  const command = positionals[0];
  if (values.help || !command) {
    process.stdout.write("context-graph <context|check|status|mcp> --root <workspace> [--parent CONTEXT.md]\ncontext: --task <text> [--product <id>] [--class story|governance|library|orientation|engineering] [--repo <id>] [--path <relative-path>] [--budget <bytes>] [--json]\ncheck: reads {lines:[{path,line,text}]} from stdin\n");
  } else {
    if (positionals.length !== 1 || !["context", "check", "status", "mcp"].includes(command)) throw new WorkspaceError("INPUT_INVALID", "Unknown command or unexpected positional argument.");
    if (command === "mcp") {
      const { startServer } = await import("../src/mcp.mjs");
      await startServer(values.root, { parentPath: values.parent });
    } else {
      const workspace = loadWorkspace(values.root, { parentPath: values.parent });
      const result = command === "context" ? contextFromWorkspace(workspace, { task: values.task, products: values.product, classes: values.class, budget: Number(values.budget), repo: values.repo, paths: values.path })
        : command === "check" ? checkWorkspace(workspace, JSON.parse(readFileSync(0, "utf8"))) : workspaceStatus(workspace);
      process.stdout.write(command === "context" && !values.json ? result.text : `${JSON.stringify(result, null, 2)}\n`);
    }
  }
} catch (error) {
  const result = error instanceof WorkspaceError ? { ok: false, code: error.code, error: error.message } : { ok: false, code: "REQUEST_FAILED", error: "The request failed; verify the arguments and projection files." };
  process.stderr.write(`${JSON.stringify(result)}\n`); process.exitCode = 1;
}
