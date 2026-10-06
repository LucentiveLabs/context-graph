import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadWorkspace, contextFromWorkspace, checkWorkspace, workspaceStatus, WorkspaceError } from "./workspace.mjs";

export function createServer(root, options = {}) {
  const server = new McpServer({ name: "context-graph", version: "0.2.0" });
  // Root and parent are startup configuration. A tool call cannot change them.
  const call = (fn) => async (args) => {
    try { return { content: [{ type: "text", text: JSON.stringify(fn(loadWorkspace(root, options), args)) }] }; }
    catch (error) { return { isError: true, content: [{ type: "text", text: error instanceof WorkspaceError ? `${error.code}: ${error.message}` : "Context request failed." }] }; }
  };
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  server.registerTool("context", { description: "Read a team projection context bundle. Binding constraints remain complete; optional content fits a byte budget. Source capture and routine scope classification belong to the owning policy adapter.", inputSchema: {
    task: z.string().min(1).max(16000), products: z.array(z.string()).max(100).optional(),
    classes: z.array(z.enum(["story", "governance", "library"])).min(1).max(3).optional(), budget: z.number().int().positive().max(1048576).optional(),
  }, annotations }, call(contextFromWorkspace));
  server.registerTool("check", { description: "Check supplied changed lines against the registered team projection rules. Reads no arbitrary file paths.", inputSchema: {
    lines: z.array(z.object({ path: z.string().max(1000), line: z.number().int().positive(), text: z.string().max(16000) })).max(10000), products: z.array(z.string()).max(100).optional(),
  }, annotations }, call(checkWorkspace));
  server.registerTool("status", { description: "Read projection revisions, item counts and revalidation dates for this configured workspace.", inputSchema: {}, annotations }, call(workspaceStatus));
  return server;
}

export async function startServer(root, options) {
  loadWorkspace(root, options);
  const server = createServer(root, options);
  await server.connect(new StdioServerTransport());
  return server;
}
