// Exercise the actual tarball in a clean directory, with its own dependency tree.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseNpmPackResult } from './npm-pack-result.mjs';
const directory = mkdtempSync(join(tmpdir(), 'context-graph-install-'));
try {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const pack = parseNpmPackResult(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', directory], { encoding: 'utf8' }), pkg);
  const tarball = join(directory, pack.filename);
  const sha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex');
  writeFileSync(join(directory, 'package.json'), '{"private":true,"type":"module"}\n');
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], { cwd: directory, encoding: 'utf8', timeout: 120000 });
  writeFileSync(join(directory, 'smoke.mjs'), `
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { loadWorkspace, contextFromWorkspace } from '@lucentive-labs/context-graph/workspace';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const root = 'node_modules/@lucentive-labs/context-graph/examples/minimal';
const bin = 'node_modules/@lucentive-labs/context-graph/bin/context-graph.mjs';
const request = { task: 'Explain the sample product', products: ['sample'], classes: ['library'], budget: 4096 };
const api = contextFromWorkspace(loadWorkspace(root), request);
assert.equal(api.report.ideas.status, 'selected');
assert.equal(api.overBudget, false);
const cli = JSON.parse(execFileSync(process.execPath, [bin, 'context', '--root', root, '--task', request.task, '--product', 'sample', '--class', 'library', '--budget', '4096', '--json'], { encoding: 'utf8' }));
assert.deepEqual(cli, api);
const client = new Client({ name: 'clean-install-check', version: '1.0.0' });
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [bin, 'mcp', '--root', root], stderr: 'pipe' }));
  const response = await client.callTool({ name: 'context', arguments: request });
  assert.ok(!response.isError);
  assert.deepEqual(JSON.parse(response.content[0].text), api);
} finally { await client.close(); }
console.log(JSON.stringify({ cli: 'pass', api: 'pass', mcp: 'pass', selectedIdeas: api.report.ideas.selected }));
`);
  const results = JSON.parse(execFileSync(process.execPath, ['smoke.mjs'], { cwd: directory, encoding: 'utf8', timeout: 30000 }));
  console.log(JSON.stringify({ ok: true, package: pack.name, version: pack.version, tarballSha256: sha256, integrity: pack.integrity, ...results }));
} finally { rmSync(directory, { recursive: true, force: true }); }
