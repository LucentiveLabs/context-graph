import assert from 'node:assert/strict';
import test from 'node:test';
import { makeServer } from '../src/core/serve.mjs';
import { buildPayload } from '../src/core/project.mjs';

function fixture() {
  const products = ['parent', 'sample'].map(id => ({ id, label: id, class: 'product', apps: [], relations: {} }));
  const claims = Array.from({ length: 52 }, (_, i) => ({
    id: `claim:source.${String(i).padStart(3, '0')}`, kind: 'Claim',
    about: ['product:parent', 'product:sample'], artifact: 'artifact:team/docs/source.md',
    facet: 'constraint', label: `Preserve reviewed constraint ${i}.`, selector: `L${i + 1}`,
    policy: { visibility: 'team' }, state: 'proposed',
  }));
  const records = [...products.map(p => ({ ...p, id: `product:${p.id}`, kind: 'Product' })), ...claims];
  const view = {
    graph: { nodes: new Map(records.map(record => [record.id, { record }])), assertions: [], table: {} },
    snapshot: { products, artifacts: [] },
    serving: { parent_product: 'parent', team_repo: 'team', claims_per_product: 2, parent_claims: 2 },
    canon: {}, salt: 'synthetic-projection-preservation', policyRevision: 'synthetic',
    verified: () => false, exports: new Map(),
  };
  return { view, claims };
}

test('stored product and parent projections preserve claims beyond query limits after new claims arrive', () => {
  for (const key of ['sample', 'parent']) {
    const { view, claims } = fixture();
    const server = makeServer(view);
    assert.equal(server.claimsFor('sample').length, 2, 'ordinary query limit remains bounded');
    const before = buildPayload(view, server, key, { date: '2026-10-08' });
    assert.equal(before.payload.items.filter(i => i.section === 'claims').length, claims.length);
    const added = { ...claims[0], id: `claim:new-${key}`, label: 'An additional reviewed constraint.' };
    view.graph.nodes.set(added.id, { record: added });
    const after = buildPayload(view, makeServer(view), key, { date: '2026-10-08' });
    const handles = new Set(after.payload.items.map(i => i.handle));
    for (const item of before.payload.items) assert.ok(handles.has(item.handle), item.text);
  }
});

test('complete claim export still excludes retired, foreign and founder-private records', () => {
  const { view, claims } = fixture();
  for (const [id, changes] of [
    ['retired', { state: 'retired' }],
    ['foreign', { artifact: 'artifact:other/docs/source.md' }],
    ['private', { policy: { visibility: 'founder-private' } }],
  ]) {
    const record = { ...claims[0], id: `claim:${id}`, label: id, ...changes };
    view.graph.nodes.set(record.id, { record });
  }
  for (const key of ['sample', 'parent']) {
    const { payload } = buildPayload(view, makeServer(view), key, { date: '2026-10-08' });
    assert.equal(payload.items.filter(i => i.section === 'claims').length, claims.length);
    assert.ok(payload.items.every(i => !['retired', 'foreign', 'private'].includes(i.text)));
    assert.equal(payload.inaccessible.reduce((n, x) => n + x.count, 0), 1);
  }
});
