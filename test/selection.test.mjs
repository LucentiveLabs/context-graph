import assert from 'node:assert/strict';
import test from 'node:test';
import { projection, markdown } from './fixture.mjs';
import { teamBundle, coverage, evaluateGate, receiptProblems, RECEIPT_SCHEMA, SELECTION_ALGORITHM } from '../src/core/team.mjs';

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
  assert.equal(ideas[0].evidence[1].kind, 'unknown', 'hash verification alone does not establish primary-source status');
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

test('equal prose retains distinct exclusions, evidence and acceptance scopes', () => {
  const p = projection();
  const text = 'Patient reflection.';
  p.items.push({ ...idea(20, text), relation: 'documented influence', exclusions: ['No therapeutic claim'], evidence: [{ handle: 'ctx:88888888', kind: 'digest' }] }, { ...idea(21, text), relation: 'candidate application', exclusions: [], evidence: [] });
  for (const [n, page] of [[22, 'landing'], [23, 'docs/guide.html']]) p.items.push({ ...idea(n, 'Explain the first step.'), section: 'acceptance', binding: true, applies_to: { scope: 'product', product: 'sample', page } });
  const b = teamBundle([p], request);
  assert.equal(b.items.filter(x => x.text === text).length, 2);
  assert.equal(b.binding.filter(x => x.section === 'acceptance').length, 2);
  assert.match(b.text, /No therapeutic claim/);
  assert.match(b.text, /relationship stated per item/);
  assert.doesNotMatch(b.text, /not documented influence/);
});

test('delivery coverage preserves equal-prose obligations with distinct scopes and requirements', () => {
  const parent = projection();
  const rule = { section: 'acceptance', binding: true, text: 'Explain the first step.', requirement: 'phrases', phrases: ['first step'], applies_to: { scope: 'product', product: 'sample', page: 'landing' } };
  parent.items.push({ ...rule, handle: 'ctx:00000022' });
  parent.gate_config.projections.push({ path: 'product.md', handle: 'ctx:aaaaaaaa', product: 'sample' });
  const own = { ...projection(), scope: 'product', projection: 'ctx:aaaaaaaa', family: true,
    paths: { story: ['docs/**'], pages: ['docs/*.html'], entries: ['docs/*.html'], landing: ['docs/index.html'], read: [], specific: false },
    items: [{ ...rule, handle: 'ctx:00000023', applies_to: { scope: 'product', product: 'sample', page: 'docs/guide.html' } },
      { ...rule, handle: 'ctx:00000024', phrases: ['second step'], applies_to: { scope: 'product', product: 'sample', page: 'docs/guide.html' } }] };
  delete own.gate_config;
  const files = new Map([['docs/index.html', '<p>The first step appears here.</p>'], ['docs/guide.html', '<p>This guide omits both required instructions.</p>']]);
  const changed = ['docs/guide.html'];
  const rows = coverage([parent, own], { products: ['sample'], files, changed });
  assert.deepEqual(rows.map(x => [x.rule, x.page, x.ok]), [['ctx:00000023', 'docs/guide.html', false], ['ctx:00000024', 'docs/guide.html', false]]);
  const gate = evaluateGate({ contextFiles: new Map([['CONTEXT.md', markdown(parent)], ['product.md', markdown(own)]]), parentPath: 'CONTEXT.md', changed, files });
  assert.equal(gate.ok, false);
  assert.equal(gate.blocking.filter(x => x.includes('coverage sample docs/guide.html')).length, 2);
  files.set('docs/guide.html', '<p>The first step and the second step appear here.</p>');
  assert.ok(coverage([parent, own], { products: ['sample'], files, changed }).every(x => x.ok));
  own.items[0].applies_to.page = 'unresolved-guide';
  assert.ok(coverage([parent, own], { products: ['sample'], files, changed }).some(x => !x.ok && x.detail.includes('not a known product page')));
});

test('receipt accepts the full documented context budget range', () => {
  for (const budget of [1, 1024, 65536, 1048576]) {
    assert.ok(!receiptProblems({ schema: RECEIPT_SCHEMA, budget }).some(x => x.includes('integer budget')));
  }
  for (const budget of [0, 1.5, 1048577]) assert.ok(receiptProblems({ schema: RECEIPT_SCHEMA, budget }).some(x => x.includes('integer budget')));
});

test('private bundles keep large omission inventories outside the prompt and report binding overflow', async () => {
  const { makeServer } = await import('../src/core/serve.mjs');
  const nodes = new Map(), assertions = [];
  for (let n = 0; n < 1000; n++) {
    const id = `concept:synthetic-long-identifier-${n}`;
    nodes.set(id, { record: { id, kind: 'Concept', label: 'Reflection', definition: 'Patient reflection supports a considered response.', state: 'accepted' } });
    assertions.push({ record: { id: `edge:${n}`, from: id, to: 'product:sample', predicate: 'candidate_application', confidence: 0.8 } });
  }
  const server = makeServer({ graph: { nodes, assertions, table: {} }, serving: { parent_product: 'sample', private_repos: ['private-fixture'] }, canon: {}, snapshot: { products: [{ id: 'sample', class: 'product', relations: {} }] }, scanner: () => ({ scan: () => [] }), verified: () => true });
  const req = { task: 'Explain reflection', product: 'sample', kind: 'story', surface: 'private', repo: 'private-fixture' };
  const result = server.context({ ...req, budget: 4096 });
  assert.equal(result.profile, 'private'); assert.equal(result.ok, true);
  assert.ok(result.bytes <= 4096); assert.equal(result.overBudget, false);
  assert.equal(result.included.length + result.report.truncated.length, 1000);
  assert.ok(result.report.truncated.length > 900);
  assert.match(result.text, /ids in report.truncated/);
  assert.ok(!result.text.includes(result.report.truncated[0]));
  const overflow = server.context({ ...req, budget: 1 });
  assert.equal(overflow.overBudget, true); assert.equal(overflow.requiredBytes, overflow.bytes);
  assert.match(overflow.text, /WARNING: bindings/);
});

const claim = (handle, text) => ({ handle, section: 'claims', binding: false, text });
const productProjection = (items) => ({ ...projection(), scope: 'product', projection: 'ctx:aaaaaaaa', family: true, label: 'Sample', gate_config: undefined,
  paths: { story: ['docs/**'], pages: ['docs/*.html'], entries: ['docs/*.html'], landing: ['docs/index.html'], read: [], specific: false }, items });

test('a product-linked claim the task needs survives the default budget when the task names the product', () => {
  const parent = projection();
  parent.gate_config.projections.push({ path: 'product.md', handle: 'ctx:aaaaaaaa', product: 'sample' });
  const filler = Array.from({ length: 80 }, (_, n) => claim(`ctx:${n.toString(16).padStart(8, '0')}`, `Current fact ${n} about the shared workflow and its records. `.repeat(3)));
  const needed = claim('ctx:ffffffff', 'The sample starts with a five-direction visual round before any page is rebuilt.');
  const own = productProjection([...filler, needed, idea(0xfffffffe, 'The sample uses a garden metaphor for seasonal growth.')]);
  const b = teamBundle([parent, own], { task: 'Sample product site', products: ['sample'], classes: ['story'] });
  assert.ok(b.bytes <= 12288);
  assert.ok(b.report.truncated.length > 0, 'the budget must actually cut claims');
  assert.ok(b.items.some(x => x.handle === 'ctx:ffffffff'), 'the claim naming the product outranks claims that do not');
  assert.equal(b.items.filter(x => x.section === 'claims')[0].handle, 'ctx:ffffffff');
  assert.equal(b.report.ideas.status, 'no-relevant-ideas', 'the product name alone still does not make an idea relevant');
});

test('equal-relevance claims keep their declared order, the named product first, and task words outrank it', () => {
  const parent = projection();
  parent.gate_config.projections.push({ path: 'product.md', handle: 'ctx:aaaaaaaa', product: 'sample' });
  const parentClaims = [1, 2, 3].map(n => claim(`ctx:0000000${n}`, `Umbrella statement ${n} about the portfolio. `.repeat(4)));
  parent.items.push(...parentClaims);
  const ownClaims = [1, 2, 3, 4, 5].map(n => claim(`ctx:fffffff${n}`, `Product statement ${n} about its own delivery. `.repeat(4)));
  const own = productProjection(ownClaims);
  const request = { task: 'Describe the launch', products: ['sample'], classes: ['story'] };
  const budget = teamBundle([parent, own], request).requiredBytes + 4 * 210;
  const kept = (payloads, extra = {}) => teamBundle(payloads, { ...request, budget, ...extra }).items.filter(x => x.section === 'claims').map(x => x.handle);
  assert.deepEqual(kept([parent, own]), ['ctx:fffffff1', 'ctx:fffffff2', 'ctx:fffffff3', 'ctx:fffffff4'], 'the product projection comes first in its declared order, not in handle order');
  assert.deepEqual(kept([own, parent]), kept([parent, own]), 'payload order does not change the bundle');
  assert.deepEqual(kept([parent, { ...own, items: [...ownClaims].reverse() }]), ['ctx:fffffff5', 'ctx:fffffff4', 'ctx:fffffff3', 'ctx:fffffff2'], 'the projection declares the order');
  parent.items.push(claim('ctx:00000009', 'The launch date is fixed by the portfolio calendar.'));
  assert.equal(kept([parent, own])[0], 'ctx:00000009', 'a claim sharing a task word outranks equal-relevance declared order');
});
