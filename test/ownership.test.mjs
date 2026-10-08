import assert from 'node:assert/strict';
import test from 'node:test';
import { projection, markdown } from './fixture.mjs';
import { checkLines, evaluateGate, payloadProblems, teamBundle, sha256, RECEIPT_SCHEMA, SELECTION_ALGORITHM } from '../src/core/team.mjs';

const term = (handle) => ({ handle, section: 'terms', binding: true, text: 'Use project record.', preferred: ['project record'], deprecated: [{ text: 'old record', re: '\\bold record\\b' }] });
const check = (handle) => ({ handle, section: 'checks', binding: false, text: 'Do not promise automatic access.', patterns: [{ re: 'automatic access' }] });
const line = { path: 'docs/shared.md', line: 1, text: 'The old record promises automatic access.' };
function fixture() {
  const parent = projection(); parent.items = [term('ctx:33333333'), check('ctx:44444444')];
  const product = (id, handle, family, mode) => ({ schema: parent.schema, projection: handle, scope: 'product', product: id, family, revalidate_by: '2099-01-01', gate: { mode, ...(mode === 'advisory' ? { advisory_until: '2099-01-01' } : {}) }, inaccessible: [], paths: { story: ['docs/**'], pages: [], entries: [], landing: [], read: [], specific: false }, items: [] });
  const advisory = product('advisory', 'ctx:aaaaaaaa', false, 'advisory');
  const blocking = product('blocking', 'ctx:bbbbbbbb', true, 'blocking');
  parent.gate_config.projections = [parent, advisory, blocking].map((p, i) => ({ path: i ? `${p.product}.md` : 'CONTEXT.md', handle: p.projection, product: p.product }));
  parent.gate_config.blocking_products = ['blocking'];
  const payloads = [parent, advisory, blocking];
  for (const p of payloads) assert.deepEqual(payloadProblems(p), []);
  return payloads;
}
function gate(payloads) {
  const contextFiles = new Map(payloads.map((p) => [p.scope === 'parent' ? 'CONTEXT.md' : `${p.product}.md`, markdown(p)]));
  const request = { task: 'Explain project records', products: ['advisory', 'blocking'], classes: ['story'], budget: 12288 };
  const bundle = teamBundle(payloads, request);
  const receipt = { schema: RECEIPT_SCHEMA, selectionAlgorithm: SELECTION_ALGORITHM, task_id: 'synthetic', profile: 'team', ...request, bundle_sha256: bundle.sha256, projections: [...contextFiles].map(([path, text]) => ({ path, payload_sha256: sha256(text) })) };
  return evaluateGate({ contextFiles, parentPath: 'CONTEXT.md', changed: [line.path], added: [line], receipts: [{ path: 'synthetic.context-receipt.json', data: receipt }], today: '2026-10-08' });
}

test('parent terms and checks bind every family owner, never an independent co-owner', () => {
  const payloads = fixture();
  for (const ps of [payloads, [payloads[0], payloads[2], payloads[1]]]) {
    const findings = checkLines(ps, { lines: [line] });
    assert.deepEqual(findings.map((f) => [f.kind, f.product]), [['term-drift', 'blocking'], ['contradiction', 'blocking']]);
    const result = gate(ps);
    assert.deepEqual(result.receipts[0].problems, []);
    assert.equal(result.ok, false);
    assert.equal(result.blocking.length, 2);
    assert.deepEqual(result.advisory.filter((message) => !message.startsWith('definition ')), []);
  }
});

test('a shared family rule reaches both owners and any blocking owner blocks', () => {
  const payloads = fixture(); payloads[1].family = true;
  const findings = checkLines(payloads, { lines: [line] });
  assert.equal(findings.length, 4);
  assert.deepEqual(new Set(findings.map((f) => f.product)), new Set(['advisory', 'blocking']));
  const result = gate(payloads);
  assert.equal(result.ok, false);
  assert.equal(result.blocking.length, 2);
  assert.equal(result.advisory.filter((message) => !message.startsWith('definition ')).length, 2);
});

test('product rules keep their own owner and distinct rules survive matching the same text', () => {
  const payloads = fixture(); payloads[0].items = [];
  payloads[1].items = [term('ctx:aaaa0001')];
  payloads[2].items = [term('ctx:bbbb0001'), term('ctx:bbbb0002'), check('ctx:bbbb0003')];
  const findings = checkLines(payloads, { lines: [line, line] });
  assert.deepEqual(findings.map((f) => [f.rule, f.product]), [['ctx:aaaa0001', 'advisory'], ['ctx:bbbb0001', 'blocking'], ['ctx:bbbb0002', 'blocking'], ['ctx:bbbb0003', 'blocking']]);
  assert.equal(gate(payloads).blocking.length, 3);
});

test('unmapped caller owners preserve family boundaries and deduplicate repeated owners', () => {
  const payloads = fixture();
  const findings = checkLines(payloads, { lines: [{ ...line, path: 'unmapped.md' }] }, { products: ['advisory', 'blocking', 'blocking'] });
  assert.deepEqual(findings.map((f) => f.product), ['blocking', 'blocking']);
});

test('held terms stay advisory and allowed variants stay absent with shared owners', () => {
  const payloads = fixture(); payloads[0].items = [term('ctx:33333333')]; payloads[1].family = true;
  Object.assign(payloads[0].items[0], { held_paths: ['docs/**'], held_reason: 'Synthetic exception' });
  const result = gate(payloads);
  assert.equal(result.ok, true);
  assert.equal(result.advisory.filter((message) => !message.startsWith('definition ')).length, 2);
  payloads[0].items[0].deprecated[0].allowed_paths = ['docs/**'];
  assert.deepEqual(checkLines(payloads, { lines: [line] }), []);
});
