// The shared leak scanner (design record: Projections and privacy; Intent receipt). One scanner runs wherever graph
// content leaves the private store: the CONTEXT.md exporter, team bundles, dispatch and review brief builders, PR text
// and logs. It fails closed. Generic: the caller hands in the texts it guards (founder captures, sources, one protected
// interview, the team repository's own canon), the names of sources, and the private path and id patterns of its
// layout; the scanner keeps only normalised word windows in memory and never writes them anywhere.
//
// Team surfaces fail on:
//   - private paths (the caller's patterns plus absolute, home and system paths);
//   - private identifiers (the caller's patterns: source ids, graph node ids, capture selectors, interview pointers);
//   - a verbatim run of 8 or more words from a founder capture or a source, unless the team canon already carries it;
//   - a quotation of 12 or more words;
//   - wording of the protected interview (a run of 6 or more words);
//   - a named source (author, person or title) without a cleared public-narrative row.
// Private surfaces (private context and explain results, founder-note writes, graph files) fail on interview wording
// only: his other words may appear there through their captures.
import { norm } from "./portable.mjs";

export const LEAK_SCANNER = "origin-graph-leak/v1";
export const VERBATIM_WINDOW = 8;
export const INTERVIEW_WINDOW = 6;
export const QUOTE_WORDS = 12;

/** Paths that never leave a private machine, whatever the layout. Callers add their own private repositories. */
export const BASE_PRIVATE_PATHS = Object.freeze([
  { id: "absolute-user-path", re: /\/Users\/[A-Za-z0-9._-]+/ },
  { id: "home-path", re: /(?:^|[\s"'`(\[<=:,])~\/[A-Za-z0-9._-]/ },
  { id: "system-path", re: /(?:^|[\s"'`(\[<=:,])\/(?:home|private|var\/folders|tmp|Volumes|root)\/[A-Za-z0-9._-]/ },
]);
/** Turns { id, re, flags } rows (a config file's patterns) into { id, re: RegExp }. */
export const patternsOf = (rows) => (rows || []).map((r) => ({ id: r.id, re: r.re instanceof RegExp ? r.re : new RegExp(r.re, r.flags || "") }));

/** Normalised words: case, curly quotes and dashes folded, punctuation dropped (the copy check's rule in validate.mjs). */
export const wordsOf = (text) => norm(text).replace(/[^\p{L}\p{N}' ]+/gu, " ").split(" ").filter(Boolean);
/** Every run of n consecutive normalised words of the texts. */
export function windowsOf(texts, n) {
  const out = new Set();
  for (const t of texts || []) { const w = wordsOf(t); for (let i = 0; i + n <= w.length; i += 1) out.add(w.slice(i, i + n).join(" ")); }
  return out;
}
/** The quoted spans of a text: straight or curly double quotes, and single quotes that open after a non-letter. */
export function quotedSpans(text) {
  const out = []; const s = String(text);
  // Every quotation may run across lines. A straight single quote opens only after a non-letter and closes only before
  // a non-letter, so apostrophes inside words (don't, it's) never open or close one; a stray match fails closed.
  const re = /"([^"]{1,2000})"|“([^”]{1,2000})”|(?:^|[^\p{L}\p{N}])'([^']{1,2000})'(?![\p{L}])|‘([^’]{1,2000})’(?![\p{L}])/gu;
  let m;
  while ((m = re.exec(s))) { const g = m[1] ?? m[2] ?? m[3] ?? m[4]; out.push(g); }
  return out;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Builds a scanner. privatePaths and privateIds: [{ id, re, flags }] rows of the caller's layout. founderTexts (or founderWindows, the graph's already normalised 8-word windows of them) and
 * sourceTexts feed the 8-word verbatim check, interviewTexts the 6-word interview
 * check (null when the interview is not resolvable here: the scanner then fails closed with interview-unavailable,
 * unless requireInterview is false, which tests use). canonTexts are texts the team canon already carries: a window
 * they hold is not a leak. names: [{ name, cleared }] of sources and people; a team surface may name one only when
 * cleared is true (a public-narrative clearance row).
 */
export function makeLeakScanner({ founderTexts = [], founderWindows = null, sourceTexts = [], interviewTexts = null, canonTexts = [], names = [], privatePaths = [], privateIds = [], requireInterview = true } = {}) {
  const paths = [...BASE_PRIVATE_PATHS, ...patternsOf(privatePaths)]; const ids = patternsOf(privateIds);
  const canon = windowsOf(canonTexts, VERBATIM_WINDOW);
  const founder = windowsOf(founderTexts, VERBATIM_WINDOW);
  for (const w of founderWindows || []) founder.add(w);
  const source = windowsOf(sourceTexts, VERBATIM_WINDOW);
  // An empty protected corpus is no corpus: the scanner then fails closed as if the interview were not resolvable.
  const interviewSet = interviewTexts ? windowsOf(interviewTexts, INTERVIEW_WINDOW) : null;
  const interview = interviewSet && interviewSet.size ? interviewSet : null;
  const named = names
    .filter((n) => !n.cleared && typeof n.name === "string" && wordsOf(n.name).length >= 2)
    .map((n) => ({ name: n.name, re: new RegExp(`(?<![\\p{L}\\p{N}])${wordsOf(n.name).map(esc).join("[^\\p{L}\\p{N}]+")}(?![\\p{L}\\p{N}])`, "iu") }));

  /** hits: [{ id, detail }]. surface: team | private. */
  function scan(text, { surface = "team" } = {}) {
    const hits = []; const s = String(text ?? "");
    const w = wordsOf(s);
    if (!interview) { if (requireInterview) hits.push({ id: "interview-unavailable", detail: "the protected interview is not resolvable here, so its wording cannot be ruled out; nothing leaves" }); }
    else for (let i = 0; i + INTERVIEW_WINDOW <= w.length; i += 1) { const k = w.slice(i, i + INTERVIEW_WINDOW).join(" "); if (interview.has(k)) { hits.push({ id: "interview-wording", detail: `a ${INTERVIEW_WINDOW}-word run of the protected interview at word ${i + 1}` }); break; } }
    if (surface !== "team") return hits;
    for (const { id, re } of paths) if (re.test(s)) hits.push({ id, detail: "a private path" });
    for (const { id, re } of ids) { const m = re.exec(s); if (m) hits.push({ id, detail: `private identifier ${m[0]}` }); }
    for (let i = 0; i + VERBATIM_WINDOW <= w.length; i += 1) {
      const k = w.slice(i, i + VERBATIM_WINDOW).join(" ");
      if (canon.has(k)) continue;
      if (founder.has(k)) { hits.push({ id: "founder-verbatim", detail: `an ${VERBATIM_WINDOW}-word run of a founder capture at word ${i + 1}` }); break; }
      if (source.has(k)) { hits.push({ id: "source-verbatim", detail: `an ${VERBATIM_WINDOW}-word run of a source at word ${i + 1}` }); break; }
    }
    for (const q of quotedSpans(s)) { const n = wordsOf(q).length; if (n >= QUOTE_WORDS) { hits.push({ id: "long-quote", detail: `a quotation of ${n} words` }); break; } }
    for (const n of named) if (n.re.test(s)) hits.push({ id: "named-source", detail: `names ${n.name} without a cleared public-narrative row` });
    return hits;
  }
  return { scan, version: LEAK_SCANNER, ready: { interview: !!interview }, sizes: { founder: founder.size, source: source.size, interview: interview ? interview.size : 0, canon: canon.size, names: named.length } };
}

/** Every string inside a JSON value, with its path; the scanner reads JSON payloads one string at a time. */
export function stringsOf(value, at = "$", out = []) {
  if (typeof value === "string") out.push({ at, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => stringsOf(v, `${at}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) stringsOf(v, `${at}.${k}`, out);
  return out;
}
/** Scans markdown: fenced code blocks are scanned for ids, paths and windows but not for quotations (JSON quotes keys). */
export function scanMarkdown(scanner, text, opts = {}) {
  const hits = [];
  const fences = []; const prose = String(text).replace(/```[\s\S]*?```/g, (m) => { fences.push(m); return "\n"; });
  hits.push(...scanner.scan(prose, opts));
  for (const f of fences) for (const h of scanner.scan(f.replace(/"/g, " "), opts)) if (!hits.some((x) => x.id === h.id)) hits.push(h);
  return hits;
}
