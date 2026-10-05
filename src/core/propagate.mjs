// Propagation (design record: Phases, P6; Risks, noisy invalidation). Keeps the graph and every team surface in step
// as founder decisions, terms, library ideas and product files change. Generic: the caller (the origin adapter) hands
// in what changed, the serving view after the change, the team surfaces as they stand and the projections as they
// would be derived now; this module classes every impact and plans the actions. No repository layout, no data.
//
// Classes (the noise rule): blocking, review-required, inspiration. Only blocking stops a release. Blocking and
// review-required impacts on team files become one action per product per change (a pull request when a generated
// team file changes, else a ticket); inspiration goes into the receipt only. Nothing here opens anything: the loop
// that runs propagate executes the actions and dedupes them against what is already open.
import { canonical, canonicalHash } from "./canonical.mjs";
import { BINDING_SECTIONS, globRegex as globOf } from "./team.mjs";

export const PROPAGATION_SCHEMA = "origin-graph-propagation/v1";
export const CLASSES = ["blocking", "review-required", "inspiration"];
const RANK = { blocking: 0, "review-required": 1, inspiration: 2 };
/** The stronger of two classes (blocking beats review-required beats inspiration); null counts as none. */
export const stronger = (a, b) => (!a ? b : !b ? a : RANK[a] <= RANK[b] ? a : b);
const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const TYPED = ["decision", "term", "definition"];
const TEAM_KINDS = ["product-md", "design-md", "brief", "page-block", "faq", "article", "canon-doc", "contract-test"];

/**
 * What a team reader acts on in a projection payload: everything except the bookkeeping that moves with every
 * regeneration (generation day, revalidation day, source snapshot, policy revision) and the line selectors of claim
 * sources (a claim that only moved inside its file is not news). A change here is a material change.
 */
export function materialPayload(payload) {
  if (!payload) return null;
  const { generated, revalidate_by, source_snapshot, policy_revision, ...rest } = payload;
  return { ...rest, items: (payload.items || []).map((it) => (it.section === "claims" && typeof it.source === "string" ? { ...it, source: it.source.split(" ")[0] } : it)) };
}
export const materialHash = (payload) => (payload ? canonicalHash(materialPayload(payload)) : null);

/** The class a changed section carries: binding rules and checks block; claims, the map and open decisions need review; ideas inspire. */
export function sectionClass(section) {
  if (BINDING_SECTIONS.includes(section) || section === "checks") return "blocking";
  if (section === "ideas") return "inspiration";
  return "review-required";
}

/**
 * The material difference between the projection a team surface carries (before; null when the file is missing) and
 * the one derived now (after; null when the product no longer gets one). Items are compared by handle.
 * Returns { changed, class, added, removed, changed_items, fields } with handles and section names only.
 */
export function projectionDiff(before, after) {
  const out = { changed: false, class: null, added: [], removed: [], changed_items: [], fields: [] };
  if (!before && !after) return out;
  if (!before || !after) { out.changed = true; out.class = "blocking"; out.fields.push(before ? "removed" : "new"); return out; }
  const mb = materialPayload(before); const ma = materialPayload(after);
  if (canonicalHash(mb) === canonicalHash(ma)) return out;
  out.changed = true;
  const { items: ib, inaccessible: xb, ...fb } = mb; const { items: ia, inaccessible: xa, ...fa } = ma;
  for (const k of [...new Set([...Object.keys(fb), ...Object.keys(fa)])].sort()) {
    if (canonical(fb[k] ?? null) === canonical(fa[k] ?? null)) continue;
    out.class = stronger(out.class, "blocking");
    // An object field names the keys that changed (gate_config.projections, paths.story ...), so attribution can tell them apart.
    const ob = fb[k]; const oa = fa[k];
    if (ob && oa && typeof ob === "object" && typeof oa === "object" && !Array.isArray(ob) && !Array.isArray(oa)) { for (const sk of [...new Set([...Object.keys(ob), ...Object.keys(oa)])].sort()) if (canonical(ob[sk] ?? null) !== canonical(oa[sk] ?? null)) out.fields.push(`${k}.${sk}`); }
    else out.fields.push(k);
  }
  if (canonical(xb ?? []) !== canonical(xa ?? [])) { out.fields.push("inaccessible"); out.class = stronger(out.class, "inspiration"); }
  const byB = new Map((ib || []).map((it) => [it.handle, it])); const byA = new Map((ia || []).map((it) => [it.handle, it]));
  for (const [h, it] of byA) {
    const was = byB.get(h);
    if (!was) { out.added.push({ handle: h, section: it.section }); out.class = stronger(out.class, sectionClass(it.section)); }
    else if (canonical(was) !== canonical(it)) { out.changed_items.push({ handle: h, section: it.section }); out.class = stronger(out.class, stronger(sectionClass(it.section), sectionClass(was.section))); }
  }
  for (const [h, it] of byB) if (!byA.has(h)) { out.removed.push({ handle: h, section: it.section }); out.class = stronger(out.class, sectionClass(it.section)); }
  return out;
}

// ---- change detection (pure) -------------------------------------------------------------------------------------

/**
 * Founder anchors that entered the ledger since the base: typed ones (decision, term, definition) are changes that
 * bind; statements and instructions are inspiration. rec(id) returns the current record.
 */
export function anchorChanges({ beforeEntries = [], afterEntries = [], rec }) {
  const seen = new Set(beforeEntries.map((e) => e.anchor));
  const out = [];
  for (const e of afterEntries) {
    if (seen.has(e.anchor)) continue;
    const r = rec(e.anchor);
    const kind = r?.kind === "FounderAnchor" ? (TYPED.includes(r.anchor_kind) ? r.anchor_kind : "statement") : "statement";
    const sup = asList(r?.supersedes);
    out.push({ kind, ref: e.anchor, change: sup.length ? "supersedes" : "new", supersedes: sup, sha256: e.record_sha256 });
  }
  return out;
}

/** New, changed and removed records between two id -> hash maps (concepts, idea edges). kindOf(id) names the change kind. */
export function recordChanges(before, after, kindOf = () => "idea") {
  const out = [];
  for (const [id, h] of after) { const b = before.get(id); if (b === undefined) out.push({ kind: kindOf(id), ref: id, change: "new", sha256: h }); else if (b !== h) out.push({ kind: kindOf(id), ref: id, change: "changed", sha256: h, before_sha256: b }); }
  for (const [id, h] of before) if (!after.has(id)) out.push({ kind: kindOf(id), ref: id, change: "removed", sha256: null, before_sha256: h });
  return out.sort((a, b) => a.ref.localeCompare(b.ref));
}

/**
 * Library items that are new and admitted or adopted, or whose disposition moved to adopted. before/after: Map of
 * "<source>#<item>" -> { disposition, sha256 }.
 */
export function itemChanges(before, after) {
  const out = [];
  for (const [id, it] of after) {
    const b = before.get(id);
    if (!b && ["adopted", "admitted"].includes(it.disposition)) out.push({ kind: "item", ref: id, change: "new", disposition: it.disposition, sha256: it.sha256 });
    else if (b && b.disposition !== "adopted" && it.disposition === "adopted") out.push({ kind: "item", ref: id, change: "adopted", disposition: it.disposition, sha256: it.sha256, before_sha256: b.sha256 });
  }
  return out.sort((a, b) => a.ref.localeCompare(b.ref));
}

const productShape = (p) => canonicalHash({ label: p.label, class: p.class, owned: p.owned ?? null, non_project: !!p.non_project, apps: p.apps || [], relations: p.relations || {} });
/**
 * Product files and the portfolio between two snapshots: artifacts new, changed (sha256) or removed, and products new,
 * removed, mapped (their apps changed) or changed (label, class or relations).
 */
export function snapshotChanges(before, after) {
  const out = [];
  const ba = new Map((before?.artifacts || []).map((a) => [a.id, a])); const aa = new Map((after?.artifacts || []).map((a) => [a.id, a]));
  for (const [id, a] of aa) { const b = ba.get(id); if (!b) out.push({ kind: "artifact", ref: id, change: "new", product: a.product, repo: a.repo, sha256: a.sha256 }); else if (b.sha256 !== a.sha256) out.push({ kind: "artifact", ref: id, change: "changed", product: a.product, repo: a.repo, sha256: a.sha256, before_sha256: b.sha256 }); }
  for (const [id, b] of ba) if (!aa.has(id)) out.push({ kind: "artifact", ref: id, change: "removed", product: b.product, repo: b.repo, sha256: null, before_sha256: b.sha256 });
  const bp = new Map((before?.products || []).map((p) => [p.id, p])); const ap = new Map((after?.products || []).map((p) => [p.id, p]));
  for (const [id, p] of ap) {
    const b = bp.get(id);
    if (!b) { out.push({ kind: "product", ref: `product:${id}`, change: "new", product: id, apps: p.apps || [], sha256: productShape(p) }); continue; }
    if (productShape(b) === productShape(p)) continue;
    const mapped = canonical(b.apps || []) !== canonical(p.apps || []);
    out.push({ kind: "product", ref: `product:${id}`, change: mapped ? "mapped" : "changed", product: id, apps: p.apps || [], before_apps: b.apps || [], sha256: productShape(p), before_sha256: productShape(b) });
  }
  for (const [id, b] of bp) if (!ap.has(id)) out.push({ kind: "product", ref: `product:${id}`, change: "removed", product: id, sha256: null, before_sha256: productShape(b) });
  return out;
}

/** App folders no product of the snapshot lists (each needs a register and catalog row before it gets a projection). */
export function unmappedApps(appDirs, products) {
  const mapped = new Set((products || []).flatMap((p) => p.apps || []));
  return [...new Set(appDirs)].filter((a) => !mapped.has(a)).sort();
}

/** Stable ids for changes (chg:) and actions (act:): 12 hex of the canonical hash of what makes them. */
export const changeId = (c) => `chg:${canonicalHash({ kind: c.kind, ref: c.ref, change: c.change, sha256: c.sha256 ?? null, before_sha256: c.before_sha256 ?? null }).slice(0, 12)}`;

// ---- claims: deterministic re-anchoring ---------------------------------------------------------------------------

const linesOf = (text) => String(text).replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
/**
 * A claim whose artifact changed keeps its reading when the exact lines it was read from are still there: the same
 * number of lines with the same sha256, nearest to where they were. Returns { selector } or null (re-extract).
 * hashLines(lines, s, e) is the artifact adapter's range hash, so selectors stay one definition.
 */
export function reanchorSelector(selector, textSha256, text, hashLines) {
  const m = /^L(\d+)-L(\d+)$/.exec(String(selector));
  if (!m) return null;
  const s0 = Number(m[1]); const len = Number(m[2]) - s0 + 1;
  const lines = linesOf(text);
  let best = null;
  for (let s = 1; s + len - 1 <= lines.length; s += 1) {
    if (hashLines(lines, s, s + len - 1) !== textSha256) continue;
    if (best === null || Math.abs(s - s0) < Math.abs(best - s0)) best = s;
  }
  return best === null ? null : { selector: `L${best}-L${best + len - 1}` };
}

// ---- the plan ----------------------------------------------------------------------------------------------------

/**
 * Plans one propagation run.
 *  changes: [{ kind, ref, change, sha256, before_sha256?, supersedes?, product?, repo? }] (ids are assigned here)
 *  server: the serving server after the change (impactOf, rec, canonFor, products, teamProducts)
 *  canon: the canon file (rules), to tell a phrased anchor from one the team cannot see yet
 *  projections: [{ key, product, exports_before, exports_after, team: payload|null (what the team surface carries),
 *                  derived: payload|null (what it would carry now), basis_after / basis_before: { handle: [refs] } (the
 *                  derived basis, and the committed one as the closest record of what the team file rests on) }]
 *  claimsOf(artifactId): claim ids read from that artifact (before the run), for attribution
 *  staleOf(artifactId): the claim ids that stay stale after re-anchoring (the ones the extraction lane re-reads);
 *                       defaults to claimsOf
 *  teamRepo, parentKey ("parent")
 * Returns { changes, impacts, projections, actions, stops_release, pending_phrasing }.
 */
export function planPropagation({ changes: raw = [], server, canon = {}, projections = [], claimsOf = () => [], staleOf = null, teamRepo, parentKey = "parent", artifactsById = new Map() }) {
  const changes = raw.map((c) => ({ id: changeId(c), ...c }));
  const impacts = [];
  const seen = new Set();
  const add = (chg, d) => { const k = `${chg.id}|${d.kind}|${d.id}`; if (seen.has(k)) return; seen.add(k); impacts.push({ change: chg.id, ...d }); };
  const phrased = (id) => (canon.rules || []).some((r) => (r.basis || []).some((b) => String(b).split("#")[0] === id)) || (canon.checks || []).some((r) => (r.basis || []).some((b) => String(b).split("#")[0] === id));
  const stale = staleOf || claimsOf;
  const pending = [];

  for (const chg of changes) {
    if (TYPED.includes(chg.kind)) {
      const isPhrased = phrased(chg.ref);
      if (!isPhrased) { pending.push(chg.ref); add(chg, { kind: "canon", id: "canon", product: null, class: "review-required", action: "phrase", why: "no team phrasing yet: team surfaces cannot carry it until the canon names it in our words" }); }
      const anchor = server.rec(chg.ref);
      // Which products the anchor binds: a term or decision by its serving scope, a definition by what it defines.
      const binds = (product) => {
        if (!anchor) return false;
        if (anchor.anchor_kind === "definition") return `product:${product}` === anchor.defines || asList(anchor.must_appear).some((m) => m.applies_to?.scope === "all-pages" ? server.familyProducts.has(product) : String(m.applies_to?.target) === `product:${product}`);
        return server.scopeApplies(anchor.scope, { classes: ["story"], products: [product], task: "", repo: teamRepo });
      };
      const held = (canon.rules || []).filter((r) => (r.basis || []).some((b) => String(b).split("#")[0] === chg.ref)).flatMap((r) => r.held_paths || []).map((g) => globOf(g));
      for (const id of [chg.ref, ...asList(chg.supersedes)]) {
        for (const d of server.impactOf(id).dependents) {
          if (d.kind === "projection") continue; // the projection diff below decides, from what the team surface carries
          if (d.kind === "artifact") {
            // A term acts through its retired variants only; a superseded anchor's story files are its successor's
            // business; an unphrased anchor gives the team nothing to review against yet.
            const all = /^story file of/.test(d.why);
            if (all && (!isPhrased || chg.kind === "term" || id !== chg.ref)) continue;
            const a = artifactsById.get(d.id); const product = a?.product ?? null; const team = a?.repo === teamRepo;
            if (!product || !binds(product)) continue; // outside the anchor's scope (an independently governed product)
            const isHeld = team && held.some((re) => re.test(a.path));
            add(chg, { kind: "artifact", id: d.id, product, class: isHeld ? "inspiration" : d.class, action: isHeld ? "receipt-only" : team ? (all ? "team-review-all" : "team-review") : "private-review", why: isHeld ? `${d.why}; a held exception` : d.why });
          } else add(chg, { kind: d.kind, id: d.id, product: d.kind === "product" ? String(d.id).replace(/^product:/, "") : null, class: d.class, action: d.kind === "inference" ? "review-inference" : "receipt-only", why: d.why });
        }
      }
    } else if (chg.kind === "statement" || chg.kind === "item") {
      add(chg, { kind: chg.kind === "item" ? "item" : "anchor", id: chg.ref, product: null, class: "inspiration", action: "receipt-only", why: chg.kind === "item" ? `library item ${chg.change}; a candidate for concept membership` : "a founder statement entered the ledger" });
    } else if (chg.kind === "idea") {
      if (chg.change !== "removed" && server.rec(chg.ref)) for (const d of server.impactOf(chg.ref).dependents) if (d.kind === "product") add(chg, { kind: "product", id: d.id, product: String(d.id).replace(/^product:/, ""), class: "inspiration", action: "receipt-only", why: d.why });
      const e = server.recAny?.(chg.ref);
      if (e && ["candidate_application", "documented_influence"].includes(e.predicate)) add(chg, { kind: "product", id: e.to, product: String(e.to).replace(/^product:/, ""), class: "inspiration", action: "receipt-only", why: e.predicate === "documented_influence" ? "documented influence" : "candidate application" });
    } else if (chg.kind === "artifact") {
      if (chg.change === "new") add(chg, { kind: "artifact", id: chg.ref, product: chg.product, class: "review-required", action: "extract", why: "a new story file: its claims are read by the extraction lane" });
      if (chg.change === "removed") for (const c of claimsOf(chg.ref)) add(chg, { kind: "claim", id: c, product: chg.product, class: "review-required", action: "retire", why: "its artifact is gone" });
      // Only the readings whose lines changed are re-read; the ones re-anchored to their moved lines are counted in the receipt.
      if (chg.change === "changed") for (const c of stale(chg.ref)) add(chg, { kind: "claim", id: c, product: chg.product, class: "review-required", action: "re-extract", why: "its lines changed" });
      if (chg.product) add(chg, { kind: "product", id: `product:${chg.product}`, product: chg.product, class: "inspiration", action: "receipt-only", why: "the artifact tells its story" });
    } else if (chg.kind === "baseline") {
      add(chg, { kind: "baseline", id: "baseline", product: null, class: "review-required", action: "pin-baseline", why: "the founder baseline moved past its last pin: classify its new sentences in the provenance addendum, then pin-baseline and ledger; the anchors that follow propagate on the next run" });
    } else if (chg.kind === "product") {
      add(chg, { kind: "product", id: chg.ref, product: chg.product, class: "inspiration", action: "receipt-only", why: chg.change === "mapped" ? `its apps changed (${asList(chg.before_apps).join(", ") || "none"} -> ${asList(chg.apps).join(", ") || "none"})` : `product ${chg.change}` });
    }
  }

  // Projections: what the team surface carries against what it would carry now. A changed projection is attributed to
  // every change it rests on; one no change explains is drift (the team surface fell behind the store).
  const projOut = [];
  let drift = null;
  for (const p of projections) {
    const diff = projectionDiff(p.team, p.derived);
    const exportsChanged = canonical([...(p.exports_before || [])].sort()) !== canonical([...(p.exports_after || [])].sort());
    if (exportsChanged) { diff.changed = true; diff.class = "blocking"; if (!diff.fields.includes("exports")) diff.fields.push("exports"); }
    const entry = { key: p.key, product: p.product, exports: p.exports_after?.length ? p.exports_after : p.exports_before || [], exports_before: p.exports_before || [], exports_changed: exportsChanged, team_sha256: p.team_sha256 ?? null, material_before: materialHash(p.team), material_after: materialHash(p.derived), ...diff };
    projOut.push(entry);
    if (!diff.changed) continue;
    // Attribution, item by item and field by field: an item changed because a record its basis rests on changed; a
    // field changed because the portfolio, the file set or the canon did. Nothing is credited by mere presence.
    const refsOf = (h) => [...asList(p.basis_after?.[h]), ...asList(p.basis_before?.[h])].map((r) => String(r).split("#")[0]);
    const byRefs = (refs) => changes.filter((c) => c.kind !== "drift" && (refs.includes(c.ref) || asList(c.supersedes).some((x) => refs.includes(x)) || (c.kind === "artifact" && claimsOf(c.ref).some((id) => refs.includes(id)))));
    const canonChanges = changes.filter((c) => c.kind === "canon");
    const typed = changes.filter((c) => TYPED.includes(c.kind));
    const productOf = (key) => changes.filter((c) => c.kind === "product" && (c.product === key || (key === parentKey && ["mapped", "new", "removed"].includes(c.change))));
    const own = new Set();
    for (const it of [...diff.added, ...diff.changed_items, ...diff.removed]) {
      for (const c of byRefs(refsOf(it.handle))) own.add(c);
      if (sectionClass(it.section) === "blocking" || it.section === "open") for (const c of canonChanges) own.add(c);
      if (it.section === "map") for (const c of productOf(p.key)) own.add(c);
      if (it.section === "map" && p.key === parentKey) for (const c of changes.filter((x) => x.kind === "product")) if (refsOf(it.handle).includes(c.ref)) own.add(c);
    }
    const ownerPaths = new Set([...asList(p.team?.gate_config?.doc_owners), ...asList(p.derived?.gate_config?.doc_owners)].map((d) => d.glob));
    for (const f of diff.fields) {
      const top = f.split(".")[0];
      if (["exports", "paths", "new", "removed"].includes(top) || f === "gate_config.projections") for (const c of productOf(p.key)) own.add(c);
      else if (f === "gate_config.doc_owners") { for (const c of changes.filter((x) => x.kind === "artifact" && ["new", "removed"].includes(x.change) && ownerPaths.has(artifactsById.get(x.ref)?.path ?? x.path))) own.add(c); for (const c of canonChanges) own.add(c); }
      else if (f === "inaccessible") { for (const c of typed) own.add(c); for (const c of canonChanges) own.add(c); }
      else { for (const c of productOf(p.key)) own.add(c); for (const c of canonChanges) own.add(c); }
    }
    let owners = [...own];
    if (!owners.length) {
      if (!drift) { drift = { kind: "drift", ref: "team-surface", change: "behind", sha256: null }; drift.id = changeId(drift); changes.push(drift); }
      owners = [drift];
    }
    entry.changes = owners.map((c) => c.id);
    for (const c of owners) add(c, { kind: "projection", id: `projection:context-${p.key}`, product: p.key, class: diff.class, action: diff.class === "inspiration" ? "receipt-only" : "export", why: `${[...diff.fields, ...["added", "removed", "changed_items"].filter((k) => diff[k].length).map((k) => `${diff[k].length} item(s) ${k.replace("_items", "")}`)].join("; ")}` });
  }

  // Actions: one per product per change, never one per file. A product whose projection export set changed carries the
  // parent with it (the parent registers every projection by path, so the two land together).
  const byProduct = new Map();
  const slot = (key) => { if (!byProduct.has(key)) byProduct.set(key, { product: key, impacts: [], exports: [], review_files: [], changes: new Set(), class: null }); return byProduct.get(key); };
  for (const im of impacts) {
    if (im.class === "inspiration") continue;
    if (im.kind === "projection" && im.action === "export") {
      const p = projOut.find((x) => `projection:context-${x.key}` === im.id);
      const s = slot(p.key); s.impacts.push(im); s.changes.add(im.change); s.class = stronger(s.class, im.class);
      for (const e of p.exports) if (!s.exports.includes(e)) s.exports.push(e);
    } else if (im.kind === "artifact" && im.action === "team-review" && im.product) {
      const s = slot(im.product); s.impacts.push(im); s.changes.add(im.change); s.class = stronger(s.class, im.class);
      const path = artifactsById.get(im.id)?.path;
      if (path && !s.review_files.some((f) => f.path === path)) s.review_files.push({ path, class: im.class, why: im.why });
    } else if (im.kind === "artifact" && im.action === "team-review-all" && im.product) {
      // A changed decision or definition: the product's story files are reviewed against it, named once, not file by file.
      const s = slot(im.product); s.impacts.push(im); s.changes.add(im.change); s.class = stronger(s.class, im.class); s.review_all = (s.review_all || 0) + 1;
    }
  }
  // Folding one slot into another keeps everything it carries: impacts, changes, exports and its review files.
  const fold = (lead, o) => {
    for (const im of o.impacts) lead.impacts.push(im);
    for (const c of o.changes) lead.changes.add(c);
    for (const e of o.exports) if (!lead.exports.includes(e)) lead.exports.push(e);
    for (const f of o.review_files) if (!lead.review_files.some((x) => x.path === f.path)) lead.review_files.push(f);
    lead.review_all = (lead.review_all || 0) + (o.review_all || 0);
    lead.class = stronger(lead.class, o.class);
  };
  const moved = projOut.filter((p) => p.exports_changed && p.key !== parentKey).map((p) => p.key).sort();
  if (moved.length && byProduct.has(parentKey)) {
    const lead = slot(moved[0]);
    fold(lead, byProduct.get(parentKey)); lead.with_parent = true; byProduct.delete(parentKey);
    for (const k of moved.slice(1)) { const o = byProduct.get(k); if (!o) continue; fold(lead, o); byProduct.delete(k); (lead.also = lead.also || []).push(k); }
  }
  const actions = [];
  for (const s of [...byProduct.values()].sort((a, b) => a.product.localeCompare(b.product))) {
    const kind = s.exports.length ? "pr" : s.review_files.length || s.review_all ? "ticket" : null;
    if (!kind) continue;
    const changesOf = [...s.changes].sort();
    const body = { product: s.product, kind, changes: changesOf, exports: [...s.exports].sort(), review_files: s.review_files.sort((a, b) => a.path.localeCompare(b.path)), review_story_files: s.review_all || 0, material: projOut.filter((p) => s.exports.some((e) => p.exports.includes(e))).map((p) => p.material_after) };
    actions.push({ id: `act:${canonicalHash(body).slice(0, 12)}`, ...body, class: s.class, repo: teamRepo, with_parent: !!s.with_parent, also: s.also || [], dedupe_key: `ctx-prop:${s.product}` });
  }
  return { changes, impacts, projections: projOut, actions, stops_release: actions.some((a) => a.class === "blocking"), pending_phrasing: [...new Set(pending)].sort() };
}

/**
 * What the extraction lane reads this run: the files whose readings went stale, then the new story files that have
 * no reading yet (the "extract" impacts), each at most once. stale: [{ artifact, claims }]; changes: the plan's changes;
 * hasClaims(id): whether a file has readings.
 */
export function extractionTargets({ stale = [], changes = [], hasClaims = () => false }) {
  const out = stale.map((s) => ({ artifact: s.artifact, claims: s.claims }));
  const seen = new Set(out.map((x) => x.artifact));
  for (const c of changes) if (c.kind === "artifact" && c.change === "new" && !seen.has(c.ref) && !hasClaims(c.ref)) { out.push({ artifact: c.ref, claims: [] }); seen.add(c.ref); }
  return out;
}

/** Seals a receipt: receipt_sha256 is the canonical hash of everything else in it. */
export function sealReceipt(body) {
  const { receipt_sha256, ...rest } = body;
  return { ...rest, receipt_sha256: canonicalHash(rest) };
}
export const receiptOk = (r) => !!r && r.schema === PROPAGATION_SCHEMA && r.receipt_sha256 === canonicalHash(Object.fromEntries(Object.entries(r).filter(([k]) => k !== "receipt_sha256")));

/** Story files of a product the team reviews when a phrased decision or definition changes. */
export const isTeamStoryKind = (kind) => TEAM_KINDS.includes(kind);
