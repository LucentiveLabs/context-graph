import assert from 'node:assert/strict';
import test from 'node:test';
import { projection } from './fixture.mjs';
import { teamBundle, receiptProblems, RECEIPT_SCHEMA, SELECTION_ALGORITHM } from '../src/core/team.mjs';

const idea = (n, text) => ({ handle: `ctx:${n.toString(16).padStart(8, '0')}`, section: 'ideas', binding: false, text });
const request = { task: 'Explain patient reflection and response', products: ['sample'], classes: ['library'] };

test('library supplies task-specific ideas and preserves scoped acceptance in every class', () => {
  const p = projection();
  p.items.push(idea(10, 'Patient reflection before response.'), idea(11, 'Collaboration and shared workflow.'));
  p.items.push({ handle: 'ctx:55555555', section: 'acceptance', binding: true, text: 'Explain the first step.', requirement: 'phrases', phrases: ['first step'], applies_to: { scope: 'product', product: 'sample', page: 'landing' } });
  const library = teamBundle([p], request);
  assert.equal(library.report.ideas.status, 'selected');
  assert.deepEqual(library.items.filter(x => x.section === 'ideas').map(x => x.handle), ['ctx:0000000a']);
  assert.equal(library.binding.at(-1).applies_to.page, 'landing');
  const governance = teamBundle([p], { ...request, classes: ['governance'] });
  assert.equal(governance.report.ideas.status, 'not-requested');
  assert.deepEqual(governance.binding, library.binding);
  const other = teamBundle([p], { ...request, task: 'Explain collaboration workflow' });
  assert.deepEqual(other.items.filter(x => x.section === 'ideas').map(x => x.handle), ['ctx:0000000b']);
  const noRelevance = teamBundle([p], { ...request, task: 'Illustrate photosynthesis' });
  assert.equal(noRelevance.report.ideas.status, 'no-relevant-ideas');
  assert.equal(noRelevance.report.ideas.candidates, 3);
});

test('tight realistic budgets retain ideas, skip oversized candidates and preserve every binding byte', () => {
  const p = projection();
  p.items = p.items.filter(x => x.binding);
  p.items[0].text += ' A current product constraint.'.repeat(45);
  p.items.push(idea(10, 'Reflection response patient '.repeat(500)), idea(11, 'Patient reflection makes room for a considered response.'));
  for (let n = 20; n < 40; n++) p.items.push({ ...idea(n, 'Current product fact. '.repeat(20)), section: 'claims' });
  const b = teamBundle([p], { ...request, classes: ['story'], budget: 4096 });
  assert.ok(b.bytes <= 4096);
  assert.equal(b.report.ideas.status, 'selected');
  assert.ok(b.items.some(x => x.handle === 'ctx:0000000b'));
  assert.ok(b.report.truncated.includes('ctx:0000000a'));
  assert.equal(b.binding[1].text, p.items[0].text);
  const overflow = teamBundle([p], { ...request, budget: 1 });
  assert.equal(overflow.report.ideas.status, 'bindings-over-budget');
  assert.equal(overflow.requiredBytes, overflow.bytes);
  assert.equal(overflow.items.length, overflow.binding.length);
  assert.match(overflow.text, /WARNING: bindings/);
  assert.equal(overflow.binding[1].text, p.items[0].text);
});

test('equal-scoring ideas have stable handle order independent of projection item order', () => {
  const p = projection(); p.items.push(idea(10, 'Patient reflection.'), idea(11, 'Patient response.'));
  const a = teamBundle([p], request);
  const b = teamBundle([{ ...p, items: [...p.items].reverse() }], request);
  assert.equal(a.sha256, b.sha256);
});

test('new receipts explicitly bind the selection algorithm and reject historical v1 for current delivery', () => {
  assert.equal(RECEIPT_SCHEMA, 'context-receipt/v2');
  assert.equal(SELECTION_ALGORITHM, 'context-selection/v2');
  assert.match(receiptProblems({ schema: 'context-receipt/v1' })[0], /v2/);
  assert.ok(receiptProblems({ schema: RECEIPT_SCHEMA }).some(x => x.includes('selectionAlgorithm')));
});

test('projection builder exports the full eligible concept pool with conservative evidence and exclusions', async () => {
  const { makeServer } = await import('../src/core/serve.mjs');
  const { buildPayload, renderContextMd } = await import('../src/core/project.mjs');
  const product = { id: 'sample', label: 'Sample', class: 'product', apps: [], relations: {} };
  const nodes = new Map([['product:sample', { record: { id: 'product:sample', kind: 'Product' } }]]);
  const assertions = [];
  for (let n = 0; n < 9; n++) {
    const id = `concept:sample-${n}`;
    nodes.set(id, { record: { id, kind: 'Concept', label: `Sample idea ${n}`, definition: 'Patient reflection supports a considered response.', excludes: ['No therapeutic claim'], examples: ['item:sample#I001', 'excerpt:sample#E001', 'item:private#I001'], state: n === 8 ? 'retired' : 'accepted' } });
    assertions.push({ record: { id: `edge:sample-${n}`, from: id, to: 'product:sample', predicate: 'candidate_application', confidence: 0.8 } });
  }
  nodes.set('item:sample#I001', { record: { id: 'item:sample#I001', kind: 'Item' } });
  nodes.set('excerpt:sample#E001', { record: { id: 'excerpt:sample#E001', kind: 'Excerpt', verified_against_sha256: 'a'.repeat(64) } });
  nodes.set('item:private#I001', { record: { id: 'item:private#I001', kind: 'Item', policy: { visibility: 'founder-private' } } });
  const view = { graph: { nodes, assertions, table: {} }, serving: { parent_product: 'sample', team_repo: 'sample', ideas_per_product: 6 }, canon: {}, snapshot: { products: [product], artifacts: [] }, exports: new Map(), salt: 'synthetic-only', policyRevision: 'synthetic', verified: () => true };
  const server = makeServer(view);
  assert.equal(server.ideasFor('sample').length, 8);
  const { payload, basis } = buildPayload(view, server, 'sample', { date: '2026-10-06' });
  const ideas = payload.items.filter(x => x.section === 'ideas');
  assert.equal(ideas.length, 8);
  assert.deepEqual(ideas[0].exclusions, ['No therapeutic claim']);
  assert.equal(ideas[0].evidence[0].kind, 'unknown');
  assert.equal(ideas[0].evidence.length, 2);
  assert.equal(ideas[0].evidence[1].kind, 'primary-excerpt');
  assert.match(basis[ideas[0].handle].hashes['item:sample#I001'], /^[a-f0-9]{64}$/);
  assert.match(basis[ideas[0].handle].hashes['excerpt:sample#E001'], /^[a-f0-9]{64}$/);
  assert.equal(server.recordRef('item:sample#I001'), 'item:sample#I001');
  assert.equal(server.recordRef('item:sample#I001#selector'), 'item:sample#I001');
  assert.match(ideas[0].evidence[0].handle, /^ctx:[a-f0-9]{8}$/);
  assert.ok(!JSON.stringify(payload).includes('item:sample'));
  assert.throws(() => renderContextMd({ ...payload, items: [{ ...ideas[0], text: 'x'.repeat(1024 * 1024) }] }), /exceeds 1 MiB/);
});


test('a product name alone does not make an unrelated idea relevant', () => {
  const p = projection(); p.items.push(idea(12, 'The sample uses a garden metaphor for seasonal growth.'));
  const b = teamBundle([p], { ...request, task: 'Explain sample astronomy' });
  assert.equal(b.report.ideas.status, 'no-relevant-ideas');
});
