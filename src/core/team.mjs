// The team side of the context graph: everything a team surface needs, computed from projection payloads only.
// Team profile means projection content only (design record: Interfaces, Projections and privacy). This file reads
// the CONTEXT.md machine blocks (strictly, against the parent's registry of projections), assembles the team bundle,
// runs check and coverage on a change, and validates .context-receipt.json files. It depends on node built-ins only,
// holds no private data and no private paths, so a team repository can vendor it byte for byte.
import { createHash } from "node:crypto";
import { posix } from "node:path";

export const TEAM_CORE = "context-team-core/v2";
export const PAYLOAD_SCHEMA = "context-projection/v1";
export const RECEIPT_SCHEMA = "context-receipt/v1";
export const MACHINE_FENCE = "context-projection";
export const BINDING_SECTIONS = ["terms", "definitions", "decisions", "acceptance"];
export const SECTION_TITLES = {
  map: "Meaning and relations",
  terms: "Terms (canon rules)",
  definitions: "Definitions",
  decisions: "Decisions",
  acceptance: "Acceptance (must appear)",
  checks: "Check rules",
  claims: "Claim constraints (what our own docs state)",
  open: "Open decisions",
  ideas: "Library ideas in our words (candidate applications, not documented influence; sources unnamed)",
};
const ORDER = ["terms", "definitions", "decisions", "acceptance", "map", "checks", "claims", "open", "ideas"];
const SECTIONS = new Set(Object.keys(SECTION_TITLES));
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HANDLE = /^ctx:[a-f0-9]{8}$/;

export const sha256 = (data) => createHash("sha256").update(typeof data === "string" ? Buffer.from(data, "utf8") : data).digest("hex");
const esc = (s) => s.replace(/[.+^$()|[\]\\]/g, "\\$&");
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const strArray = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");

/** A glob as a regular expression: ** spans folders, * and ? stay inside one, {a,b} picks one alternative. */
export function globRegex(glob) {
  let re = ""; let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") { if (glob[i + 2] === "/") { re += "(?:[^/]+/)*"; i += 3; } else { re += ".*"; i += 2; } } else { re += "[^/]*"; i += 1; }
    } else if (c === "?") { re += "[^/]"; i += 1; }
    else if (c === "{") {
      const j = glob.indexOf("}", i);
      if (j < 0) throw new Error(`glob ${glob}: unclosed {`);
      re += `(?:${glob.slice(i + 1, j).split(",").map(esc).join("|")})`; i = j + 1;
    } else { re += esc(c); i += 1; }
  }
  return new RegExp(`^${re}$`);
}
export const matches = (globs, p) => (globs || []).some((g) => globRegex(g).test(p));


/** Problems of a payload's shape; [] when it is a usable projection. */
export function payloadProblems(p) {
  const P = [];
  if (!p || typeof p !== "object") return ["not an object"];
  if (p.schema !== PAYLOAD_SCHEMA) P.push(`schema must be ${PAYLOAD_SCHEMA}`);
  if (!HANDLE.test(String(p.projection))) P.push("projection must be a ctx: handle");
  if (!["parent", "product"].includes(p.scope)) P.push("scope must be parent or product");
  if (typeof p.product !== "string" || !p.product) P.push("product is required");
  if (!DAY.test(String(p.revalidate_by))) P.push("revalidate_by must be a date");
  if (!p.gate || !["blocking", "advisory"].includes(p.gate.mode) || (p.gate.mode === "advisory" && !DAY.test(String(p.gate.advisory_until)))) P.push("gate needs mode blocking, or advisory with advisory_until");
  if (!Array.isArray(p.items) || !p.items.every((it) => HANDLE.test(String(it?.handle)) && SECTIONS.has(it?.section) && typeof it?.text === "string" && it.text)) P.push("items must each carry a ctx handle, a known section and text");
  if (!Array.isArray(p.inaccessible)) P.push("inaccessible must be a list");
  for (const it of Array.isArray(p.items) ? p.items : []) {
    if (it.binding !== BINDING_SECTIONS.includes(it.section)) P.push(`item ${it.handle} binding must match its section`);
    if (it.section === "terms" && !(Array.isArray(it.deprecated) && it.deprecated.every((d) => typeof d?.text === "string" && typeof d?.re === "string"))) P.push(`term ${it.handle} needs deprecated [{ text, re }]`);
    if (it.section === "checks" && !(Array.isArray(it.patterns) && it.patterns.every((x) => typeof x?.re === "string"))) P.push(`check ${it.handle} needs patterns`);
    if (it.section === "acceptance") {
      const a = it.applies_to || {};
      const fieldOk = { topic: strArray(it.aliases) && it.aliases.length > 0 && it.aliases.every(Boolean), absence: Array.isArray(it.patterns) && it.patterns.length > 0 && it.patterns.every((x) => typeof x?.re === "string" && x.re), phrases: strArray(it.phrases) && it.phrases.length > 0 && it.phrases.every(Boolean) }[it.requirement];
      const scopeOk = a.scope === "all-pages" || (a.scope === "product" && typeof a.product === "string" && a.product && (a.page === undefined || typeof a.page === "string"));
      if (!fieldOk || !scopeOk) P.push(`acceptance ${it.handle} needs a known requirement with its non-empty aliases, patterns or phrases, and applies_to all-pages or a product`);
    }
  }
  if (p.scope === "product") {
    const x = p.paths || {};
    if (!["story", "pages", "entries", "landing", "read"].every((k) => strArray(x[k])) || typeof x.specific !== "boolean") P.push("paths needs story, pages, entries, landing, read and specific");
    if (typeof p.family !== "boolean") P.push("family must be true or false");
  } else {
    const c = p.gate_config || {};
    if (!["story_paths", "never_story", "never_pages", "locked_files", "blocking_products"].every((k) => strArray(c[k])) || !DAY.test(String(c.advisory_until))) P.push("gate_config needs story_paths, never_story, never_pages, locked_files, blocking_products and advisory_until");
    if (!(Array.isArray(c.doc_owners) && c.doc_owners.every((d) => typeof d?.glob === "string" && typeof d?.product === "string"))) P.push("gate_config.doc_owners must list { glob, product }");
    if (!(Array.isArray(c.projections) && c.projections.length && c.projections.every((r) => typeof r?.path === "string" && HANDLE.test(String(r?.handle)) && typeof r?.product === "string"))) P.push("gate_config.projections must register every projection { path, handle, product }");
  }
  return P;
}

/** The payload a CONTEXT.md carries in its fenced machine block (```json context-projection); throws on any problem. */
export function parseProjection(md) {
  const m = new RegExp("```json " + MACHINE_FENCE + "\\n([\\s\\S]*?)\\n```").exec(String(md));
  if (!m) throw new Error(`no ${MACHINE_FENCE} block`);
  const p = JSON.parse(m[1]);
  const P = payloadProblems(p);
  if (P.length) throw new Error(`malformed projection: ${P.join("; ")}`);
  return p;
}

/**
 * The registered projections of a tree. contextFiles: Map(path -> CONTEXT.md text) of every CONTEXT.md the tree holds;
 * parentPath: where the parent projection lives. The parent registers every projection by path, handle and product;
 * a registered file that is missing, malformed or carries another projection, an unregistered machine block, and two
 * copies of one projection that differ are all problems, so a deleted or damaged projection never fails open.
 */
export function loadInventory(contextFiles, parentPath) {
  const problems = []; const payloadsByPath = new Map();
  const text = contextFiles.get(parentPath);
  if (text === undefined) return { payloadsByPath, problems: [`the parent projection ${parentPath} is missing`], parent: null };
  let parent;
  try { parent = parseProjection(text); } catch (e) { return { payloadsByPath, problems: [`${parentPath}: ${e.message}`], parent: null }; }
  if (parent.scope !== "parent") return { payloadsByPath, problems: [`${parentPath} is not the parent projection`], parent: null };
  const registry = new Map(parent.gate_config.projections.map((r) => [r.path, r]));
  const byHandle = new Map();
  for (const [rel, r] of registry) {
    const t = contextFiles.get(rel);
    if (t === undefined) { problems.push(`registered projection ${rel} is missing`); continue; }
    let p;
    try { p = parseProjection(t); } catch (e) { problems.push(`${rel}: ${e.message}`); continue; }
    if (p.projection !== r.handle || p.product !== r.product) { problems.push(`${rel} carries ${p.projection} (${p.product}), not the registered ${r.handle} (${r.product})`); continue; }
    if (byHandle.has(p.projection) && byHandle.get(p.projection) !== sha256(t)) problems.push(`${rel} differs from another copy of ${p.projection}`);
    byHandle.set(p.projection, sha256(t));
    payloadsByPath.set(rel, p);
  }
  for (const [rel, t] of contextFiles) if (!registry.has(rel) && t.includes("```json " + MACHINE_FENCE)) problems.push(`${rel} holds a projection the parent does not register`);
  return { payloadsByPath, problems, parent };
}
/** One payload per projection handle (an app family serves one projection from several CONTEXT.md copies). */
export const uniquePayloads = (payloads) => [...new Map(payloads.map((p) => [p.projection, p])).values()];
const parentOf = (payloads) => payloads.find((p) => p.scope === "parent") || null;

/**
 * The products a path belongs to. A projection marked specific (a pillar or route group served from a shared app)
 * wins over the app's general projection; a path no product claims takes the parent's doc owners (first match).
 */
export function productsForPath(payloads, rel) {
  const own = (p) => p.scope !== "parent" && (matches(p.paths?.story, rel) || matches(p.paths?.pages, rel) || matches(p.paths?.entries, rel));
  const hits = uniquePayloads(payloads).filter(own);
  const specific = hits.filter((p) => p.paths?.specific);
  if (hits.length) return [...new Set((specific.length ? specific : hits).map((p) => p.product))];
  const doc = (parentOf(payloads)?.gate_config?.doc_owners || []).find((d) => globRegex(d.glob).test(rel));
  return doc ? [doc.product] : [];
}
export function isStoryPath(payloads, rel) {
  const c = parentOf(payloads)?.gate_config || {};
  if (matches(c.never_story, rel)) return false;
  return matches(c.story_paths, rel) || payloads.some((p) => p.scope !== "parent" && matches(p.paths?.story, rel));
}
export function isPagePath(payloads, rel) {
  const c = parentOf(payloads)?.gate_config || {};
  if (matches(c.never_story, rel) || matches(c.never_pages, rel)) return false;
  return payloads.some((p) => p.scope !== "parent" && (matches(p.paths?.pages, rel) || matches(p.paths?.entries, rel)));
}

const MARKUP = /\.(?:md|mdx|html?)$/;
const CODE_ONLY = /^\s*(?:import\b|export\s+\*|export\s*\{[^}]*\}\s*from\b|\/\/|\/\*|\*|#!|"use (?:client|server)")/;
/**
 * A code line without its comments: a line comment (// outside quotes) is cut, a block comment removed; state carries
 * an open block comment across lines ({ inBlock }).
 */
export function stripComments(line, state = { inBlock: false }) {
  let out = ""; let q = null; const t = String(line);
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i]; const n = t[i + 1];
    if (state.inBlock) { if (c === "*" && n === "/") { state.inBlock = false; i += 1; } continue; }
    if (q) { out += c; if (c === "\\") { out += n ?? ""; i += 1; } else if (c === q) q = null; continue; }
    if (c === "/" && n === "/" && t[i - 1] !== ":") break;
    if (c === "/" && n === "*") { state.inBlock = true; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") q = c;
    out += c;
  }
  return out;
}
/**
 * The visible text of one line: what a reader could see. Markup lines lose tags, comments and inline code. Code
 * lines lose comments, then give their quoted strings and JSX text; a code line with no quotes and no code punctuation
 * is taken as the inside of a multi-line string or JSX block. Import lines, comments (markup comments across lines
 * too) and the replacement argument of a .replace() call give nothing, so identifiers and regex replacements never
 * read as copy.
 */
export function visibleSegments(rel, text, state) {
  if (MARKUP.test(rel)) return markupSegments(String(text), state || { inBlock: false });
  const t0 = stripComments(text, state || { inBlock: false });
  if (CODE_ONLY.test(t0) || !t0.trim()) return [];
  // The replacement argument of a .replace() call is code, not copy: blank exactly that literal, keep the rest.
  const t = t0.replace(REPLACE_ARG, (m, head, lit) => `${head}${" ".repeat(lit.length)}`);
  // Template literals count with their ${...} placeholders blanked, so the words around them stay visible.
  const segs = [...t.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`|>([^<>{}]+)(?:<|$)/g)].map((m) => m[1] ?? m[2] ?? (m[3] !== undefined ? m[3].replace(/\$\{[^}]*\}/g, " ") : undefined) ?? m[4]).filter((x) => x && /[\p{L}\p{N}]/u.test(x));
  if (segs.length) return segs;
  if (!/[(){}=;<>[\]]/.test(t) && /[\p{L}]{2,}/u.test(t)) return [t.trim()];
  return [];
}
const REPLACE_ARG = /(\.replace(?:All)?\(\s*(?:\/(?:\\.|[^/\n])+\/[a-z]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)\s*,\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g;
// A markup line's visible text: tags, inline code and comments (HTML comments and MDX brace comments, across lines
// too) removed.
function markupSegments(line, state) {
  let out = ""; let i = 0;
  while (i < line.length) {
    if (state.inBlock) { const end = state.inBlock === "html" ? line.indexOf("-->", i) : line.indexOf("*/}", i); if (end < 0) { i = line.length; break; } i = end + 3; state.inBlock = false; continue; }
    const h = line.indexOf("<!--", i); const j = line.indexOf("{/*", i);
    const next = [h, j].filter((x) => x >= 0).sort((a, b) => a - b)[0];
    if (next === undefined) { out += line.slice(i); break; }
    out += line.slice(i, next); state.inBlock = next === h ? "html" : "mdx"; i = next + (next === h ? 4 : 3);
  }
  const v = out.replace(/<[^>]*>/g, " ").replace(/`[^`]*`/g, " ").trim();
  return v ? [v] : [];
}
const plainWords = (seg) => seg.split(/\s+/).filter((w) => /^[\p{L}][\p{L}'’]*[.,;:!?)]*$/u.test(w)).length;
/** A changed line holds prose when one visible segment has four or more plain words (class lists do not count). */
export const hasProse = (rel, text) => visibleSegments(rel, text).some((seg) => plainWords(seg) >= 4);
/** The visible text of a whole file. */
export const visibleText = (rel, text) => { const state = { inBlock: false }; return String(text).split("\n").flatMap((l) => visibleSegments(rel, l, state)).join("\n"); };

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;
function resolveImport(from, spec, files) {
  let base;
  if (spec.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(from), spec));
  else if (spec.startsWith("@/")) { const app = /^(apps\/[^/]+)\//.exec(from)?.[1]; if (!app) return null; base = `${app}/src/${spec.slice(2)}`; }
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, `${base}.json`, `${base}.md`, `${base}.mdx`, `${base}/index.ts`, `${base}/index.tsx`]) if (files.has(c)) return c;
  return null;
}
/** A page: its entry file, the layouts above a Next.js route, and every file they import that the gate read. */
export function pageClosure(entry, files) {
  const seen = new Set([entry]); const queue = [entry];
  const m = /^(apps\/[^/]+\/src\/app)\/(.*)$/.exec(entry);
  if (m) {
    const dirs = m[2].split("/").slice(0, -1);
    for (let i = 0; i <= dirs.length; i += 1) for (const name of ["layout.tsx", "layout.ts", "template.tsx"]) { const p = [m[1], ...dirs.slice(0, i), name].join("/"); if (files.has(p) && !seen.has(p)) { seen.add(p); queue.push(p); } }
  }
  while (queue.length) {
    const f = queue.shift();
    // Imports are read from the code without its comments, so a commented-out import adds nothing to the page.
    const st = { inBlock: false }; const code = String(files.get(f) || "").split("\n").map((l) => stripComments(l, st)).join("\n");
    for (const mm of code.matchAll(IMPORT_RE)) { const r = resolveImport(f, mm[1] || mm[2] || mm[3], files); if (r && !seen.has(r)) { seen.add(r); queue.push(r); } }
  }
  return seen;
}

const dedupe = (items) => { const seen = new Set(); return items.filter((it) => { const k = `${it.section}\n${it.text}`; if (seen.has(k)) return false; seen.add(k); return true; }); };
const line = (it) => `- [${it.handle}] ${it.text}`;

const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "page", "pages", "make", "copy", "site", "edit", "edits", "work"]);
/** Task words that rank non-binding items: lower case, four letters or more, minus a few that every story task shares. */
export const taskWords = (task) => [...new Set(String(task || "").toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{3,}/gu) || [])].filter((w) => !STOP.has(w));
const overlap = (words, text) => { const t = String(text).toLowerCase(); return words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0); };

/**
 * The team bundle: binding constraints first and never truncated, then meaning, check rules, claims, open decisions
 * and library ideas until the byte budget is spent. Truncated, missing and inaccessible items are listed, never
 * dropped silently. payloads: the parent projection plus one per product in scope. Within a section, items that share
 * more words with the task come first, then the product's own items before the parent's, then projection order. The
 * parent's portfolio map is cut to the named products. The result is deterministic for the same payloads, task,
 * products, classes and budget, so a receipt re-derives it.
 */
export function teamBundle(payloads0, { task = "", products = [], classes = ["story"], budget = 12288, missing = [] } = {}) {
  // Canonical order (the parent, then products by id), so the same projections give the same bundle in any order.
  const payloads = uniquePayloads(payloads0).sort((a, b) => (a.scope === "parent" ? 0 : 1) - (b.scope === "parent" ? 0 : 1) || a.product.localeCompare(b.product));
  const items = dedupe(payloads.flatMap((p) => (p.items || []).map((it, i) => ({ ...it, projection: p.projection, parent: p.scope === "parent", at: i }))));
  const story = classes.includes("story");
  const words = taskWords(task);
  const wanted = items.filter((it) => (story ? true : it.binding && it.section !== "acceptance")).filter((it) => !(it.parent && it.section === "map" && products.length && it.about && !products.includes(it.about)));
  const bySection = (s) => wanted.filter((it) => it.section === s);
  const ranked = (s) => bySection(s).map((it) => ({ it, score: overlap(words, it.text) })).sort((a, b) => b.score - a.score || (a.it.parent - b.it.parent) || a.it.at - b.it.at).map((x) => x.it);
  const head = [
    "# Context bundle (team profile)",
    `classes: ${classes.join(", ")}; products: ${products.length ? products.join(", ") : "none named"}`,
    `projections: ${payloads.map((p) => `${p.projection} (${p.scope === "parent" ? "parent" : p.product}, revalidate by ${p.revalidate_by})`).join("; ")}`,
    "",
  ];
  const parts = [...head, "## Binding constraints (never truncated)"];
  for (const s of BINDING_SECTIONS) { const list = bySection(s); if (list.length) parts.push(`### ${SECTION_TITLES[s]}`, ...list.map(line)); }
  const bindingText = `${parts.join("\n")}\n`;
  const inaccessible = payloads.flatMap((p) => (p.inaccessible || []).map((x) => `${p.scope === "parent" ? "parent" : p.product}: ${x.count} ${x.reason}`));
  const rest = ORDER.filter((x) => !BINDING_SECTIONS.includes(x)).flatMap((s) => ranked(s).map((it) => ({ s, it })));
  const render = (kept) => {
    let text = bindingText; let last = null;
    for (const { s, it } of kept) { if (s !== last) { text += `\n## ${SECTION_TITLES[s]}\n`; last = s; } text += `${line(it)}\n`; }
    return text;
  };
  const reportOf = (truncated) => ["", "## Report", `- truncated: ${truncated.length ? `${truncated.length} item(s): ${truncated.join(", ")}` : "none"}`, `- missing: ${missing.length ? missing.join("; ") : "none"}`, `- inaccessible: ${inaccessible.length ? inaccessible.join("; ") : "none"}`].join("\n");
  // Keep the longest prefix of the ranked items whose bundle, report included, fits the budget.
  let kept = rest.length;
  const total = (n) => Buffer.byteLength(`${render(rest.slice(0, n))}${reportOf(rest.slice(n).map((x) => x.it.handle))}\n`, "utf8");
  if (total(kept) > budget) { let lo = 0; let hi = rest.length; while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (total(mid) <= budget) lo = mid; else hi = mid - 1; } kept = lo; }
  const truncated = rest.slice(kept).map((x) => x.it.handle);
  const text = `${render(rest.slice(0, kept))}${reportOf(truncated)}\n`;
  const binding = wanted.filter((it) => it.binding);
  const strip = ({ projection, parent, at, ...it }) => ({ ...it, projection });
  return { text, sha256: sha256(text), bytes: Buffer.byteLength(text, "utf8"), items: [...binding, ...rest.slice(0, kept).map((x) => x.it)].map(strip), binding: binding.map(strip), report: { truncated, missing, inaccessible } };
}

const reOf = (p) => { if (/[gy]/.test(p.flags || "")) throw new Error("pattern flags g and y are not allowed"); return new RegExp(p.re, `${p.flags || ""}g`); };
/** The text with every exception phrase and URL blanked, so "Google AI Studio" never reads as the deprecated AI. */
function withoutExceptions(text, exceptions) {
  let out = String(text);
  for (const e of exceptions || []) out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${reEsc(e)}(?![\\p{L}\\p{N}])`, "giu"), (m) => " ".repeat(m.length));
  return out.replace(/https?:\/\/\S+/g, (m) => " ".repeat(m.length));
}
const familyOf = (payloads, product) => uniquePayloads(payloads).find((x) => x.scope !== "parent" && x.product === product)?.family !== false;

/**
 * check: findings in the visible text of changed lines, per projection rules. input: { lines: [{ path, line, text }] }.
 * A path's own products decide which rules apply; a path no projection claims takes the products the caller names.
 * The parent's canon binds family products only. Term drift and contradictions rest on verified anchors (a projection
 * carries only those); restrictions name rules with no founder source; held paths are reported as held, not drift.
 */
export function checkLines(payloads, input, { lockedPaths = [], products = [] } = {}) {
  const findings = []; const all = uniquePayloads(payloads);
  for (const { path: rel, line: n, text } of input.lines || []) {
    if (matches(lockedPaths, rel)) continue;
    const segs = visibleSegments(rel, text);
    if (!segs.length) continue;
    const visible = segs.join(" | ");
    const mapped = productsForPath(payloads, rel);
    const owners = mapped.length ? mapped : products;
    if (!owners.length) continue;
    for (const p of all) {
      if (p.scope !== "parent" && !owners.includes(p.product)) continue;
      if (p.scope === "parent" && !owners.some((o) => familyOf(payloads, o))) continue;
      for (const it of p.items || []) {
        if (it.section === "terms") {
          const clean = withoutExceptions(visible, it.exceptions);
          for (const d of it.deprecated || []) {
            const hits = clean.match(reOf(d)) || [];
            if (!hits.length) continue;
            const held = matches(it.held_paths, rel);
            findings.push({ kind: held ? "held" : "term-drift", rule: it.handle, path: rel, line: n, found: d.text, preferred: it.preferred || [], count: hits.length, product: owners[0], ...(held ? { note: it.held_reason || "held exception" } : {}) });
          }
        }
        if (it.section === "checks") {
          for (const pat of it.patterns || []) {
            const hits = visible.match(reOf(pat)) || [];
            if (hits.length) findings.push({ kind: it.kind === "restriction" ? "invented-restriction" : "contradiction", rule: it.handle, path: rel, line: n, found: hits[0], note: it.text, product: owners[0] });
          }
        }
      }
    }
  }
  const seen = new Set();
  return findings.filter((f) => { const k = `${f.kind}|${f.found}|${f.path}|${f.line}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/**
 * Coverage: for each product a change touches, every acceptance item that applies to it must hold in the visible text
 * of its pages. A page is an entry file (a route's page, a site HTML page) plus its layouts and the files they import.
 * Every-page items hold on each page the change touches (a page is touched when the change edits a file of its
 * closure). Landing items hold on the product's landing page when the change touches it. Product items without a page
 * hold over the union of the product's pages when the change touches any of them. The parent's every-page items bind
 * family products only. changed: null evaluates every page.
 */
export function coverage(payloads, { products = [], files = new Map(), neverPages = [], changed = null } = {}) {
  const results = []; const changedSet = changed ? new Set(changed) : null; const all = uniquePayloads(payloads);
  const visibleCache = new Map();
  const vis = (f) => { if (!visibleCache.has(f)) visibleCache.set(f, visibleText(f, files.get(f) || "")); return visibleCache.get(f); };
  for (const product of products) {
    const own = all.find((p) => p.scope !== "parent" && p.product === product);
    if (!own) { results.push({ product, ok: false, missing_projection: true, text: "A projection must exist for the product.", detail: "no CONTEXT.md projection for this product" }); continue; }
    const entries = [...files.keys()].filter((rel) => matches(own.paths.entries, rel) && !matches(neverPages, rel) && productsForPath(payloads, rel).includes(product)).sort();
    const pages = entries.map((e) => ({ entry: e, closure: pageClosure(e, files), landing: matches(own.paths.landing, e) }));
    const touched = pages.filter((pg) => !changedSet || [...pg.closure].some((f) => changedSet.has(f)));
    const parents = own.family === false ? [] : all.filter((p) => p.scope === "parent");
    const items = [...parents, own].flatMap((p) => (p.items || []).filter((it) => it.section === "acceptance" && (it.applies_to?.scope === "all-pages" || it.applies_to?.product === product)));
    const judge = (it, text) => {
      if (it.requirement === "topic") { const a = (it.aliases || []).find((x) => new RegExp(`(?<![\\p{L}\\p{N}])${reEsc(x)}(?![\\p{L}\\p{N}])`, "u").test(text)); return a ? [true, `names ${a}`] : [false, `none of ${(it.aliases || []).join(", ")} appears in its visible text`]; }
      if (it.requirement === "absence") { const hit = (it.patterns || []).map((pt) => (text.match(reOf(pt)) || [])[0]).find(Boolean); return hit ? [false, `found ${hit}`] : [true, "absent"]; }
      const lower = text.toLowerCase(); const miss = (it.phrases || []).filter((ph) => !lower.includes(ph.toLowerCase())); return miss.length ? [false, `missing ${miss.join(", ")}`] : [true, "all phrases present"];
    };
    const textOf = (pgs) => [...new Set(pgs.flatMap((pg) => [...pg.closure]))].filter((f) => !matches(neverPages, f)).map(vis).join("\n");
    const seen = new Set();
    for (const it of items) {
      if (seen.has(it.text)) continue; seen.add(it.text);
      const base = { product, rule: it.handle, text: it.text };
      if (it.applies_to.scope === "all-pages") for (const pg of touched) { const [ok, detail] = judge(it, textOf([pg])); results.push({ ...base, page: pg.entry, ok, detail }); }
      else if (it.applies_to.page === "landing") for (const pg of touched.filter((x) => x.landing)) { const [ok, detail] = judge(it, textOf([pg])); results.push({ ...base, page: pg.entry, ok, detail }); }
      else if (touched.length) { const [ok, detail] = judge(it, textOf(pages)); results.push({ ...base, page: "(all pages of the product)", ok, detail }); }
    }
    if (changedSet && !pages.length && [...changedSet].some((rel) => productsForPath(payloads, rel).includes(product) && isPagePath(payloads, rel))) results.push({ product, rule: null, text: "Coverage needs the product's page entries.", ok: false, detail: "page files changed, but no page entry of this product was found" });
  }
  return results;
}

/** Products whose pages (entry plus layouts plus imports, at the given files) include a changed file. */
export function productsAffected(payloads, { files = new Map(), changed = [], neverPages = [] } = {}) {
  const changedSet = new Set(changed); const out = new Set();
  for (const p of uniquePayloads(payloads)) {
    if (p.scope === "parent") continue;
    for (const e of [...files.keys()].filter((rel) => matches(p.paths.entries, rel) && !matches(neverPages, rel) && productsForPath(payloads, rel).includes(p.product))) {
      if ([...pageClosure(e, files)].some((f) => changedSet.has(f))) { out.add(p.product); break; }
    }
  }
  return [...out].sort();
}

/**
 * Problems of one context receipt in itself: its shape, the freshness of every CONTEXT.md it names, that its
 * projections cover every product it declares (and the parent when one is a family product), that it is a story
 * bundle, and that its bundle re-derives from those projections. [] when it proves its bundle.
 */
export function receiptProblems(receipt, { contextFiles = new Map(), payloadsByPath = new Map() } = {}) {
  const P = [];
  if (!receipt || receipt.schema !== RECEIPT_SCHEMA) return [`receipt schema must be ${RECEIPT_SCHEMA}`];
  if (typeof receipt.task_id !== "string" || !receipt.task_id.trim()) P.push("receipt needs a task_id");
  if (receipt.profile !== "team") P.push("a receipt in a team repository is team profile");
  if (!/^[a-f0-9]{64}$/.test(String(receipt.bundle_sha256))) P.push("receipt needs bundle_sha256");
  if (!strArray(receipt.products) || !receipt.products.length) P.push("receipt needs the products it covers");
  if (!strArray(receipt.classes) || !receipt.classes.includes("story")) P.push("receipt is not a story bundle (classes lack story), so it carries no acceptance items");
  if (!Number.isInteger(receipt.budget) || receipt.budget < 1024 || receipt.budget > 65536) P.push("receipt needs an integer budget between 1024 and 65536");
  if (typeof receipt.task !== "string") P.push("receipt needs the task text its bundle was ranked by");
  if (!Array.isArray(receipt.projections) || !receipt.projections.length) P.push("receipt names no projections");
  if (P.length) return P;
  const listed = new Map(receipt.projections.map((x) => [x.path, x]));
  for (const [rel, x] of listed) {
    const bytes = contextFiles.get(rel);
    if (bytes === undefined || !payloadsByPath.has(rel)) { P.push(`receipt names ${rel}, which is not a registered CONTEXT.md here`); continue; }
    if (sha256(bytes) !== x.payload_sha256) P.push(`receipt is stale for ${rel}: its payload_sha256 is not the file's current hash; fetch a fresh bundle`);
  }
  const used = [...listed.keys()].map((rel) => payloadsByPath.get(rel)).filter(Boolean);
  for (const product of receipt.products) if (!used.some((p) => p.scope !== "parent" && p.product === product)) P.push(`receipt declares product ${product} but names no projection of it`);
  if (receipt.products.some((product) => familyOf([...payloadsByPath.values()], product)) && !used.some((p) => p.scope === "parent")) P.push("receipt does not include the parent projection");
  if (!P.length) {
    const again = teamBundle(uniquePayloads(used), { task: receipt.task, products: receipt.products, classes: receipt.classes, budget: receipt.budget, missing: strArray(receipt.missing) ? receipt.missing : [] });
    if (again.sha256 !== receipt.bundle_sha256) P.push("receipt bundle_sha256 does not match the bundle these projections give; fetch a fresh bundle");
  }
  return P;
}

/**
 * The delivery gate over one change. contextFiles: Map(path -> text) of every CONTEXT.md at head; parentPath: the
 * parent projection's path; changed: every path the change adds, modifies or deletes; added and removed: [{ path,
 * line, text }]; files and baseFiles: Map(path -> text) of the page files the gate read at head and at base;
 * receipts: [{ path, data }].
 * Story work is a story path, or a page file whose changed lines change its prose. Story work needs receipts that
 * together cover its products, a clean check, and full coverage of the pages it touches. Any change that touches a
 * page (through its closure, shared layouts and components included) must not break a must-appear item that held at
 * base: such a regression blocks even when the change is not story work. A product blocks when its projection says
 * blocking, or after its advisory date; a broken projection inventory always blocks.
 */
export function evaluateGate({ contextFiles = new Map(), parentPath, changed = [], added = [], removed = [], files = new Map(), baseFiles = null, receipts = [], today = new Date().toISOString().slice(0, 10) }) {
  const inv = loadInventory(contextFiles, parentPath);
  const out = { story: [], touched: [], affected: [], receipts: [], check: [], coverage: [], blocking: [...inv.problems.map((p) => `projection inventory: ${p}`)], advisory: [] };
  if (!inv.parent) return { ...out, ok: false, summary: "the projection inventory is broken; nothing can be checked" };
  const payloadsByPath = inv.payloadsByPath; const payloads = [...payloadsByPath.values()]; const cfg = inv.parent.gate_config;
  // A page file is story work when the prose its changed lines show differs: added prose, removed prose, or edited
  // prose. Moving the same words to a reformatted line (a class name added around unchanged text) is code work.
  const prose = (lines, rel) => lines.filter((l) => l.path === rel).flatMap((l) => visibleSegments(rel, l.text)).filter((seg) => plainWords(seg) >= 4).map((seg) => seg.trim()).sort();
  const proseIn = (rel) => { const a = prose(added, rel); const r = prose(removed, rel); return a.length + r.length > 0 && JSON.stringify(a) !== JSON.stringify(r); };
  const live = changed.filter((rel) => !/(^|\/)CONTEXT\.md$/.test(rel) && !matches(cfg.locked_files, rel));
  out.story = live.filter((rel) => isStoryPath(payloads, rel) || (isPagePath(payloads, rel) && proseIn(rel)));
  out.touched = [...new Set(out.story.flatMap((rel) => productsForPath(payloads, rel)))].sort();
  out.affected = productsAffected(payloads, { files, changed: live, neverPages: cfg.never_pages }).filter((p) => !out.touched.includes(p));
  const blockingOf = (product) => { const p = uniquePayloads(payloads).find((x) => x.scope !== "parent" && x.product === product); const g = p ? p.gate : { mode: "advisory", advisory_until: cfg.advisory_until }; return g.mode === "blocking" || today > g.advisory_until; };
  const flag = (product, msg) => (blockingOf(product) ? out.blocking : out.advisory).push(msg);
  if (!out.story.length && !out.affected.length) return { ...out, ok: out.blocking.length === 0, summary: "no story paths changed and no page touched" };
  for (const rel of out.story.filter((x) => !productsForPath(payloads, x).length)) flag("(unmapped)", `${rel}: a story path no projection or doc owner claims`);
  const covered = new Set();
  for (const r of receipts) {
    const P = receiptProblems(r.data, { contextFiles, payloadsByPath });
    out.receipts.push({ path: r.path, problems: P });
    if (!P.length) { for (const product of r.data.products) covered.add(product); continue; }
    const scope = strArray(r.data?.products) ? r.data.products.filter((x) => out.touched.includes(x)) : [];
    for (const msg of P) { if (scope.length) for (const p of scope) flag(p, `${r.path}: ${msg}`); else out.advisory.push(`${r.path}: ${msg}`); }
  }
  for (const p of out.touched) if (!covered.has(p)) flag(p, `story change to ${p} without a valid .context-receipt.json that covers it`);
  out.check = checkLines(payloads, { lines: added.filter((l) => out.story.includes(l.path)) }, { lockedPaths: cfg.locked_files });
  for (const f of out.check) {
    const msg = `${f.path}:${f.line} ${f.kind}: ${f.found}${f.preferred?.length ? ` (say ${f.preferred.join(" or ")})` : ""}${f.note ? ` [${f.note}]` : ""}`;
    // A held finding (a verified rule under a reported exception that awaits the founder) is always shown, never silenced, and never blocks.
    if (f.kind === "held") out.advisory.push(msg); else flag(f.product, msg);
  }
  const key = (c) => `${c.product}|${c.rule}|${c.page}`;
  const before = baseFiles ? new Map(coverage(payloads, { products: [...out.touched, ...out.affected], files: baseFiles, neverPages: cfg.never_pages, changed: live }).map((c) => [key(c), c])) : new Map();
  out.coverage = coverage(payloads, { products: [...out.touched, ...out.affected], files, neverPages: cfg.never_pages, changed: live });
  for (const c of out.coverage) {
    if (c.ok) continue;
    const msg = `coverage ${c.product}${c.page ? ` ${c.page}` : ""}: ${c.text} (${c.detail})`;
    if (out.touched.includes(c.product)) { flag(c.product, msg); continue; }
    // A page the change touches without story work: only a regression (held at base, fails now) counts against it.
    const was = before.get(key(c));
    if (was?.ok) flag(c.product, `${msg} [the change removed it]`); else out.advisory.push(`${msg} [already missing before this change]`);
  }
  // Claims outside a product's definition are not decided here: the story review seat judges them with the bundle.
  for (const p of out.touched) out.advisory.push(`definition ${p}: the story review seat judges the change against the product's definition in the bundle`);
  return { ...out, ok: out.blocking.length === 0, summary: `${out.story.length} story path(s), products ${out.touched.join(", ") || "none mapped"}${out.affected.length ? `, pages of ${out.affected.join(", ")} touched` : ""}; ${out.blocking.length} blocking, ${out.advisory.length} advisory` };
}
