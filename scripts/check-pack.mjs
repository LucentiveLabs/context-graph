import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseNpmPackResult } from "./npm-pack-result.mjs";
const pack = parseNpmPackResult(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8" }), JSON.parse(readFileSync("package.json", "utf8")));
const forbidden = /(?:\/Users\/|\/home\/)[A-Za-z0-9_.-]+\/|SRC-20\d\d-\d\d-\d\d|(?:api[_-]?key|access[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_-]{20}/i;
for (const { path } of pack.files) {
  if (!/^(?:src\/|bin\/|schemas\/|skills\/context-graph\/|examples\/minimal\/|docs\/[a-z-]+\.md$|README\.md$|CONTRIBUTING\.md$|SECURITY\.md$|CHANGELOG\.md$|LICENSE$|package\.json$)/.test(path)) throw new Error(`Unexpected release file: ${path}`);
  if (forbidden.test(readFileSync(path, "utf8"))) throw new Error(`Private provenance or secret-shaped content in release file: ${path}`);
}
for (const file of ["bin/context-graph.mjs", "src/mcp.mjs", "skills/context-graph/SKILL.md", "LICENSE"]) if (!pack.files.some((row) => row.path === file)) throw new Error(`Missing release file: ${file}`);
console.log(JSON.stringify({ ok: true, name: pack.name, version: pack.version, files: pack.files.length, unpackedSize: pack.unpackedSize }));
