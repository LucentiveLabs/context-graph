import { readFileSync, existsSync, lstatSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

export function relPathOk(p) {
  return typeof p === "string" && p.length > 0 && !p.startsWith("/") && !p.startsWith("~") && !p.includes("\\") && !p.split("/").some((seg) => seg === ".." || seg === "" || seg === ".");
}
/**
 * Where rel lands inside repoPath, confined by real path: { file } when both the lexical path and its symlink-resolved
 * target stay inside the repo's real root; { escapes: "path" } for a lexical escape; { escapes: "symlink" } when a
 * symlink leads outside. A path that does not exist yet is judged by its nearest existing ancestor; a dangling symlink
 * counts as existing, so its unresolvable target is refused instead of being created by a write that follows it.
 */
export function locate(repoPath, rel) {
  if (!relPathOk(rel)) return { escapes: "path" };
  const root = path.resolve(repoPath);
  const full = path.resolve(root, rel);
  if (!(full === root || full.startsWith(root + path.sep))) return { escapes: "path" };
  let probe = full;
  while (!entryExists(probe) && probe !== root) probe = path.dirname(probe);
  try {
    const realRoot = realpathSync(root); const real = realpathSync(probe);
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) return { escapes: "symlink" };
  } catch { return { escapes: "symlink" }; }
  return { file: full };
}
const entryExists = (p) => { try { lstatSync(p); return true; } catch { return false; } };
export const escapeReason = (where, kind) => (kind === "symlink" ? "escapes the repository through a symlink" : `escapes ${where}`);

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
export const norm = (s) => String(s || "").replace(/\\([*_`\[\]()#>+.!-])/g, "$1").replace(/[\u2018\u2019\u201A\u2032]/g, "'").replace(/[\u201C\u201D\u201E\u2033]/g, '"').replace(/\u2026/g, "...").replace(/[\u2013\u2014]/g, "-").replace(/\*+/g, "*").replace(/\s+/g, " ").trim().toLowerCase();
export const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
export const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function readConfined(root, rel) {
  const L = locate(root, rel);
  if (!L.file) return { escapes: L.escapes };
  return existsSync(L.file) ? { file: L.file, text: readFileSync(L.file, "utf8") } : { missing: true };
}

const ABS_IN_TEXT = /(?:^|[\s"'`(\[<=:,])(?:\/(?:Users|home|private|var\/folders|tmp|Volumes|root|opt|etc)\/|~\/|[A-Za-z]:[\\/])/m;
export const hasAbsolutePath = (text) => ABS_IN_TEXT.test(String(text));
export function absoluteStrings(value, at = "$", out = []) {
  if (typeof value === "string") { if (/^(?:\/|~\/|~$|[A-Za-z]:[\\/])/.test(value) || hasAbsolutePath(value)) out.push(at); }
  else if (Array.isArray(value)) value.forEach((v, i) => absoluteStrings(v, `${at}[${i}]`, out));
  else if (isObj(value)) for (const [k, v] of Object.entries(value)) absoluteStrings(v, `${at}.${k}`, out);
  return out;
}
