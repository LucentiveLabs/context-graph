import assert from 'node:assert/strict';
import test from 'node:test';
import { projection } from './fixture.mjs';
import { checkLines, payloadProblems } from '../src/core/team.mjs';

// A synthetic family: one term retires two variants; the second is the accepted wording under docs/legacy/ only.
const allowedTerm = () => ({ handle: 'ctx:66666666', section: 'terms', binding: true, text: 'Use project record; old record and legacy record are retired, except legacy record in the legacy guide.',
  preferred: ['project record'], deprecated: [{ text: 'old record', re: '\\bold record\\b' }, { text: 'legacy record', re: '\\blegacy record\\b', flags: 'i', allowed_paths: ['docs/legacy/**'] }] });
const withTerm = () => { const p = projection(); p.items = p.items.filter((it) => it.section !== 'terms'); p.items.push(allowedTerm()); return p; };
const found = (payload, path, text) => checkLines([payload], { lines: [{ path, line: 1, text }] }).map((f) => `${f.kind}:${f.found}`);

test('an allowed variant gives no finding on its allowed paths', () => {
  assert.deepEqual(payloadProblems(withTerm()), []);
  assert.deepEqual(found(withTerm(), 'docs/legacy/intro.md', 'The Legacy Record keeps every decision.'), []);
});

test('the term\'s other variants still drift on an allowed path', () => {
  assert.deepEqual(found(withTerm(), 'docs/legacy/intro.md', 'The old record keeps every decision.'), ['term-drift:old record']);
  assert.deepEqual(found(withTerm(), 'docs/legacy/intro.md', 'The old record and the legacy record differ.'), ['term-drift:old record']);
});

test('an allowed variant still drifts outside its allowed paths', () => {
  assert.deepEqual(found(withTerm(), 'docs/guide.md', 'The legacy record keeps every decision.'), ['term-drift:legacy record']);
  assert.deepEqual(found(withTerm(), 'docs/legacy.md', 'The legacy record keeps every decision.'), ['term-drift:legacy record']);
});

test('held paths stay held for every variant, and an allowance outranks the hold for its own variant', () => {
  const p = withTerm(); Object.assign(p.items.at(-1), { held_paths: ['docs/**'], held_reason: 'a synthetic hold' });
  assert.deepEqual(found(p, 'docs/guide.md', 'The old record and the legacy record differ.'), ['held:old record', 'held:legacy record']);
  assert.deepEqual(found(p, 'docs/legacy/intro.md', 'The old record and the legacy record differ.'), ['held:old record']);
});

test('allowed_paths must list path globs', () => {
  for (const bad of ['docs/legacy/**', [], [''], [1]]) {
    const p = withTerm(); p.items.at(-1).deprecated[1].allowed_paths = bad;
    assert.ok(payloadProblems(p).some((x) => x.includes('allowed_paths')), JSON.stringify(bad));
  }
});

test('the rendered projection lists the allowance and the leak scan treats it as a path', async () => {
  const { renderContextMd, projectionLeaks } = await import('../src/core/project.mjs');
  const payload = { ...withTerm(), label: 'Sample', generated: '2026-10-07', policy_revision: 'synthetic', source_snapshot: 'synthetic', gate: { mode: 'blocking' } };
  const md = renderContextMd(payload);
  assert.match(md, /Retired: old record, legacy record \(allowed in docs\/legacy\/\*\*\)\./);
  const globScanner = { scan: (text) => (/\*\*/.test(text) ? [{ id: 'glob' }] : []) };
  assert.ok(!projectionLeaks(globScanner, payload, md).some((h) => /allowed_paths/.test(h.at)));
});

test('impact does not count an allowed variant in an artifact on its allowed paths', async () => {
  const { makeServer } = await import('../src/core/serve.mjs');
  const anchor = { id: 'anchor:term-sample', kind: 'FounderAnchor', anchor_kind: 'term', scope: 'sample canon', preferred: 'project record', deprecated: ['old record', 'legacy record'], state: 'accepted', valid_to: null };
  const nodes = new Map([[anchor.id, { record: anchor }]]);
  const rule = { id: 'term-sample', section: 'terms', basis: [anchor.id], text: allowedTerm().text, preferred: ['project record'], deprecated: allowedTerm().deprecated };
  const texts = { 'artifact:legacy-allowed': 'The legacy record.', 'artifact:legacy-old': 'The old record.', 'artifact:guide-legacy': 'The legacy record.' };
  const artifacts = [
    { id: 'artifact:legacy-allowed', repo: 'team', path: 'docs/legacy/intro.md', product: 'sample', kind: 'brief' },
    { id: 'artifact:legacy-old', repo: 'team', path: 'docs/legacy/old.md', product: 'sample', kind: 'brief' },
    { id: 'artifact:guide-legacy', repo: 'team', path: 'docs/guide.md', product: 'sample', kind: 'brief' },
  ];
  const view = { graph: { nodes, assertions: [], table: {} }, serving: { parent_product: 'sample', team_repo: 'team' }, canon: { rules: [rule] }, snapshot: { products: [{ id: 'sample', class: 'product', relations: {} }], artifacts }, projections: new Map(), verified: () => true,
    occurrences: (a, deprecated) => deprecated.reduce((n, d) => n + (texts[a.id].match(new RegExp(d.re, `${d.flags || ''}g`)) || []).length, 0) };
  const ids = makeServer(view).impactOf(anchor.id).dependents.filter((d) => d.kind === 'artifact').map((d) => d.id).sort();
  assert.deepEqual(ids, ['artifact:guide-legacy', 'artifact:legacy-old']);
});
