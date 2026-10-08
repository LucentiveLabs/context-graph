import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { projection, markdown } from './fixture.mjs';
import { sha256, taskWords, teamBundle, payloadProblems } from '../src/core/team.mjs';
import { loadWorkspace, contextFromWorkspace } from '../src/workspace.mjs';

const source = '# Sample\nThe API adapter reads approved records. Capture belongs to its owner.\n';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'context-repository-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const p = projection();
  p.repository = { id: 'sample-repo', sources: [{ path: 'README.md', sha256: sha256(source) }] };
  p.items.push(
    { handle: 'ctx:aaaa0001', section: 'map', binding: false, text: 'The API adapter reads approved records; capture is a separate boundary.', classes: ['orientation', 'engineering'], source_paths: ['README.md'] },
    { handle: 'ctx:aaaa0002', section: 'decisions', binding: true, text: 'Capture belongs to its owner.', classes: ['orientation', 'engineering'], source_paths: ['README.md'] },
    { handle: 'ctx:aaaa0003', section: 'claims', binding: false, text: 'The API reader entry point is src/api.mjs.', classes: ['engineering'], paths: ['src/**'], source_paths: ['README.md'] },
  );
  writeFileSync(join(root, 'README.md'), source);
  writeFileSync(join(root, 'CONTEXT.md'), markdown(p));
  return { root, p };
}
const request = { task: 'Explain this repository purpose, architecture, boundaries and current implementation.', classes: ['orientation'], repo: 'sample-repo', budget: 4096 };

test('the shipped repository baseline resolves current source bytes and fits its orientation budget', () => {
  const workspace = loadWorkspace(fileURLToPath(new URL('../', import.meta.url)));
  const result = contextFromWorkspace(workspace, { ...request, repo: 'context-graph' });
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 8);
  assert.deepEqual(result.report.truncated, []);
  assert.ok(result.bytes <= 4096);
  assert.equal(result.overBudget, false);
});

test('missing repository ids and malformed source metadata have explicit errors', (t) => {
  const { root, p } = fixture(t);
  assert.throws(() => contextFromWorkspace(loadWorkspace(root), { ...request, products: null }), { code: 'INPUT_INVALID' });
  delete p.repository;
  p.items = p.items.slice(0, 3);
  writeFileSync(join(root, 'CONTEXT.md'), markdown(p));
  assert.throws(() => contextFromWorkspace(loadWorkspace(root), { ...request, repo: null }), { code: 'REPOSITORY_UNKNOWN' });
  p.items[0].source_paths = 'README.md';
  assert.ok(payloadProblems(p).some(x => x.includes('source_paths')));
  writeFileSync(join(root, 'CONTEXT.md'), markdown(p));
  assert.throws(() => loadWorkspace(root), { code: 'PROJECTION_INVALID' });
  p.items = [null];
  assert.ok(payloadProblems(p).some(x => x.includes('items must')));
});

test('repository classes cannot introduce product validation rules', (t) => {
  const { p } = fixture(t);
  for (const section of ['terms', 'checks', 'acceptance']) {
    const candidate = structuredClone(p);
    candidate.items[3].section = section;
    assert.ok(payloadProblems(candidate).some(x => x.includes('repository classes cannot declare')));
  }
});

test('repository orientation has sourced context without unrelated story bindings or library ideas', (t) => {
  const { root } = fixture(t);
  const result = contextFromWorkspace(loadWorkspace(root), request);
  assert.match(result.text, /API adapter/);
  assert.match(result.text, /Capture belongs/);
  assert.doesNotMatch(result.text, /old record|Optional inspiration/);
  assert.equal(result.report.ideas.status, 'not-requested');
  assert.equal(result.report.sources[0].sha256, sha256(source));
  assert.deepEqual(result.items.map(x => x.handle).sort(), ['ctx:aaaa0001', 'ctx:aaaa0002']);
  const cli = spawnSync(process.execPath, ['bin/context-graph.mjs', 'context', '--root', root, '--task', request.task, '--class', 'orientation', '--repo', 'sample-repo', '--budget', '4096', '--json'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(cli.stdout), result);
});

test('baseline source mutation, missing files and escaped references cannot appear current', (t) => {
  const { root, p } = fixture(t);
  writeFileSync(join(root, 'README.md'), 'Changed architecture');
  assert.throws(() => loadWorkspace(root), { code: 'SOURCE_STALE' });
  rmSync(join(root, 'README.md'));
  assert.throws(() => loadWorkspace(root), { code: 'FILE_UNREADABLE' });
  const outside = fixture(t);
  symlinkSync(join(outside.root, 'README.md'), join(root, 'README.md'));
  assert.throws(() => loadWorkspace(root), { code: 'PATH_REFUSED' });
  p.items[3].source_paths = ['unregistered.md'];
  writeFileSync(join(root, 'CONTEXT.md'), markdown(p));
  assert.throws(() => loadWorkspace(root), { code: 'PROJECTION_INVALID' });
});

test('engineering paths narrow optional context while global bindings survive tiny budgets', (t) => {
  const { root } = fixture(t); const workspace = loadWorkspace(root);
  const args = { ...request, task: 'Trace API boundary', classes: ['engineering'], paths: ['src/api.mjs'] };
  const result = contextFromWorkspace(workspace, args);
  assert.match(result.text, /src\/api.mjs/);
  const other = contextFromWorkspace(workspace, { ...args, paths: ['docs/guide.md'] });
  assert.doesNotMatch(other.text, /entry point/);
  assert.match(other.text, /Capture belongs/);
  const small = contextFromWorkspace(workspace, { ...args, budget: 1 });
  assert.equal(small.overBudget, true);
  assert.equal(small.items.length, 1);
  assert.equal(small.items[0].handle, 'ctx:aaaa0002');
  for (const bad of [{ repo: 'unknown' }, { paths: ['../other'] }, { classes: ['orientation', 'story'] }]) assert.throws(() => contextFromWorkspace(workspace, { ...args, ...bad }));
});

test('short identifiers and canonical Unicode match whole tokens, never substrings', () => {
  assert.deepEqual(taskWords('IAS One API SEO the and'), ['ias', 'one', 'api', 'seo']);
  const p = projection();
  p.items.push({ handle: 'ctx:aaaa0001', section: 'ideas', binding: false, text: 'The deadline is fixed.' });
  assert.equal(teamBundle([p], { task: 'line', classes: ['library'] }).report.ideas.status, 'no-relevant-ideas');
  p.items.push({ handle: 'ctx:aaaa0002', section: 'ideas', binding: false, text: 'The API has a café boundary.' });
  assert.equal(teamBundle([p], { task: 'API cafe\u0301', classes: ['library'] }).items.at(-1).handle, 'ctx:aaaa0002');
});

test('real MCP repository delivery equals the library and rechecks source freshness', async (t) => {
  const { root } = fixture(t);
  const client = new Client({ name: 'repo-test', version: '1.0.0' });
  t.after(async () => client.close());
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['bin/context-graph.mjs', 'mcp', '--root', root], stderr: 'pipe' }));
  const result = await client.callTool({ name: 'context', arguments: request });
  assert.ok(!result.isError);
  assert.deepEqual(JSON.parse(result.content[0].text), contextFromWorkspace(loadWorkspace(root), request));
  writeFileSync(join(root, 'README.md'), 'Changed');
  const stale = await client.callTool({ name: 'context', arguments: request });
  assert.equal(stale.isError, true);
  assert.match(stale.content[0].text, /SOURCE_STALE/);
});
