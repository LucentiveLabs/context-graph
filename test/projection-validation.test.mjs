import assert from 'node:assert/strict';
import test from 'node:test';
import { globRegex, parseProjection, payloadProblems } from '../src/core/team.mjs';
import { markdown, projection } from './fixture.mjs';

test('acceptance rejects inherited object properties as requirement names', () => {
  for (const requirement of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'unknown']) {
    const p = projection();
    p.items.push({ handle: 'ctx:55555555', section: 'acceptance', binding: true,
      text: 'Require meaningful evidence.', requirement, applies_to: { scope: 'all-pages' } });
    assert.ok(payloadProblems(p).some((problem) => problem.includes('known requirement')), requirement);
    assert.throws(() => parseProjection(markdown(p)), /known requirement/, requirement);
  }
});

test('brace alternatives preserve glob wildcards and path boundaries', () => {
  const pattern = globRegex('docs/{*.md,*.mdx,guide-?.txt}');
  for (const path of ['docs/intro.md', 'docs/intro.mdx', 'docs/guide-a.txt']) assert.ok(pattern.test(path), path);
  for (const path of ['docs/sub/intro.md', 'docs/guide-ab.txt', 'docs/introXmd', 'other/intro.md']) assert.ok(!pattern.test(path), path);
  assert.ok(globRegex('{docs/**,README.md}').test('docs/sub/intro.md'));
  assert.ok(globRegex('{docs/**,README.md}').test('README.md'));
  assert.ok(!globRegex('{docs/**,README.md}').test('READMEZmd'));
  assert.ok(globRegex('docs/{guide,reference}.md').test('docs/guide.md'));
});
