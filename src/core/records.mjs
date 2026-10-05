// Loader for the stored graph records: small reviewed JSON files under <graph>/{anchors,concepts,assertions,products,evals}/.
// Every read is confined to the repository by real path (locate); a record file that holds an absolute or home path
// fails, whatever field it sits in. Generic: the caller names the root and the graph folder.
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { absoluteStrings, escapeReason, hasAbsolutePath, locate, readConfined, sha256 } from "./portable.mjs";

/** Which kinds each record folder holds. Imported kinds (Source, Item, Excerpt, KernelNode, Question, Decision) are never stored. */
export const RECORD_DIRS = {
  anchors: ["FounderAnchor", "CandidateStatement", "Inference"],
  concepts: ["Concept"],
  products: ["Product", "Artifact", "Claim", "Consumer", "Projection", "Intent"],
  assertions: ["Assertion"],
  evals: ["EvalCase"],
};
export const KIND_PREFIX = {
  FounderAnchor: "anchor", CandidateStatement: "candidate", Inference: "inference", KernelNode: "kernel", Source: "source",
  Item: "item", Excerpt: "excerpt", Concept: "concept", Question: "question", Decision: "decision", Product: "product",
  Artifact: "artifact", Claim: "claim", Consumer: "consumer", Projection: "projection", Intent: "intent", EvalCase: "eval",
};
export const IMPORTED_ONLY = ["KernelNode", "Source", "Item", "Excerpt", "Question", "Decision"];
export const LEDGER_FILE = "anchors/ledger.json";
/** Data files that sit beside the anchor records and are loaded by name, not as records. */
export const RESERVED_FILES = {
  [LEDGER_FILE]: "ledger", "anchors/baseline-revisions.json": "baseline", "anchors/baseline-provenance.json": "baselineProvenance",
  "evals/incident-replay-v1.cases.json": "replayCases", "evals/incident-replay-v1.stage1.json": "replayStage1", "evals/incident-replay-v1.stage2.json": "replayStage2",
};
const PASSIVE = new Set(["README.md", ".gitkeep"]);
// The files of a later replay set (incident-replay-v2 on: its cases, its protocol and its measurements) sit beside the eval
// records as the replay's own data: never records and never graph inputs, so a new row or a measurement moves no graph
// revision. v1's three files keep their named slots above.
const REPLAY_SET_FILE = /^incident-replay-v(?:[2-9]|[1-9]\d+)(?:\.[a-z0-9.-]+)?\.(?:json|md)$/;
const STORED_LOCAL = /^[a-z0-9][a-z0-9.-]*$/;
export const localOf = (id) => String(id || "").slice(String(id || "").indexOf(":") + 1);

const isLink = (p) => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } };
/** { records: [{ record, file, dir }], ledger, baseline, baselineProvenance: { data, file } | null each, files: [{ path, sha256 }], problems } */
export function loadStoredRecords(root, graphRel) {
  const records = []; const files = []; const problems = []; const reserved = {};
  for (const dir of Object.keys(RECORD_DIRS)) {
    const relDir = `${graphRel}/${dir}`;
    const L = locate(root, relDir);
    if (!L.file) { problems.push(`${relDir} ${escapeReason("the repository", L.escapes)}; not read`); continue; }
    if (!existsSync(L.file)) continue;
    for (const ent of readdirSync(L.file, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = `${relDir}/${ent.name}`;
      if (ent.isDirectory()) { problems.push(`${rel}: record folders are flat; no subfolders`); continue; }
      const replayData = dir === "evals" && REPLAY_SET_FILE.test(ent.name);
      if ((PASSIVE.has(ent.name) || (replayData && ent.name.endsWith(".md"))) && !isLink(`${L.file}/${ent.name}`)) continue;
      if (!ent.name.endsWith(".json")) { problems.push(`${rel}: only .json records, README.md and .gitkeep belong here`); continue; }
      const r = readConfined(root, rel);
      if (r.escapes) { problems.push(`${rel} ${escapeReason("the repository", r.escapes)}; not read`); continue; }
      if (r.missing) { problems.push(`${rel}: unreadable`); continue; }
      if (replayData) {
        // The replay's own data, never a graph input; a record saved under such a name is refused, not skipped.
        let kind; try { kind = JSON.parse(r.text)?.kind; } catch (e) { problems.push(`${rel}: not valid JSON (${e.message})`); continue; }
        if (kind !== undefined) problems.push(`${rel}: a replay set's file name holds a record (kind ${kind}); a record file is named after its id`);
        continue;
      }
      files.push({ path: rel, sha256: sha256(Buffer.from(r.text, "utf8")) });
      if (r.text.includes("/Users/") || hasAbsolutePath(r.text)) problems.push(`${rel}: holds an absolute or home path; graph records hold repo-relative pointers only`);
      let data;
      try { data = JSON.parse(r.text); } catch (e) { problems.push(`${rel}: not valid JSON (${e.message})`); continue; }
      for (const at of absoluteStrings(data)) problems.push(`${rel}: absolute path at ${at}`);
      const slot = RESERVED_FILES[`${dir}/${ent.name}`];
      if (slot) { reserved[slot] = { data, file: rel }; continue; }
      const kind = data?.kind;
      if (!RECORD_DIRS[dir].includes(kind)) { problems.push(`${rel}: kind ${kind} does not belong in ${dir}/ (${RECORD_DIRS[dir].join(", ")})`); continue; }
      const local = localOf(data.id);
      if (!STORED_LOCAL.test(local)) problems.push(`${rel}: a stored id is <prefix>:<lowercase slug>, got ${data.id}`);
      else if (`${local}.json` !== ent.name) problems.push(`${rel}: file name must be ${local}.json for ${data.id}`);
      records.push({ record: data, file: rel, dir });
    }
  }
  return { records, ledger: reserved.ledger || null, baseline: reserved.baseline || null, baselineProvenance: reserved.baselineProvenance || null, files, problems };
}
