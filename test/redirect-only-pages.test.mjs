import assert from 'node:assert/strict';
import test from 'node:test';
import { coverage, isRedirectOnlyPage, productsAffected } from '../src/core/team.mjs';

const files = (entries) => new Map(Object.entries(entries));
const own = {
  scope: 'product', product: 'site', projection: 'ctx:aaaaaaaa', family: false,
  paths: { story: ['apps/site/**'], pages: ['apps/site/**'], entries: ['apps/site/src/app/**/page.tsx'], landing: ['apps/site/src/app/page.tsx'], read: ['apps/site/**'], specific: false },
  items: [{ handle: 'ctx:00000041', section: 'acceptance', binding: true, text: 'Every page names IAS.', requirement: 'topic', aliases: ['IAS'], applies_to: { scope: 'all-pages' } }],
};

test('a page module that only redirects to a literal target is a redirect, in each supported spelling', () => {
  for (const source of [
    'import { redirect } from "next/navigation";\n\nexport default function AboutPage() {\n  redirect("/");\n}\n',
    "import { permanentRedirect } from 'next/navigation';\nexport default function Old() { permanentRedirect('https://example.test/deck/pdf'); }",
    '// Retired address.\nimport { redirect, permanentRedirect } from "next/navigation";\n/* moved */\nexport default async function Lab(): Promise<never> {\n  return redirect(`/labs`);\n}',
    'import { redirect } from "next/navigation";\nexport default function (): never { redirect("/labs") }',
  ]) {
    assert.equal(isRedirectOnlyPage('apps/site/src/app/(group)/about/page.tsx', source), true, source);
  }
});

test('anything more than one unconditional literal redirect keeps the entry a page (fail closed)', () => {
  const page = 'apps/site/src/app/about/page.tsx';
  for (const source of [
    // A condition: the page renders on the other branch.
    'import { redirect } from "next/navigation";\nexport default function P({ open }) { if (!open) redirect("/"); return <main>Open</main>; }',
    // Another import, a directive, another export, a computed or variable target, a wrong module.
    'import { redirect } from "next/navigation";\nimport { Note } from "@/components/note";\nexport default function P() { redirect("/"); }',
    '"use client";\nimport { redirect } from "next/navigation";\nexport default function P() { redirect("/"); }',
    'import { redirect } from "next/navigation";\nexport const metadata = { title: "About" };\nexport default function P() { redirect("/"); }',
    'import { redirect } from "next/navigation";\nexport default function P() { redirect(`/labs/${slug}`); }',
    'import { redirect } from "next/navigation";\nconst target = "/";\nexport default function P() { redirect(target); }',
    'import { redirect } from "./navigation";\nexport default function P() { redirect("/"); }',
    'import { redirect } from "next/navigation";\nexport default function P() { redirect("/"); return <p>Moved</p>; }',
    'export default function P() { return <main>IAS</main>; }',
    '',
  ]) {
    assert.equal(isRedirectOnlyPage(page, source), false, source);
  }
  const redirect = 'import { redirect } from "next/navigation";\nexport default function P() { redirect("/"); }';
  for (const rel of ['apps/site/src/app/about/layout.tsx', 'apps/site/src/components/page.tsx', 'apps/site/src/app/about/page.mdx', 'apps/site/source/site/page.html']) {
    assert.equal(isRedirectOnlyPage(rel, redirect), false, rel);
  }
  assert.equal(isRedirectOnlyPage(page, undefined), false);
});

test('coverage skips redirect-only entries and still fails a real page that misses the item', () => {
  const f = files({
    'apps/site/src/app/layout.tsx': 'import { Header } from "@/components/header";\nexport default function L({ children }) { return <body><Header />{children}</body>; }',
    'apps/site/src/components/header.tsx': 'export const Header = () => <header>Site</header>;',
    'apps/site/src/app/page.tsx': 'export default function Home() { return <main>Built on IAS.</main>; }',
    'apps/site/src/app/about/page.tsx': 'import { redirect } from "next/navigation";\nexport default function About() { redirect("/"); }',
    'apps/site/src/app/deck/page.tsx': 'import { redirect } from "next/navigation";\nexport default function Deck() { redirect("https://example.test/deck"); }',
    'apps/site/src/app/plain/page.tsx': 'export default function Plain() { return <main>A plain page.</main>; }',
  });
  const changed = ['apps/site/src/components/header.tsx'];
  const rows = coverage([own], { products: ['site'], files: f, changed });
  const pages = rows.map((r) => r.page).sort();
  assert.deepEqual(pages, ['apps/site/src/app/page.tsx', 'apps/site/src/app/plain/page.tsx']);
  assert.equal(rows.find((r) => r.page === 'apps/site/src/app/page.tsx').ok, true);
  assert.equal(rows.find((r) => r.page === 'apps/site/src/app/plain/page.tsx').ok, false, 'a real page without the item still fails');

  // A redirect that gains a rendering path is judged again.
  f.set('apps/site/src/app/about/page.tsx', 'import { redirect } from "next/navigation";\nexport default function About({ open }) { if (!open) redirect("/"); return <main>About us</main>; }');
  assert.equal(coverage([own], { products: ['site'], files: f, changed }).find((r) => r.page === 'apps/site/src/app/about/page.tsx')?.ok, false);
});

test('a change that reaches only redirect-only entries touches no page of the product', () => {
  const f = files({
    'apps/site/src/app/about/page.tsx': 'import { redirect } from "next/navigation";\nexport default function About() { redirect("/"); }',
    'apps/site/src/app/page.tsx': 'export default function Home() { return <main>Built on IAS.</main>; }',
  });
  assert.deepEqual(productsAffected([own], { files: f, changed: ['apps/site/src/app/about/page.tsx'] }), []);
  assert.deepEqual(productsAffected([own], { files: f, changed: ['apps/site/src/app/page.tsx'] }), ['site']);
  // With only redirect entries left, a changed page file is not mistaken for a product without page entries.
  const only = files({ 'apps/site/src/app/about/page.tsx': f.get('apps/site/src/app/about/page.tsx') });
  assert.deepEqual(coverage([own], { products: ['site'], files: only, changed: ['apps/site/src/app/about/page.tsx'] }), []);
});
