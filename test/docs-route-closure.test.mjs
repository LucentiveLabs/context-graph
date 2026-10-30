import assert from 'node:assert/strict';
import test from 'node:test';
import { pageClosure, coverage, DOCS_ROUTE } from '../src/core/team.mjs';

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

test('without a docs route, outside content/docs, or in another route shape, a closure stays its own entry', () => {
  const f = files({
    'apps/site/content/docs/a.mdx': '# A',
    'apps/other/src/content/blog/b.mdx': '# B',
    'apps/other/content/blog/c.mdx': '# C',
    [`apps/other/${DOCS_ROUTE}`]: '',
    'apps/grouped/content/docs/d.md': '# D',
    'apps/grouped/src/app/(docs)/docs/[[...slug]]/page.tsx': '',
  });
  for (const entry of ['apps/site/content/docs/a.mdx', 'apps/other/src/content/blog/b.mdx', 'apps/other/content/blog/c.mdx', 'apps/grouped/content/docs/d.md']) {
    assert.deepEqual([...pageClosure(entry, f)], [entry], entry);
  }
});

test('nested Markdown under content/docs joins the route, and a page whose route and body never show the item still fails coverage', () => {
  const own = { scope: 'product', product: 'site', projection: 'ctx:aaaaaaaa', family: false,
    paths: { story: ['apps/site/**'], pages: ['apps/site/**'], entries: ['apps/site/content/**/*.{md,mdx}', 'apps/site/src/app/**/page.tsx'], landing: [], read: [], specific: false },
    items: [{ handle: 'ctx:00000031', section: 'acceptance', binding: true, text: 'Every page names IAS.', requirement: 'topic', aliases: ['IAS'], applies_to: { scope: 'all-pages' } }] };
  const f = files({
    'apps/site/content/docs/a/b/c.md': '# Setup\n\nInstall the package.',
    [`apps/site/${DOCS_ROUTE}`]: 'export default function Page() { return <main>Docs</main>; }',
    'apps/site/src/app/layout.tsx': 'export default function L({ children }) { return <body>{children}</body>; }',
  });
  assert.ok(pageClosure('apps/site/content/docs/a/b/c.md', f).has(`apps/site/${DOCS_ROUTE}`));
  const changed = ['apps/site/content/docs/a/b/c.md'];
  const rows = coverage([own], { products: ['site'], files: f, changed });
  assert.ok(rows.some((r) => r.page === 'apps/site/content/docs/a/b/c.md' && !r.ok), 'no visible IAS anywhere on the rendered page fails');
  f.set('apps/site/src/app/layout.tsx', 'export default function L({ children }) { return <body>{children}<footer>IAS is the foundation.</footer></body>; }');
  assert.ok(coverage([own], { products: ['site'], files: f, changed }).filter((r) => r.page === 'apps/site/content/docs/a/b/c.md').every((r) => r.ok), 'the chrome line counts once the layout shows it');
});
