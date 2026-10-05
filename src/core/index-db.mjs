// The disposable SQLite index of the graph: nodes, edges, an FTS5 index over labels, concept definitions and aliases
// only (never source text, never founder wording), and snapshot metadata (revision, release state, input file hashes).
// Built from the validated files, written atomically, never committed. Generic: built-in node:sqlite (Node 22.5+).
import { createRequire } from "node:module";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { canonical, canonicalHash } from "./canonical.mjs";

export const INDEX_SCHEMA = "origin-graph-index/v1";
let DatabaseSync = null;
/** node:sqlite, loaded once with its ExperimentalWarning silenced (the API is stable enough for a rebuildable index). */
export function sqlite() {
  if (DatabaseSync) return DatabaseSync;
  const emit = process.emitWarning;
  process.emitWarning = function quiet(w, ...rest) { if (String(w?.message ?? w).includes("SQLite is an experimental feature")) return undefined; return emit.call(process, w, ...rest); };
  try { ({ DatabaseSync } = createRequire(import.meta.url)("node:sqlite")); } finally { process.emitWarning = emit; }
  return DatabaseSync;
}
/** One hash over the sorted "path sha256" lines of every input file: the index is stale once it differs. */
export const inputsHash = (files) => canonicalHash([...files].map((f) => `${f.path} ${f.sha256 ?? "missing"}`).sort());

const DDL = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE files (path TEXT PRIMARY KEY, sha256 TEXT);
CREATE TABLE nodes (id TEXT PRIMARY KEY, kind TEXT NOT NULL, state TEXT NOT NULL, profile TEXT NOT NULL, origin TEXT NOT NULL, label TEXT, policy TEXT NOT NULL, record TEXT NOT NULL);
CREATE TABLE edges (id TEXT PRIMARY KEY, from_id TEXT NOT NULL, predicate TEXT NOT NULL, to_id TEXT NOT NULL, state TEXT NOT NULL, confidence REAL NOT NULL, profile TEXT NOT NULL, origin TEXT NOT NULL, scope TEXT NOT NULL, relation TEXT, policy TEXT NOT NULL, record TEXT NOT NULL);
CREATE INDEX edges_from ON edges (from_id, predicate);
CREATE INDEX edges_to ON edges (to_id, predicate);
CREATE VIRTUAL TABLE text_index USING fts5 (id UNINDEXED, kind UNINDEXED, label, definition, aliases);
`;

/** The text a node may contribute to the FTS index: its label, a concept's definition and aliases. Nothing else. */
export function indexText(rec) {
  return { label: typeof rec.label === "string" ? rec.label : "", definition: rec.kind === "Concept" ? rec.definition || "" : "", aliases: rec.kind === "Concept" ? (rec.aliases || []).join(" | ") : "" };
}

/**
 * Writes the index for a validated graph. snapshot: { revision, release: released | unreleased, overlay: [paths], reason }.
 * The file is written next to its final path and renamed into place, so a reader never sees half an index.
 */
export function writeIndex(graph, dbPath, snapshot) {
  const Database = sqlite();
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const tmp = `${dbPath}.tmp-${process.pid}`;
  rmSync(tmp, { force: true });
  const db = new Database(tmp);
  try {
    db.exec(DDL);
    db.exec("BEGIN");
    const meta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
    const files = [...graph.files].sort((a, b) => a.path.localeCompare(b.path));
    const values = {
      schema: INDEX_SCHEMA, built_at: new Date().toISOString(), revision: snapshot.revision ?? "", release: snapshot.release,
      overlay: JSON.stringify(snapshot.overlay || []), release_reason: snapshot.reason || "", inputs_sha256: inputsHash(files),
      nodes: String(graph.nodes.size), edges: String(graph.assertions.length),
    };
    for (const [k, v] of Object.entries(values)) meta.run(k, String(v));
    const file = db.prepare("INSERT INTO files (path, sha256) VALUES (?, ?)");
    for (const f of files) file.run(f.path, f.sha256 ?? null);
    const node = db.prepare("INSERT INTO nodes (id, kind, state, profile, origin, label, policy, record) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const text = db.prepare("INSERT INTO text_index (id, kind, label, definition, aliases) VALUES (?, ?, ?, ?, ?)");
    for (const [id, { record: r, origin }] of [...graph.nodes].sort(([a], [b]) => a.localeCompare(b))) {
      node.run(id, r.kind, r.state, r.profile, origin, typeof r.label === "string" ? r.label : null, canonical(r.policy), canonical(r));
      const t = indexText(r);
      if (t.label || t.definition || t.aliases) text.run(id, r.kind, t.label, t.definition, t.aliases);
    }
    const edge = db.prepare("INSERT INTO edges (id, from_id, predicate, to_id, state, confidence, profile, origin, scope, relation, policy, record) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const { record: r, origin } of [...graph.assertions].sort((a, b) => a.record.id.localeCompare(b.record.id))) {
      edge.run(r.id, r.from, r.predicate, r.to, r.state, r.confidence, r.profile, origin, r.scope, r.relation ?? null, canonical(r.policy), canonical(r));
    }
    db.exec("COMMIT");
  } catch (e) { try { db.exec("ROLLBACK"); } catch { /* no transaction open */ } db.close(); rmSync(tmp, { force: true }); throw e; }
  db.close();
  renameSync(tmp, dbPath);
  return { path: dbPath, inputs_sha256: inputsHash(graph.files) };
}

export function openIndex(dbPath) {
  if (!existsSync(dbPath)) return null;
  const Database = sqlite();
  return new Database(dbPath, { readOnly: true });
}
export function readMeta(db) { return Object.fromEntries(db.prepare("SELECT key, value FROM meta").all().map((r) => [r.key, r.value])); }
/** Label, definition and alias search (FTS5 MATCH syntax); never reaches source text, because none is indexed. */
export function searchText(db, match, limit = 20) {
  return db.prepare("SELECT id, kind, label FROM text_index WHERE text_index MATCH ? ORDER BY rank LIMIT ?").all(match, limit).map((r) => ({ ...r }));
}
