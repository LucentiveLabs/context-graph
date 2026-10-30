import assert from 'node:assert/strict';
import test from 'node:test';
import { pageClosure, DOCS_ROUTE } from '../src/core/team.mjs';

const files = (entries) => new Map(Object.entries(entries));

test('a content MDX page renders through its docs route: the route page and its layouts join its closure', () => {
  const f = files({
    'apps/site/content/docs/button.mdx': '# Button',
    [`apps/site/${DOCS_ROUTE}`]: 'import { Footer } from "@/components/footer";',
    'apps/site/src/app/layout.tsx': 'export default function L() {}',
    'apps/site/src/app/docs/layout.tsx': 'export default function D() {}',
    'apps/site/src/components/footer.tsx': 'export const Footer = () => "IAS is the foundation";',
  });
  const closure = pageClosure('apps/site/content/docs/button.mdx', f);
  assert.deepEqual([...closure].sort(), [
    'apps/site/content/docs/button.mdx',
    'apps/site/src/app/docs/[[...slug]]/page.tsx',
    'apps/site/src/app/docs/layout.tsx',
    'apps/site/src/app/layout.tsx',
    'apps/site/src/components/footer.tsx',
  ]);
});

test('without a docs route, or outside apps/<app>/content, a closure stays its own entry and imports', () => {
  const f = files({ 'apps/site/content/docs/a.mdx': '# A', 'apps/other/src/content/blog/b.mdx': '# B', [`apps/other/${DOCS_ROUTE}`]: '' });
  assert.deepEqual([...pageClosure('apps/site/content/docs/a.mdx', f)], ['apps/site/content/docs/a.mdx']);
  assert.deepEqual([...pageClosure('apps/other/src/content/blog/b.mdx', f)], ['apps/other/src/content/blog/b.mdx']);
});
