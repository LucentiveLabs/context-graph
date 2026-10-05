// Intent receipts (design record: Intent receipt; P5). intent mints a task's private card in the founder's lane and
// renders it into the team form through the one-way handoff: the IAS contract intent-card.v2, whose validators the
// caller hands in (contract), so this library holds no second schema. Generic over the serving view (graph, serving
// config, projections, salt, scanner), so it holds no repository layout and no data.
//
// Private form: sourceRefs are opaque ctx: handles of his request and corrections (founder anchors that resolve to
// their captures through explain, privately); constraints and terms point at verified, active founder anchors by id;
// the manifest names the graph revision, the private bundle hash and the records used. His words are never in a card.
// Team form: every id is an opaque ctx: handle, every constraint and term an item of the team bundle the context
// receipt proves, the manifest is the receipt's (projection revision, bundle hash, classes, products, item handles).
// A private constraint with no team item is withheld and reported, never rewritten. A selected team binding
// without verified support refuses the complete intent receipt. Children inherit the root's handles immutably. A routine task gets a card
// only when a scope that governs its domain gives it scoped constraints: the private form, and no team form.
import { ctxHandle } from "./project.mjs";
import { stringsOf } from "./leak.mjs";
import { RECEIPT_SCHEMA, receiptProblems, sha256, teamBundle, uniquePayloads } from "./team.mjs";

export const INTENT_STORE = "origin-intent/v1";
export const CARD_SCHEMA = "intent-card.v2";
export const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
/** The contract's private record id (no # fragments): anything else travels as a handle. */
export const RECORD_ID = /^[a-z][a-z-]*:[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const HANDLE = /^ctx:[a-f0-9]{8}$/;
const CONSTRAINT_SECTIONS = ["definitions", "decisions", "acceptance"];
const V1_TEXT = ["originalProblem", "intendedPerson", "desiredOutcome", "affectedJourney"];
const V1_LISTS = ["vitalOutcomes", "hardFloors", "nonGoals"];
const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const base = (ref) => String(ref).split("#")[0];
const uniq = (list) => [...new Set(list)];
const uniqBy = (list, key) => { const seen = new Set(); return list.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }); };

/** The stored Intent node of a task: intent:task-<slug>. */
export const intentNodeId = (taskId) => `intent:task-${String(taskId).toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^[-.]+|[-.]+$/g, "")}`;
/** Opaque handles of the intent namespaces; only the private salt maps them back. */
export const intentHandle = (salt, id) => ctxHandle(salt, "intent", id);
export const sourceHandle = (salt, id) => ctxHandle(salt, "intent-source", id);
/** The team projection revision of a context receipt (the team gate recomputes it the same way): sha256 over its sorted "handle payload_sha256" rows. */
export function projectionRevisionOf(receipt) {
  return sha256((receipt?.projections || []).map((p) => `${p.handle} ${p.payload_sha256}`).sort().join("\n"));
}

/** Problems of an intent input in itself (before anything is resolved). */
export function inputProblems(input, { child = false } = {}) {
  const P = [];
  if (!input || typeof input !== "object") return ["the intent input must be a JSON object"];
  if (!TASK_ID.test(String(input.taskId))) P.push("taskId must be a ticket key or a slug (letters, digits, . _ -; at most 81)");
  if (!child && (typeof input.request !== "string" || !input.request.trim())) P.push("request must name the task as asked (it ranks the bundle; his words stay in their captures)");
  if (typeof input.repo !== "string" || !input.repo) P.push("repo must name the repository the work lands in");
  if (!Array.isArray(input.sources ?? [])) P.push("sources must list the founder anchors of his request and corrections");
  for (const f of [...V1_TEXT, "interpretation"]) if (input[f] !== undefined && (typeof input[f] !== "string" || !input[f].trim())) P.push(`${f} must be a non-empty string`);
  for (const f of [...V1_LISTS, "acceptance", "openQuestions", "visualReferences"]) if (input[f] !== undefined && !(Array.isArray(input[f]) && input[f].every((x) => typeof x === "string" && x.trim()))) P.push(`${f} must be an array of non-empty strings`);
  if (input.constraints !== undefined && !(Array.isArray(input.constraints) && input.constraints.every((c) => c && typeof c.text === "string" && c.text.trim() && typeof c.ref === "string"))) P.push("constraints must be [{ text, ref }]");
  if (!input.proposer || typeof input.proposer.family !== "string" || typeof input.proposer.model !== "string") P.push("proposer must name { family, model } of the agent minting the card");
  return P;
}

/**
 * Mints the cards of one task. view: the serving view (graph, serving, salt, projections, server, scanner, verified,
 * snapshot, graphRevision). contract: the IAS validators (validateIntentCardV2, validateIntentCardLineage). parent:
 * the stored intent of the parent task (a child), root: the stored intent of the root task. replay: { ref } in the
 * incident replay, where the case task stands in for his request (no capture): its handle is minted from ref.
 * Returns { ok, errors, private, team, receipt, withheld, request, sources }; nothing is written.
 */
export function mintIntent(view, input, { contract, parent = null, root = null, replay = null, receiptDate = null } = {}) {
  const errors = inputProblems(input, { child: !!parent });
  if (errors.length) return { ok: false, errors };
  const S = view.server; const serving = view.serving;
  const teamRepos = serving.team_repos || [serving.team_repo];
  const teamTarget = teamRepos.includes(input.repo);
  if (!teamTarget && !(serving.private_repos || []).includes(input.repo)) return { ok: false, errors: [`repo ${input.repo} is neither a team repository (${teamRepos.join(", ")}) nor a private one`] };
  if (parent && !root) return { ok: false, errors: ["a child needs its root intent"] };
  if (parent?.intent_receipt && contract.canonicalIntentJson(parent.intent_receipt.card) !== contract.canonicalIntentJson(parent.team)) return { ok: false, errors: ["the stored parent card differs from its immutable intent receipt"] };
  if (parent && parent.task_id === input.taskId) return { ok: false, errors: ["a child has its own taskId"] };

  // ---- his request and corrections: verified founder anchors, as handles ----------------------------------------
  const sources = uniq(asList(input.sources));
  for (const id of sources) {
    const r = S.rec(id);
    if (!r) errors.push(`source ${id} is not in the graph`);
    else if (r.kind !== "FounderAnchor") errors.push(`source ${id} is a ${r.kind}; sources are founder anchors of his request and corrections (capture his words first)`);
    else if (!view.verified(id)) errors.push(`source ${id} is not verified (ledgered and accepted); capture his words first`);
    else { const c = view.captureText(r); if (!["ok", "pinned"].includes(c.status)) errors.push(`source ${id}: its capture does not resolve here (${c.status})`); }
  }
  if (!sources.length && !replay && !parent) errors.push("sources must name at least one founder anchor of his request (capture it first)");
  if (errors.length) return { ok: false, errors };
  const ownRefs = [...(replay ? [sourceHandle(view.salt, replay.ref)] : []), ...sources.map((id) => sourceHandle(view.salt, id))];
  const sourceRefs = uniq([...(parent ? parent.private.sourceRefs : []), ...ownRefs]);
  const known = new Set(); for (const pj of view.projections.values()) { known.add(pj.payload?.projection); for (const h of Object.keys(pj.basis?.items || {})) known.add(h); }
  for (const h of ownRefs) if (known.has(h)) errors.push(`handle ${h} collides with a projection handle; refusing rather than aliasing two records`);

  // ---- the request: a child inherits its parent's unless it names its own ------------------------------------
  const pick = (k) => (input[k] !== undefined ? input[k] : parent?.request?.[k]);
  const request = { task: input.request ?? parent?.request?.task ?? "", repo: input.repo, product: asList(pick("product")).map((p) => String(p).replace(/^product:/, "")), artifact: pick("artifact") || undefined, kind: asList(pick("kind")), budget: Number(pick("budget")) > 0 ? Number(pick("budget")) : (serving.budget_bytes || 12288) };
  const req = { task: request.task, budget: request.budget, ...(request.product.length ? { product: request.product } : {}), ...(request.artifact ? { artifact: request.artifact } : {}), ...(request.kind.length ? { kind: request.kind } : {}) };
  const team = teamTarget ? S.context({ ...req, repo: input.repo, surface: "team" }) : null;
  if (team && !team.applies) return { ok: false, errors: [`no intent receipt: ${team.reason}`] };
  if (team && !team.ok) return { ok: false, errors: [`the team bundle was refused: ${team.error}`] };
  const privateRepo = (serving.private_repos || []).includes(input.repo) ? input.repo : serving.private_repos[0];
  const priv = S.context({ ...req, ...(team ? { product: team.products, kind: team.classes } : {}), repo: privateRepo, surface: "private" });
  if (!priv.applies) return { ok: false, errors: [`no intent receipt: ${priv.reason}`] };
  if (!priv.ok) return { ok: false, errors: [`the private bundle was refused: ${priv.error}`] };
  const classes = team ? team.classes : priv.classes; const products = team ? team.products : priv.products;

  // ---- the private form ----------------------------------------------------------------------------------------
  const B = S.binding({ task: request.task, repo: privateRepo, classes, products, artifact: request.artifact });
  const verifiedActive = (id) => { const r = S.rec(id); return !!r && r.kind === "FounderAnchor" && view.verified(id) && S.isActive(r); };
  // An adopted library decision counts only as the founder adopted it: accepted, live, and, when its evidence is a
  // founder note, with that note's anchor verified.
  const decisionOk = (id) => { const r = S.rec(id); return !!r && r.kind === "Decision" && r.state === "accepted" && r.approved_by === "founder" && r.valid_to == null && (!r.evidence_ref || view.verified(`anchor:${r.evidence_ref}`)); };
  /** What a card's constraint or term may point at: a verified, active founder anchor by its record id, or an adopted decision. */
  const refOk = (ref) => RECORD_ID.test(String(ref)) && (verifiedActive(ref) || decisionOk(ref));
  const withheld = [];
  const phrasing = (a) => S.canonFor(a)[0]?.text || null;
  const constraintsP = []; const termsP = []; const acceptanceP = [];
  for (const a of B.active) {
    if (!verifiedActive(a.id)) { withheld.push({ ref: a.id, form: "private", reason: "not verified (no ledger entry) or not active: a card points at verified anchors only" }); continue; }
    if (a.anchor_kind === "term") termsP.push({ text: phrasing(a) || `Say ${a.preferred}${asList(a.deprecated).length ? `; retired: ${asList(a.deprecated).join(", ")}` : ""}.`, ref: a.id });
    else constraintsP.push({ text: phrasing(a) || `${a.label} (${a.anchor_kind === "definition" ? `defines ${String(a.defines).replace(/^product:/, "")}` : `scope ${a.scope}`}).`, ref: a.id });
  }
  for (const { anchor, entry } of B.acceptance) {
    if (!verifiedActive(anchor)) continue;
    const text = S.canonForMust(anchor, entry.id)?.text || `${entry.label}: ${entry.requirement}${entry.subject ? ` ${String(entry.subject).replace(/^[a-z]+:/, "")}` : ""}.`;
    acceptanceP.push(text); constraintsP.push({ text, ref: anchor });
  }
  // Constraints the agent adds (a correction he made): verified, active founder anchors (or adopted library decisions) only.
  for (const c of asList(input.constraints)) {
    const r = S.rec(c.ref) || S.rec(base(c.ref));
    if (!r) { errors.push(`constraint ref ${c.ref} is not in the graph`); continue; }
    if (r.kind === "CandidateStatement") { errors.push(`constraint ref ${c.ref} is a CandidateStatement (reported, unverified): a card points at verified anchors only`); continue; }
    if (r.kind === "Decision") { if (decisionOk(r.id)) constraintsP.push({ text: c.text, ref: r.id }); else errors.push(`constraint ref ${c.ref} is a decision that is not adopted and live (accepted, approved by the founder, its evidence verified)`); continue; }
    if (r.kind !== "FounderAnchor") { errors.push(`constraint ref ${c.ref} is a ${r.kind}; constraints point at a founder anchor or an adopted decision`); continue; }
    if (!RECORD_ID.test(c.ref)) { errors.push(`constraint ref ${c.ref} is a statement of a founder note: name it in sources (his request or correction), or capture a typed anchor`); continue; }
    if (!verifiedActive(r.id)) { errors.push(`constraint ref ${c.ref} is not a verified, active founder anchor`); continue; }
    constraintsP.push({ text: c.text, ref: r.id });
  }
  const own = (k) => (input[k] !== undefined ? input[k] : undefined);
  const inherit = (k) => own(k) ?? parent?.private?.[k];
  const attribution = `Agent reading (${input.proposer.family}/${input.proposer.model})`;
  const interpretation = own("interpretation") !== undefined ? `${attribution}: ${input.interpretation.trim()}` : parent?.private?.interpretation;
  const core = {};
  for (const f of V1_TEXT) core[f] = inherit(f);
  for (const f of V1_LISTS) core[f] = inherit(f) ?? (f === "vitalOutcomes" ? undefined : []);
  const missingCore = [...V1_TEXT, "vitalOutcomes"].filter((f) => core[f] === undefined);
  if (missingCore.length) errors.push(`the card needs ${missingCore.join(", ")} (the v1 core: the agent states the problem, person, outcome and journey)`);
  if (!interpretation) errors.push("interpretation is required: the agent's reading of his request, attributed as such");
  const acceptance = uniq([...(parent ? parent.private.acceptance : []), ...acceptanceP, ...asList(input.acceptance)]);
  if (!acceptance.length) errors.push("acceptance needs at least one item: a binding acceptance entry or one the agent states");
  if (errors.length) return { ok: false, errors };
  const rootId = parent ? root.private.rootIntentId : intentNodeId(input.taskId);
  const privateItems = uniq([...priv.binding, ...priv.included].map(base).map((id) => (RECORD_ID.test(id) ? id : `canon-open:${id}`)));
  const card = {
    schema: CARD_SCHEMA, profile: "private", taskId: input.taskId, rootIntentId: rootId, parentIntentId: parent ? intentNodeId(parent.task_id) : null,
    ...core, sourceRefs, interpretation, acceptance,
    constraints: uniqBy([...(parent ? parent.private.constraints : []), ...constraintsP], (c) => `${c.ref}\n${c.text}`),
    terms: uniqBy([...(parent ? parent.private.terms : []), ...termsP], (c) => `${c.ref}\n${c.text}`),
    openQuestions: uniq([...(parent ? parent.private.openQuestions : []), ...asList(input.openQuestions)]),
    contextManifest: { profile: "private", revision: view.graphRevision, bundleSha256: priv.bundle_sha256, items: uniq([...(parent ? parent.private.contextManifest.items : []), ...privateItems]), classes, products },
    productRevision: view.snapshot?.snapshot_sha256 || "unknown", visualReferences: uniq([...(parent ? parent.private.visualReferences : []), ...asList(input.visualReferences)]),
  };
  // Every ref the card carries, inherited ones included, is re-checked now: a stored parent hands on nothing that is
  // not a verified, active anchor or an adopted decision today.
  for (const c of [...card.constraints, ...card.terms]) if (!refOk(c.ref)) errors.push(`the private card would point at ${c.ref}, which is not a verified, active founder anchor or an adopted decision${parent ? " (inherited from the parent: mint the card again from its root)" : ""}`);

  // ---- the team form -------------------------------------------------------------------------------------------
  let teamCard = null; let receipt = null; let intentReceipt = null;
  if (team?.scoped) {
    // A routine task's scoped constraints: the private card stays in the founder's lane for the conductor, and no team
    // form is minted (the team receipt proves story work only, and the IAS contract carries no card in a routine brief,
    // X08). The team surface gets the scoped block from context; every constraint is reported as withheld here.
    for (const c of [...constraintsP, ...termsP]) withheld.push({ ref: c.ref, form: "team", reason: "a routine task: no team form is minted (the team receipt proves story work only; X08); the team surface gets the scoped block from context" });
  } else if (team) {
    const itemOf = new Map();
    for (const pj of view.projections.values()) for (const it of pj.payload?.items || []) itemOf.set(it.handle, { item: it, refs: pj.basis?.items?.[it.handle]?.refs || [] });
    const allVerified = (refs) => refs.length > 0 && refs.every((r) => refOk(base(r)));
    const constraintsT = []; const termsT = []; const acceptanceT = []; const carriedRefs = new Set();
    for (const h of team.binding) {
      const x = itemOf.get(h); if (!x) continue;
      if (!allVerified(x.refs)) { errors.push(`team intent: binding item ${h} is not supported entirely by verified active anchors or adopted decisions; a complete receipt cannot omit it`); continue; }
      for (const r of x.refs) carriedRefs.add(base(r));
      if (x.item.section === "terms") termsT.push({ text: x.item.text, ref: h });
      else if (CONSTRAINT_SECTIONS.includes(x.item.section)) { constraintsT.push({ text: x.item.text, ref: h }); if (x.item.section === "acceptance") acceptanceT.push(x.item.text); }
    }
    for (const c of [...constraintsP, ...termsP]) {
      if (carriedRefs.has(c.ref)) continue;
      const r = S.rec(c.ref);
      const reason = r && S.isFounderPrivate(r) ? "founder-private: served in the private profile only" : S.canonFor(r || {}).length ? "its team phrasing is not in this bundle" : "no team phrasing yet (serving/canon.json)";
      withheld.push({ ref: c.ref, form: "team", reason });
    }
    const projections = team.projections.flatMap((p) => (view.exports.get(p.product) || []).map((rel) => ({ path: rel, handle: p.handle, payload_sha256: p.payload_sha256 })));
    receipt = { schema: RECEIPT_SCHEMA, task_id: input.taskId, profile: "team", task: request.task, classes: team.classes, products: team.products, budget: team.budget, missing: team.report.missing, bundle_sha256: team.bundle_sha256, projections, acceptance: team.binding.filter((h) => team.text.includes(h)), ...(receiptDate ? { created_at: receiptDate } : {}), tool: "sources-graph intent" };
    const p = parent?.team;
    teamCard = {
      schema: CARD_SCHEMA, profile: "team", taskId: input.taskId, rootIntentId: intentHandle(view.salt, rootId), parentIntentId: parent ? intentHandle(view.salt, intentNodeId(parent.task_id)) : null,
      ...core, sourceRefs, interpretation,
      acceptance: uniq([...(p ? p.acceptance : []), ...acceptanceT, ...asList(input.acceptance)]),
      constraints: uniqBy([...(p ? p.constraints : []), ...constraintsT], (c) => `${c.ref}\n${c.text}`),
      terms: uniqBy([...(p ? p.terms : []), ...termsT], (c) => `${c.ref}\n${c.text}`),
      openQuestions: card.openQuestions,
      contextManifest: { profile: "team", revision: projectionRevisionOf(receipt), bundleSha256: receipt.bundle_sha256, items: uniq([...(p ? p.contextManifest.items : []), ...team.included]).sort(), classes: team.classes, products: team.products },
      productRevision: card.productRevision, visualReferences: card.visualReferences,
    };
    if (!teamCard.acceptance.length) errors.push("the team form has no acceptance item: every acceptance entry is founder-private or unphrased; state one the team may see");
    // Every team constraint and term, inherited ones included, is an item of today's projections with today's text, in
    // its own section, resting on verified anchors or adopted decisions only: a stored parent hands on no stale sentence.
    for (const [field, sections] of [["constraints", CONSTRAINT_SECTIONS], ["terms", ["terms"]]]) {
      teamCard[field].forEach((c, i) => {
        const x = itemOf.get(c.ref);
        const why = !x ? "is no item of the committed projections" : !sections.includes(x.item.section) ? `is a ${x.item.section} item, not one of ${field}` : (x.item.text !== c.text && !(p && team.binding.includes(c.ref) && ["definitions", "decisions", "terms"].includes(x.item.section) && p[field].some((old) => old.ref === c.ref && old.text === c.text))) ? "carries a sentence that is not the item's current text" : !allVerified(x.refs) ? "rests on a record that is no longer a verified, active anchor or an adopted decision" : null;
        if (why) errors.push(`team card: ${field}[${i}] ${why}${parent ? " (inherited from the parent: mint the card again from its root)" : ""}`);
      });
    }
    if (p && !parent.team) errors.push("the parent has no team form, so a team child cannot inherit its handles");
    errors.push(...seamProblems(view, teamCard, receipt));
    if (!errors.length) {
      try {
        const parentReceipt = parent?.team ? (parent.intent_receipt ?? contract.createIntentReceiptV2(intentHandle(view.salt, intentNodeId(parent.task_id)), parent.team)) : undefined;
        intentReceipt = contract.assembleIntentReceipt({
          intentId: intentHandle(view.salt, intentNodeId(input.taskId)), card: teamCard,
          receipt, bundle: receiptBundle(view, receipt), parent: parentReceipt,
        });
        // The exported card, signed dispatch brief and reviewer context are one
        // complete value, including scope and match conditions from the bundle.
        teamCard = intentReceipt.card;
      } catch (e) { errors.push(`team intent receipt: ${e.message}`); }
    }
  } else if (parent?.team) errors.push("the parent has a team form; its child lands in a team repository too");

  // ---- the contract, the lineage and the leak scanner ------------------------------------------------------------
  const v = contract.validateIntentCardV2(card, { profile: "private" });
  errors.push(...v.errors.map((e) => `private card: ${e}`));
  if (teamCard) { const t = contract.validateIntentCardV2(teamCard, { profile: "team" }); errors.push(...t.errors.map((e) => `team card: ${e}`)); }
  if (parent) {
    errors.push(...contract.validateIntentCardLineage(card, root.private).errors.map((e) => `private lineage: ${e}`));
    if (teamCard && root.team) errors.push(...contract.validateIntentCardLineage(teamCard, root.team).errors.map((e) => `team lineage: ${e}`));
  }
  const scanner = view.scanner();
  for (const { at, text } of stringsOf(card)) for (const h of scanner.scan(text, { surface: "private" })) errors.push(`leak scanner refused the private card at ${at}: ${h.id}`);
  for (const [name, obj] of [["team card", teamCard], ["receipt", receipt]]) if (obj) for (const { at, text } of stringsOf(obj)) for (const h of scanner.scan(text, { surface: "team" })) errors.push(`leak scanner refused the ${name} at ${at}: ${h.id}`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], private: card, team: teamCard, receipt, intentReceipt, withheld: uniqBy(withheld, (w) => `${w.form}|${w.ref}`), request, sources, privateBundle: { sha256: priv.bundle_sha256, bytes: priv.bytes, binding: priv.binding }, teamBundle: team ? { sha256: team.bundle_sha256, bytes: team.bytes, binding: team.binding, included: team.included } : null };
}

/** Reconstruct exactly the selected bundle from committed projection payloads. */
function receiptBundle(view, receipt) {
  const payloads = new Map();
  for (const [key, projection] of view.projections) for (const rel of view.exports.get(key) || []) payloads.set(rel, projection.payload);
  const used = receipt.projections.map((entry) => payloads.get(entry.path)).filter(Boolean);
  return teamBundle(uniquePayloads(used), { task: receipt.task, products: receipt.products, classes: receipt.classes, budget: receipt.budget, missing: Array.isArray(receipt.missing) ? receipt.missing : [] });
}

/**
 * The seam a team repository checks (its intent-receipts gate): the receipt itself re-derives from the
 * committed projections, and the card's manifest is the receipt's: bundle hash, projection revision, classes a
 * superset, products equal, and every item, constraint and term handle an item of the bundle the receipt proves.
 */
export function seamProblems(view, card, receipt) {
  const P = [];
  const paths = new Map(); const files = new Map();
  for (const [key, pj] of view.projections) for (const rel of view.exports.get(key) || []) { paths.set(rel, pj.payload); files.set(rel, pj.md); }
  for (const p of receiptProblems(receipt, { contextFiles: files, payloadsByPath: paths })) P.push(`receipt: ${p}`);
  const m = card.contextManifest;
  if (m.bundleSha256 !== receipt.bundle_sha256) P.push("team card: contextManifest.bundleSha256 is not the receipt's bundle_sha256");
  if (m.revision !== projectionRevisionOf(receipt)) P.push("team card: contextManifest.revision is not the receipt's projection revision");
  for (const c of receipt.classes || []) if (!m.classes.includes(c)) P.push(`team card: contextManifest.classes lacks the receipt's class ${c}`);
  if (JSON.stringify([...m.products].sort()) !== JSON.stringify([...(receipt.products || [])].sort())) P.push("team card: contextManifest.products are not the receipt's");
  const used = (receipt.projections || []).map((x) => paths.get(x.path)).filter(Boolean);
  const bundle = teamBundle(uniquePayloads(used), { task: receipt.task, products: receipt.products, classes: receipt.classes, budget: receipt.budget, missing: Array.isArray(receipt.missing) ? receipt.missing : [] });
  const handles = new Set(bundle.items.map((it) => it.handle));
  m.items.forEach((h, i) => { if (!handles.has(h)) P.push(`team card: contextManifest.items[${i}] ${HANDLE.test(h) ? h : "(not a handle)"} is not an item of the bundle the receipt proves`); });
  for (const f of ["constraints", "terms"]) card[f].forEach((c, i) => { if (!handles.has(c.ref)) P.push(`team card: ${f}[${i}].ref is not an item of the bundle the receipt proves`); });
  return P;
}

/** The stored intent of a task (sources/graph/intents/<taskId>.json in origin): the request, both forms and the receipt. */
export function storedIntent(m, { input, root = null, parent = null, minted }) {
  return {
    schema: INTENT_STORE, task_id: input.taskId, root_task: parent ? root.task_id : input.taskId, parent_task: parent ? parent.task_id : null,
    request: m.request, sources: m.sources, proposer: input.proposer, minted,
    private: m.private, team: m.team, receipt: m.receipt, intent_receipt: m.intentReceipt, withheld: m.withheld,
  };
}

/** The Intent node of a stored intent (sources/graph/products/task-<slug>.json): ids and refs only, never his words. */
export function intentRecord(stored, { date }) {
  return {
    id: intentNodeId(stored.task_id), kind: "Intent", label: `Intent receipt of task ${stored.task_id}`, task_id: stored.task_id,
    root_intent: intentNodeId(stored.root_task), parent_intent: stored.parent_task ? intentNodeId(stored.parent_task) : null, source_refs: stored.sources,
    profile: "private", policy: { visibility: "private", consumers: [], uses: [], publication: "not-authorized" }, state: "proposed",
    proposer: { family: stored.proposer.family, model: stored.proposer.model, ...(stored.proposer.run ? { run: stored.proposer.run } : {}) },
    review_receipts: [], valid_from: date, valid_to: null,
  };
}
