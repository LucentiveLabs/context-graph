// Deterministic validators of the context graph. Every check fails closed: a problem makes validate exit non-zero and
// build refuse to write the index. They verify that structure, bindings and the required review occurred against the
// exact record; they cannot judge whether an interpretation is right. Generic: captures and receipts resolve through
// functions the caller supplies, and founder wording arrives only as hashed word windows.
import { absoluteStrings, norm, relPathOk } from "./portable.mjs";
import { anchorRecordHash, canonical, ledgerEntryHash, proposalHash } from "./canonical.mjs";
import { nodeKinds, predicateEnum, schemaErrors } from "./schemas.mjs";
import { pairProblem, tableProblems } from "./predicates.mjs";
import { IMPORTED_ONLY, KIND_PREFIX } from "./records.mjs";

export const COPY_WINDOW = 8;
/** A claim's label is the agent's paraphrase of what the artifact says, at most this many words. */
export const CLAIM_WORDS = 25;
/** Product relations that contradict a recorded independence between the same two products, in either direction. */
const TIES = ["powers", "belongs_to", "productizes", "depends_on"];
const PROSE_CAPTURES = ["founder-note", "session-transcript", "meeting-transcript"];
const words = (text) => norm(text).replace(/[^\p{L}\p{N}' ]+/gu, " ").split(" ").filter(Boolean);
/** The set of every run of COPY_WINDOW consecutive words of the texts, normalised (case, quotes, punctuation). */
export function wordWindows(texts, n = COPY_WINDOW) {
  const out = new Set();
  for (const t of texts) { const w = words(t); for (let i = 0; i + n <= w.length; i += 1) out.add(w.slice(i, i + n).join(" ")); }
  return out;
}
function copiedAt(value, windows, at = "$") {
  if (typeof value === "string") { const w = words(value); for (let i = 0; i + COPY_WINDOW <= w.length; i += 1) if (windows.has(w.slice(i, i + COPY_WINDOW).join(" "))) return at; return null; }
  if (Array.isArray(value)) { for (const [i, v] of value.entries()) { const r = copiedAt(v, windows, `${at}[${i}]`); if (r) return r; } return null; }
  if (value && typeof value === "object") { for (const [k, v] of Object.entries(value)) { const r = copiedAt(v, windows, `${at}.${k}`); if (r) return r; } }
  return null;
}
const quotes = (label, text) => words(label).length >= 3 && ` ${words(text).join(" ")} `.includes(` ${words(label).join(" ")} `);

// Reference fields of each kind: [field path, kinds the target must have (null: the field edge's pairs decide)].
const REFS = {
  FounderAnchor: [["supersedes", ["FounderAnchor"]], ["defines", null]],
  CandidateStatement: [["matched_anchor", ["FounderAnchor"]]],
  Inference: [["derived_from", null]],
  Concept: [["examples", null]],
  Product: [["relations.powers", ["Product"]], ["relations.belongs_to", ["Product"]], ["relations.productizes", ["Product"]], ["relations.depends_on", null], ["relations.independent_of", ["Product"]]],
  Artifact: [["product", ["Product"]]],
  Claim: [["artifact", ["Artifact"]], ["about", ["Product"]]],
  Projection: [["consumer", ["Consumer"]], ["product", ["Product"]]],
  Intent: [["root_intent", ["Intent"]], ["parent_intent", ["Intent"]], ["source_refs", null]],
  EvalCase: [["critical_refs", null]],
  Item: [["source", ["Source"]]],
  Excerpt: [["source", ["Source"]]],
};
const fieldAt = (obj, dotted) => dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const short = (h) => (h ? String(h).slice(0, 12) : "none");

/** Cycles of one acyclic predicate, each as a closed id path. */
export function findCycles(pairs) {
  const adj = new Map();
  for (const [a, b] of pairs) { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); }
  const color = new Map(); const stack = []; const found = []; const seen = new Set();
  const visit = (u) => {
    color.set(u, 1); stack.push(u);
    for (const v of adj.get(u) || []) {
      if (color.get(v) === 1) { const cyc = stack.slice(stack.indexOf(v)); const key = [...cyc].sort().join(" "); if (!seen.has(key)) { seen.add(key); found.push([...cyc, v]); } }
      else if (!color.get(v)) visit(v);
    }
    stack.pop(); color.set(u, 2);
  };
  for (const u of [...adj.keys()].sort()) if (!color.get(u)) visit(u);
  return found;
}

/**
 * graph: { schemas, table, nodes: Map(id -> {record, origin: stored|imported, file?}), assertions: [{record, origin: stored|import|field, file?}],
 *          ledger: {data, file} | null, resolveCapture(capture), resolveReceipt(locator), founderWindows: Set, loadProblems, loadWarnings }
 * priorLedger: the ledger at a base revision ({entries}); every entry it holds must be unchanged.
 */
export function validateGraph(graph, { priorLedger = null } = {}) {
  const P = [...(graph.loadProblems || [])]; const W = [...(graph.loadWarnings || [])];
  const flags = { agentGuesses: [], unledgeredAnchors: 0, ledgeredAnchors: 0, pinnedCaptures: 0, unverifiedCaptures: 0, unverifiedReceipts: 0, staleClaims: 0 };
  const { schemas, table, nodes } = graph; const raw = schemas.raw; const common = raw.common.$defs;
  P.push(...schemaErrors(schemas.predicates, table).map((e) => `predicates.json: ${e}`));
  P.push(...tableProblems(table, {
    kinds: nodeKinds(raw), predicates: predicateEnum(raw), states: common.state.enum, profiles: common.profile.enum,
    visibilities: common.policy.properties.visibility.enum, publications: common.policy.properties.publication.enum,
  }));
  const node = (id) => nodes.get(id)?.record;
  const name = (entry) => (entry.file ? `${entry.file} (${entry.record?.id})` : entry.record?.id || "?");

  const policyProblems = (t, rec) => {
    const pol = rec.policy; if (!pol || typeof pol !== "object") return;
    const allowed = new Set();
    for (const c of pol.consumers || []) {
      const cn = node(`consumer:${c}`);
      if (!cn || cn.kind !== "Consumer") P.push(`${t}: policy consumer ${c} is not a Consumer node`);
      else for (const u of cn.uses || []) allowed.add(u);
    }
    for (const u of pol.uses || []) if (!allowed.has(u)) P.push(`${t}: policy use ${u} is permitted by none of its consumers`);
    if (rec.profile === "team" && !["team", "public"].includes(pol.visibility)) P.push(`${t}: a team-profile record needs visibility team or public (has ${pol.visibility})`);
  };
  const validity = (t, rec) => {
    if (rec.state === "retired" && !rec.valid_to) P.push(`${t}: a retired record needs valid_to`);
    if (rec.valid_to && rec.valid_from && rec.valid_to < rec.valid_from) P.push(`${t}: valid_to ${rec.valid_to} is before valid_from ${rec.valid_from}`);
  };
  const receiptProblems = (t, rec) => {
    const all = Array.isArray(rec.review_receipts) ? rec.review_receipts : [];
    const want = proposalHash(rec);
    // Only a receipt whose file resolves here and matches its sha256 counts; an unresolvable one never fills a quorum.
    const verified = new Set();
    for (const x of all) {
      const loc = x?.receipt || {};
      if (!relPathOk(loc.path)) { P.push(`${t}: receipt path must be repo-relative`); continue; }
      if (!loc.sha256) { P.push(`${t}: receipt ${loc.repo}:${loc.path} needs its sha256`); continue; }
      const res = graph.resolveReceipt(loc);
      if (res.status === "invalid") P.push(`${t}: receipt ${res.reason}`);
      else if (res.status === "missing") P.push(`${t}: receipt ${loc.repo}:${loc.path} is missing`);
      else if (res.status === "ok" && res.sha256 !== loc.sha256) P.push(`${t}: receipt ${loc.repo}:${loc.path} sha256 does not match the file`);
      else if (res.status === "ok") verified.add(x);
      else flags.unverifiedReceipts += 1;
    }
    const bound = all.filter((x) => x?.proposal_sha256 === want);
    const boundVerified = bound.filter((x) => verified.has(x));
    // A founder anchor is accepted on his authenticated words alone, except one the capture loop proposed: its kind,
    // scope and label are the loop's interpretation, so it is held to two other-family reviews like any agent record.
    const loopAnchor = rec.kind === "FounderAnchor" && /^capture-loop-/.test(String(rec.proposer?.run || ""));
    if (rec.state === "accepted" && (rec.kind !== "FounderAnchor" || loopAnchor)) {
      const fams = new Set(boundVerified.filter((x) => x.verdict === "approve" && x.family !== rec.proposer?.family).map((x) => x.family));
      if (fams.size < 2) P.push(`${t}: accepted needs verified approving receipts from two model families other than the proposer's, bound to its proposal hash ${short(want)} (found ${fams.size}; ${bound.length - boundVerified.length} bound receipt(s) not verifiable here; ${all.length - bound.length} receipt(s) bound to another proposal)`);
      const dissent = bound.filter((x) => x.verdict !== "approve");
      if (dissent.length) P.push(`${t}: accepted while a bound receipt says ${dissent.map((x) => x.verdict).join(", ")}; disagreement makes it contested`);
    }
    if (rec.state === "contested" && !boundVerified.length) P.push(`${t}: contested needs at least one verified review receipt bound to its proposal hash ${short(want)}`);
  };

  // Nodes.
  for (const [id, entry] of nodes) {
    const r = entry.record; const t = name(entry);
    for (const e of schemaErrors(schemas.node, r)) P.push(`${t}: ${e}`);
    const prefix = KIND_PREFIX[r.kind];
    if (prefix && !String(id).startsWith(`${prefix}:`)) P.push(`${t}: a ${r.kind} id starts with ${prefix}:`);
    if (entry.origin === "stored") {
      if (IMPORTED_ONLY.includes(r.kind)) P.push(`${t}: ${r.kind} is imported from the existing records, never stored`);
      if (r.proposer?.family === "import") P.push(`${t}: proposer import is reserved for records the import adapter derives`);
      receiptProblems(t, r);
    } else if (r.proposer?.family !== "import") P.push(`${t}: an imported record must name proposer import`);
    for (const at of absoluteStrings(r)) P.push(`${t}: absolute path at ${at}`);
    policyProblems(t, r); validity(t, r);
    for (const [field, kinds] of REFS[r.kind] || []) {
      for (const ref of asList(fieldAt(r, field))) {
        if (typeof ref !== "string") continue;
        const target = node(ref);
        if (!target) { P.push(`${t}: ${field} names ${ref}, which is not a node`); continue; }
        if (kinds && !kinds.includes(target.kind)) P.push(`${t}: ${field} must name a ${kinds.join(" or ")} (${ref} is ${target.kind})`);
        if (r.profile === "team" && target.profile !== "team") P.push(`${t}: a team-profile record may not reference the private-profile node ${ref}`);
      }
    }
    if (r.kind === "Claim") {
      const n = words(r.label || "").length;
      if (n > CLAIM_WORDS) P.push(`${t}: a claim's label is a paraphrase of at most ${CLAIM_WORDS} words (has ${n})`);
      const art = node(r.artifact); const bound = r.binds?.artifact_sha256;
      if (art?.kind === "Artifact" && bound && art.locator?.sha256 && bound !== art.locator.sha256) { flags.staleClaims += 1; W.push(`${id}: stale, its artifact ${r.artifact} changed since the claim was read (claims are re-extracted, never carried over)`); }
    }
    if (r.kind === "Inference") {
      const anchors = asList(r.derived_from).filter((x) => node(x)?.kind === "FounderAnchor");
      if (!anchors.length && r.agent_guess !== true) P.push(`${t}: an Inference needs derived_from naming a FounderAnchor, or agent_guess true (it then renders as an agent guess)`);
      else if (anchors.length && r.agent_guess === true) P.push(`${t}: agent_guess is true although derived_from names founder anchors`);
      else if (!anchors.length) { flags.agentGuesses.push(id); W.push(`${id}: agent guess, no founder anchor${r.acts_as_restriction ? "; it acts as a restriction, so check reports it" : ""}`); }
    }
    if (r.kind === "Inference" && r.located_in?.sha256 && graph.resolveLocator) {
      const res = graph.resolveLocator(r.located_in, r.revision);
      if (res.status === "ok" && res.sha256 !== r.located_in.sha256) P.push(`${t}: located_in hash mismatch at ${r.located_in.repo}:${r.located_in.path}#${r.located_in.selector}`);
      else if (res.status === "missing" || res.status === "invalid") P.push(`${t}: located_in ${res.reason || res.status}`);
      else if (res.status === "unresolvable" && r.revision) flags.unverifiedCaptures += 1;
    }
    if (r.kind === "CandidateStatement") {
      const carried = ["matched", "covered"].includes(r.verification);
      const anchor = r.matched_anchor ? node(r.matched_anchor) : null;
      if (carried && anchor?.kind !== "FounderAnchor") P.push(`${t}: a ${r.verification} candidate names the FounderAnchor that carries it (matched_anchor ${r.matched_anchor ? `${r.matched_anchor} is ${anchor ? anchor.kind : "not a node"}` : "missing"})`);
      if (!carried && r.matched_anchor) P.push(`${t}: matched_anchor is set but verification is ${r.verification}`);
      if (carried && r.state !== "retired") P.push(`${t}: a ${r.verification} candidate is retired; its anchor carries the statement now`);
      if (r.verification === "matched" && r.form !== "quote") P.push(`${t}: only a quote can be matched; a ${r.form} is covered at most`);
      if (["pasted", "excerpt", "verified"].includes(r.verification) && r.form !== "quote") P.push(`${t}: ${r.verification} applies to quotes only`);
      if (r.verification === "verified" && !r.verified_in) P.push(`${t}: a verified candidate names the typed turn it was found in (verified_in)`);
      if (r.verification !== "verified" && r.verified_in) P.push(`${t}: verified_in is set but verification is ${r.verification}`);
    }
    if (r.kind === "FounderAnchor" && Array.isArray(r.must_appear)) {
      const ids = new Set();
      for (const m of r.must_appear) {
        if (ids.has(m?.id)) P.push(`${t}: must_appear id ${m.id} is used twice`); ids.add(m?.id);
        const subject = typeof m?.subject === "string" && m.subject.includes(":") ? m.subject : null;
        for (const [what, ref] of [["subject", subject], ["target", m?.target], ["applies_to.target", m?.applies_to?.target]]) if (ref && !node(ref)) P.push(`${t}: must_appear ${m.id} ${what} ${ref} is not a node`);
        const scopeKind = { product: "Product", artifact: "Artifact" }[m?.applies_to?.scope];
        const scoped = m?.applies_to?.target ? node(m.applies_to.target) : null;
        if (scopeKind && scoped && scoped.kind !== scopeKind) P.push(`${t}: must_appear ${m.id} applies to ${m.applies_to.scope} scope, so applies_to.target is ${scopeKind === "Artifact" ? "an" : "a"} ${scopeKind} (${m.applies_to.target} is ${scoped.kind})`);
        if (m?.requirement === "artifact" && m?.target && node(m.target) && node(m.target).kind !== "Artifact") P.push(`${t}: must_appear ${m.id} requires an artifact, so target is an Artifact (${m.target} is ${node(m.target).kind})`);
      }
    }
    if (r.kind === "FounderAnchor" || r.kind === "KernelNode") {
      const c = r.capture || {}; const where = c.class === "interview" ? `${c.id}#${c.selector}` : `${c.repo}:${c.path}#${c.selector}`;
      if (r.kind === "KernelNode" && c.class !== "kernel-node") P.push(`${t}: a KernelNode capture has class kernel-node`);
      if (entry.origin === "stored" && !c.sha256) P.push(`${t}: a stored anchor binds its capture sha256`);
      const res = c.class ? graph.resolveCapture(c) : { status: "invalid", reason: "capture has no class" };
      if (res.status === "ok") {
        if (c.sha256 !== res.sha256) P.push(`${t}: capture hash mismatch at ${where} (record ${short(c.sha256)}, capture ${short(res.sha256)})`);
        if (r.kind === "FounderAnchor" && PROSE_CAPTURES.includes(c.class) && typeof res.text === "string" && typeof r.label === "string" && quotes(r.label, res.text)) P.push(`${t}: the label quotes its capture verbatim; a label is an agent-written handle, never a fragment of his sentence`);
      } else if (res.status === "pinned") {
        flags.pinnedCaptures += 1;
        if (!c.sha256) P.push(`${t}: a capture named by id alone needs its sha256`);
        else if (res.sha256 && c.sha256 !== res.sha256) P.push(`${t}: capture hash mismatch at ${where} (record ${short(c.sha256)}, registered ${short(res.sha256)})`);
      }
      else if (res.status === "unresolvable") { flags.unverifiedCaptures += 1; }
      else P.push(`${t}: capture ${where}: ${res.reason || res.status}`);
    }
  }
  if (flags.unverifiedCaptures) W.push(`${flags.unverifiedCaptures} capture(s) live in a repository that is not resolvable here; their hashes are unverified`);

  // Assertions (stored, imported and record-field edges).
  const seenIds = new Map();
  const acyclic = new Map(Object.entries(table.predicates || {}).filter(([, p]) => p.acyclic).map(([k]) => [k, []]));
  for (const entry of graph.assertions) {
    const r = entry.record; const t = name(entry);
    if (seenIds.has(r.id)) P.push(`${t}: assertion id also used by ${seenIds.get(r.id)}`); else seenIds.set(r.id, t);
    for (const e of schemaErrors(schemas.assertion, r)) P.push(`${t}: ${e}`);
    if (entry.origin === "stored") {
      if (!String(r.id).startsWith("assertion:")) P.push(`${t}: a stored assertion id starts with assertion:`);
      if (r.proposer?.family === "import") P.push(`${t}: proposer import is reserved for records the import adapter derives`);
      receiptProblems(t, r);
    } else if (entry.origin === "import" && r.proposer?.family !== "import") P.push(`${t}: an imported edge must name proposer import`);
    for (const at of absoluteStrings(r)) P.push(`${t}: absolute path at ${at}`);
    const from = node(r.from); const to = node(r.to);
    if (!from) P.push(`${t}: from ${r.from} is not a node`);
    if (!to) P.push(`${t}: to ${r.to} is not a node`);
    if (r.from === r.to) P.push(`${t}: an edge never joins a node to itself`);
    const p = table.predicates?.[r.predicate];
    if (from && to && p) { const why = pairProblem(table, r.predicate, from, to); if (why) P.push(`${t}: ${why}`); }
    for (const ref of asList(r.evidence_refs)) if (!node(ref)) P.push(`${t}: evidence ref ${ref} is not a node`);
    if (p) {
      if (p.qualifier) { if (!p.qualifier.includes(r.relation)) P.push(`${t}: ${r.predicate} needs relation ${p.qualifier.join(" | ")}`); }
      else if (r.relation !== undefined) P.push(`${t}: only aligns_with takes a relation`);
      if (p.evidence_kinds) {
        // Evidence is a separate node: a brief artifact, a decision, a decision anchor or an intent receipt, never an endpoint of the edge itself.
        const counts = (ref) => {
          const n = node(ref);
          if (!n || ref === r.from || ref === r.to || !p.evidence_kinds.includes(n.kind)) return false;
          if (n.kind === "FounderAnchor") return (p.evidence_anchor_kinds || []).includes(n.anchor_kind);
          if (n.kind === "Artifact") return (p.evidence_artifact_kinds || []).includes(n.artifact_kind);
          return true;
        };
        if (!asList(r.evidence_refs).some(counts)) P.push(`${t}: ${r.predicate} needs an evidence ref, other than its own endpoints, to a ${(p.evidence_artifact_kinds || []).join(" or ")} artifact, a decision or an intent receipt`);
      }
      if (p.protects_anchors && entry.origin === "stored" && to?.kind === "FounderAnchor") P.push(`${t}: no stored assertion may ${r.predicate} a founder anchor; only a new founder capture does, through its own anchor`);
      if (acyclic.has(r.predicate) && r.state !== "retired") acyclic.get(r.predicate).push([r.from, r.to]);
    }
    policyProblems(t, r); validity(t, r);
    if (r.profile === "team") for (const ref of [r.from, r.to, ...asList(r.evidence_refs)]) { const n = node(ref); if (n && n.profile !== "team") P.push(`${t}: a team-profile assertion may not touch the private-profile node ${ref}`); }
  }
  for (const [pred, pairs] of acyclic) for (const cyc of findCycles(pairs)) P.push(`${pred} cycle: ${cyc.join(" -> ")}`);

  // A recorded independence contradicts any tie between the same two products, in either direction.
  const live = graph.assertions.map((x) => x.record).filter((r) => r.state !== "retired" && node(r.from)?.kind === "Product" && node(r.to)?.kind === "Product");
  const pairKey = (a, b) => (a < b ? `${a} ${b}` : `${b} ${a}`);
  const ties = new Map();
  for (const r of live) if (TIES.includes(r.predicate)) { const k = pairKey(r.from, r.to); if (!ties.has(k)) ties.set(k, []); ties.get(k).push(`${r.from} ${r.predicate} ${r.to}`); }
  const seenIndependence = new Set();
  for (const r of live) {
    if (r.predicate !== "independent_of") continue;
    const k = pairKey(r.from, r.to);
    if (ties.has(k) && !seenIndependence.has(k)) { seenIndependence.add(k); P.push(`${r.from} independent_of ${r.to} contradicts ${ties.get(k).join("; ")}`); }
  }

  // Founder wording never enters a graph record, stored or imported (and so never the index): no run of COPY_WINDOW words from a founder capture.
  if (graph.founderWindows?.size) {
    for (const entry of [...nodes.values(), ...graph.assertions]) {
      if (entry.origin === "field") continue;
      const hit = copiedAt(entry.record, graph.founderWindows);
      if (hit) P.push(`${name(entry)}: holds ${COPY_WINDOW} or more consecutive words of a founder capture (at ${hit}); the graph keeps pointers, never his wording`);
    }
  }

  // The anchor ledger: append-only, hash-chained, and every accepted anchor frozen.
  const anchors = [...nodes.values()].filter((n) => n.record.kind === "FounderAnchor");
  const ledgered = new Map();
  if (!graph.ledger) P.push("anchors/ledger.json missing; the founder layer needs its ledger, even when empty");
  else {
    for (const e of schemaErrors(schemas.ledger, graph.ledger.data)) P.push(`${graph.ledger.file}: ${e}`);
    let prev = null;
    for (const [i, e] of (Array.isArray(graph.ledger.data?.entries) ? graph.ledger.data.entries : []).entries()) {
      const t = `ledger entry ${i + 1}`;
      if (e.seq !== i + 1) P.push(`${t}: seq is ${e.seq}; entries run 1, 2, 3 in order`);
      if ((e.prev_sha256 ?? null) !== prev) P.push(`${t}: prev_sha256 breaks the chain`);
      if (ledgerEntryHash(e) !== e.entry_sha256) P.push(`${t}: entry_sha256 does not match the entry`);
      prev = e.entry_sha256 ?? null;
      if (ledgered.has(e.anchor)) { P.push(`${t}: ${e.anchor} is already ledgered at entry ${ledgered.get(e.anchor)}`); continue; }
      ledgered.set(e.anchor, i + 1);
      const a = node(e.anchor);
      if (!a || a.kind !== "FounderAnchor") { P.push(`${t}: accepted anchor ${e.anchor} is gone; an accepted anchor is never removed`); continue; }
      if (anchorRecordHash(a) !== e.record_sha256) P.push(`${e.anchor}: changed after acceptance (ledger entry ${i + 1}); an accepted anchor is never edited, only superseded by a new founder capture`);
      if ((a.capture?.sha256 ?? null) !== (e.capture_sha256 ?? null)) P.push(`${e.anchor}: capture sha256 differs from ledger entry ${i + 1}`);
      if (a.state !== "accepted") P.push(`${e.anchor}: ledgered, so its state is accepted (has ${a.state})`);
    }
    if (priorLedger) {
      const cur = graph.ledger.data?.entries || [];
      for (const [i, pe] of (priorLedger.entries || []).entries()) {
        if (!cur[i]) P.push(`ledger entry ${i + 1}: the base revision holds it and this ledger does not; the ledger is append-only (rebase if the base moved)`);
        else if (canonical(cur[i]) !== canonical(pe)) P.push(`ledger entry ${i + 1}: differs from the base revision; the ledger is append-only`);
      }
    }
  }
  for (const a of anchors) if (a.record.state === "accepted" && !ledgered.has(a.record.id)) P.push(`${name(a)}: accepted without a ledger entry`);
  flags.ledgeredAnchors = anchors.filter((a) => ledgered.has(a.record.id)).length;
  flags.unledgeredAnchors = anchors.length - flags.ledgeredAnchors;

  return { ok: P.length === 0, problems: P, warnings: W, flags, counts: countGraph(graph) };
}

export function countGraph(graph) {
  const byKind = {}; const byPredicate = {}; const byOrigin = {}; const anchorClasses = {};
  for (const { record } of graph.nodes.values()) {
    byKind[record.kind] = (byKind[record.kind] || 0) + 1;
    if (record.kind === "FounderAnchor") anchorClasses[record.capture?.class] = (anchorClasses[record.capture?.class] || 0) + 1;
  }
  for (const { record, origin } of graph.assertions) { byPredicate[record.predicate] = (byPredicate[record.predicate] || 0) + 1; byOrigin[origin] = (byOrigin[origin] || 0) + 1; }
  const sort = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  return { nodes: graph.nodes.size, edges: graph.assertions.length, nodesByKind: sort(byKind), edgesByPredicate: sort(byPredicate), edgesByOrigin: sort(byOrigin), anchorsByCaptureClass: sort(anchorClasses) };
}
