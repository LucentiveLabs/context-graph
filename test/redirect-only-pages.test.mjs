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

test('a comment never hides live code: every JavaScript line terminator ends a line comment', () => {
  const page = 'apps/site/src/app/about/page.tsx';
  for (const end of ['\r', '\u2028', '\u2029']) {
    const source = `import { redirect } from "next/navigation";\nexport default function P() { // note${end} return <main>Visible text</main>;\n redirect("/"); }`;
    assert.equal(isRedirectOnlyPage(page, source), false, JSON.stringify(end));
  }
  // A CRLF file is still a redirect.
  assert.equal(isRedirectOnlyPage(page, 'import { redirect } from "next/navigation";\r\n// moved\r\nexport default function P() {\r\n  redirect("/");\r\n}\r\n'), true);
});

test('multi-line, interpolated or escaped literals and bare slashes keep the entry a page', () => {
  const page = 'apps/site/src/app/about/page.tsx';
  for (const source of [
    'import { redirect } from "next/navigation";\nexport default function P() { redirect(`/labs/\n/* ${slug} */`); }',
    'import { redirect } from "next/navigation";\nexport default function P() { redirect(`/labs/\n`); }',
    'import { redirect } from "next/navigation";\nexport default function P() { redirect("/la\\"bs"); }',
    'import { redirect } from "next/navigation";\nexport default function P() { redirect("/" + "labs"); }',
    'import { redirect } from "next/navigation";\nexport default function P() { redirect("/"); } /* unclosed',
    'import { redirect } from "next/navigation";\nexport default function P() { redirect("/" / 1); }',
  ]) {
    assert.equal(isRedirectOnlyPage(page, source), false, source);
  }
});

test('the call must be the helper the module imported from next/navigation, unshadowed', () => {
  const page = 'apps/site/src/app/about/page.tsx';
  for (const source of [
    'import { permanentRedirect } from "next/navigation";\nexport default function P() { redirect("/"); }',
    'import { redirect } from "next/navigation";\nexport default function redirect() { redirect("/"); }',
    'import { redirect, redirect } from "next/navigation";\nexport default function P() { redirect("/"); }',
    'import { redirect } from "next/navigation\';\nexport default function P() { redirect("/"); }',
    'import { redirect as go } from "next/navigation";\nexport default function P() { go("/"); }',
    'import { redirect } from "next/navigation";\nexport default functionP() { redirect("/"); }',
    'import { redirect } from "next/navigation";\nexport default () => redirect("/");',
    'import { redirect } from "next/navigation";\nexport default function P(props) { redirect("/"); }',
  ]) {
    assert.equal(isRedirectOnlyPage(page, source), false, source);
  }
  assert.equal(isRedirectOnlyPage(page, 'import { redirect, permanentRedirect } from "next/navigation";\nexport default function P() { permanentRedirect("/"); }'), true);
  assert.equal(isRedirectOnlyPage(42, 'import { redirect } from "next/navigation";\nexport default function P() { redirect("/"); }'), false);
});

test('a named page that became a redirect stub, and a fully evaluated product of stubs, still owe their items', () => {
  const stub = 'import { redirect } from "next/navigation";\nexport default function About() { redirect("/"); }';
  const named = { ...own, items: [{ handle: 'ctx:00000042', section: 'acceptance', binding: true, text: 'The about page names IAS.', requirement: 'topic', aliases: ['IAS'], applies_to: { scope: 'product', product: 'site', page: 'apps/site/src/app/about/page.tsx' } }] };
  const f = files({ 'apps/site/src/app/about/page.tsx': stub, 'apps/site/src/app/page.tsx': 'export default function Home() { return <main>Home</main>; }' });
  const rows = coverage([named], { products: ['site'], files: f, changed: ['apps/site/src/app/about/page.tsx'] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ok, false);
  assert.match(rows[0].detail, /only redirects/);
  assert.equal(coverage([named], { products: ['site'], files: f, changed: null })[0].ok, false);

  const union = { ...own, items: [{ handle: 'ctx:00000043', section: 'acceptance', binding: true, text: 'The product names IAS somewhere.', requirement: 'topic', aliases: ['IAS'], applies_to: { scope: 'product', product: 'site' } }] };
  const stubs = files({ 'apps/site/src/app/about/page.tsx': stub });
  const full = coverage([union], { products: ['site'], files: stubs, changed: null });
  assert.equal(full.length, 1);
  assert.equal(full[0].ok, false);
});
