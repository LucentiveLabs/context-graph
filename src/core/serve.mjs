// Serving: context, explain, impact, questions and check (design record: Interfaces; P4). Generic over a "view" the
// adapter builds (graph, serving config, canon phrasing, capture resolution, leak scanner), so the library holds no
// repository layout and no data.
//
// The surface decides the profile. Private (his own lanes in private repositories): binding anchors resolve to their
// captures, except a protected interview anchor, which returns its id and sha256 only. Team (every shared surface,
// including dispatch and review briefs, PR text and logs): projection content only, with opaque ctx: handles.
// Binding constraints (active decisions, terms, definitions and acceptance) come first and are never truncated.
// Truncated, missing and inaccessible items are reported, never dropped silently. Routine code tasks get no library
// bundle (X08); a scope that governs their domain may opt in (routine.keywords), and then they get its binding
// constraints only, under the same profile rules.
import { canonicalHash } from "./canonical.mjs";
import { stringsOf } from "./leak.mjs";
import { coverage as teamCoverage, checkLines, productsForPath as teamProductsForPath, sha256, teamBundle } from "./team.mjs";

export const SERVE = "origin-graph-serve/v1";
const TYPED = ["decision", "term", "definition"];
const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const productLocal = (id) => String(id).replace(/^product:/, "");

/** The two profiles. Private only for an explicit private surface on a private repository; everything else is team. */
export function profileFor(serving, { surface, repo } = {}) {
  return surface === "private" && (serving.private_repos || []).includes(repo) ? "private" : "team";
}

export function makeServer(view) {
  const { graph, serving, canon } = view;
  const nodes = graph.nodes;
  const rec = (id) => nodes.get(id)?.record;
  const allRecords = () => [...nodes.values()].map((n) => n.record);
  const anchors = allRecords().filter((r) => r.kind === "FounderAnchor");
  const superseder = new Map();
  // Only a verified, live successor supersedes: a proposed or unledgered record never removes a binding anchor.
  for (const a of anchors) if (view.verified(a.id) && a.state !== "retired" && a.valid_to == null) for (const s of asList(a.supersedes)) superseder.set(s, a.id);
  const products = new Map((view.snapshot?.products || []).map((p) => [p.id, p]));
  const teamProducts = new Set([...products.values()].filter((p) => p.class !== "private-target").map((p) => p.id));
  // The family: team products that are not independently governed (an independent_of edge to the parent product, or
  // owned false). The parent's canon (family-token scopes, every-page acceptance) binds the family only.
  const PARENT = serving.parent_product; const FAMILY = serving.family_token || "*family"; const TEAM_REPO = serving.team_repo;
  const familyProducts = new Set([...teamProducts].filter((id) => { const p = products.get(id); return p.owned !== false && !(p.relations?.independent_of || []).some((x) => x.to === PARENT); }));

  const isActive = (a) => !superseder.has(a.id) && a.valid_to == null && (a.anchor_kind !== "decision" || a.active !== false) && a.state !== "retired";
  const isFounderPrivate = (a) => a.policy?.visibility === "founder-private";
  /** A record a team item may rest on: present, not founder-private, and a founder anchor only when verified and active. */
  const assertionById = new Map(graph.assertions.map((x) => [x.record.id, x.record]));
  const refEligible = (ref) => {
    const id = String(ref).split("#")[0];
    const e = assertionById.get(id);
    if (e) return e.state !== "retired" && e.policy?.visibility !== "founder-private" && [e.from, e.to].every((x) => nodes.has(x) && !isFounderPrivate(nodes.get(x).record));
    const r = nodes.get(id)?.record; if (!r || isFounderPrivate(r)) return false;
    return r.kind !== "FounderAnchor" || (view.verified(r.id) && isActive(r));
  };

  // ---- task classes and products ------------------------------------------------------------------------------
  const classRes = Object.fromEntries(Object.entries(serving.task_classes || {}).map(([k, v]) => [k, new RegExp(v, "i")]));
  const aliasRes = Object.entries(serving.product_aliases || {}).map(([p, list]) => [p, list.map((a) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(a)}(?![\\p{L}\\p{N}])`, a === a.toUpperCase() || /[A-Z].*[A-Z]/.test(a) ? "u" : "iu"))]);

  function productsOfPath(rel) {
    if (!rel) return [];
    const clean = String(rel).replace(/^[a-z0-9-]+:/, "");
    const art = (view.snapshot?.artifacts || []).find((a) => a.path === clean);
    if (art) return [art.product];
    for (const p of serving.gate?.pillar_products || []) {
      for (const g of serving.gate?.pillar_paths || []) if (view.glob(g.replaceAll("{p}", p)).test(clean)) return [p];
    }
    const app = /^apps\/([^/]+)/.exec(clean)?.[1];
    if (!app) return [];
    // The app's primary owner (the product that lists it first), the parent for the shared app, else none: snapshot
    // order never decides.
    const owners = [...products.values()].filter((p) => (p.apps || []).includes(`apps/${app}`));
    const primary = owners.filter((p) => p.apps[0] === `apps/${app}`);
    if (primary.length === 1) return [primary[0].id];
    if (`apps/${app}` === serving.gate?.shared_app && products.has(PARENT)) return [PARENT];
    return owners.length === 1 ? [owners[0].id] : [];
  }
  function classify(task, { kind, artifact } = {}) {
    if (kind) return asList(kind);
    const t = String(task || "");
    const hit = (k) => !!classRes[k]?.test(t);
    // A routine code task (fix, refactor, backend ...) with no story word gets no bundle, whatever else it names (X08).
    if (hit("routine") && !hit("story")) return ["routine"];
    const out = ["story", "governance", "library"].filter(hit);
    if (!out.length && artifact && productsOfPath(artifact).length && view.isStoryPath(artifact)) out.push("story");
    if (!out.length && !hit("routine") && inferProducts(t).length) out.push("story");
    return out.length ? out : ["routine"];
  }
  function inferProducts(task) {
    const out = [];
    for (const [p, res] of aliasRes) if (res.some((re) => re.test(String(task || "")))) out.push(p);
    return out;
  }
  function productsFor(req) {
    const set = new Set();
    for (const p of asList(req.product)) set.add(productLocal(p));
    for (const p of productsOfPath(req.artifact)) set.add(p);
    if (!req.product) for (const p of inferProducts(req.task)) set.add(p);
    // A story task in a team repository that names no product is about that repository's own site (the default product).
    const dflt = serving.default_story_product?.[req.repo];
    if (!set.size && dflt && req.classes?.includes("story")) set.add(dflt);
    return [...set].filter((p) => products.has(p)).sort();
  }

  // ---- what binds a request ------------------------------------------------------------------------------------
  function scopeApplies(scope, req) {
    const s = serving.scopes?.[scope];
    if (!s) return false;
    if (!s.tasks.some((t) => req.classes.includes(t))) return false;
    const byProduct = s.products === "*" ? true : s.products === FAMILY ? (req.products.length ? req.products.some((p) => familyProducts.has(p)) : !(serving.private_repos || []).includes(req.repo)) : Array.isArray(s.products) ? s.products.some((p) => req.products.includes(p)) : null;
    const byKeyword = s.keywords ? new RegExp(s.keywords, "i").test(String(req.task || "")) : null;
    if (byProduct === null && byKeyword === null) return true;
    return !!(byProduct || byKeyword);
  }
  const mustAppearApplies = (m, req) => {
    const a = m.applies_to || {};
    if (a.scope === "all-pages") return req.classes.includes("story") && (req.products.some((p) => familyProducts.has(p)) || !req.products.length);
    if (a.scope === "product") return req.classes.includes("story") && req.products.includes(productLocal(a.target));
    if (a.scope === "artifact") return req.artifact && String(a.target).endsWith(String(req.artifact).replace(/^[a-z0-9-]+:/, ""));
    return false;
  };
  /**
   * The scoped constraints of a routine code task. X08 keeps library material (claims, ideas, readings, questions)
   * out of code work, not the founder's binding decisions about the task's own domain. A scope opts in with
   * routine.keywords: the words that put a code task in its domain, narrower than its keywords because code tasks use
   * words like data, model or review generically. Only that pattern counts for a routine task: a product it names, or
   * a scope without the field, never binds it. A typed anchor enters through its scope (a definition only if it ever
   * carries one).
   */
  function routineApplies(a, req) {
    const words = a.scope ? serving.scopes?.[a.scope]?.routine?.keywords : null;
    return !!words && new RegExp(words, "i").test(String(req.task || ""));
  }
  function anchorApplies(a, req) {
    if (req.classes.includes("routine") && routineApplies(a, req)) return true;
    if (a.anchor_kind === "definition") return req.classes.some((c) => c === "story" || c === "governance") && (req.products.includes(productLocal(a.defines)) || asList(a.must_appear).some((m) => mustAppearApplies(m, req)));
    if (a.anchor_kind === "term" || a.anchor_kind === "decision") return scopeApplies(a.scope, req);
    return false;
  }
  /** Binding anchors of a request (active and superseded apart), with the acceptance entries that apply. */
  // An anchor the capture loop proposed binds nothing, on any surface, until promote accepts it on two reviews.
  const pendingReview = (a) => a.state === "proposed" && /^capture-loop-/.test(String(a.proposer?.run || "")) && !view.verified(a.id);
  function binding(req) {
    const active = []; const superseded = []; const acceptance = [];
    for (const a of anchors) {
      if (!TYPED.includes(a.anchor_kind) || !anchorApplies(a, req) || pendingReview(a)) continue;
      if (!isActive(a)) { superseded.push({ id: a.id, label: a.label, superseded_by: superseder.get(a.id) || null }); continue; }
      active.push(a);
      for (const m of asList(a.must_appear)) if (mustAppearApplies(m, req)) acceptance.push({ anchor: a.id, entry: m });
    }
    const order = { term: 0, definition: 1, decision: 2 };
    active.sort((x, y) => order[x.anchor_kind] - order[y.anchor_kind] || x.id.localeCompare(y.id));
    return { active, superseded, acceptance };
  }

  // ---- shared non-binding material -----------------------------------------------------------------------------
  const facetRank = (f) => { const i = (serving.claim_facets || []).indexOf(f); return i < 0 ? 99 : i; };
  /**
   * A product's claims, at most limit: by facet rank, and within a facet round-robin across artifacts (each artifact's
   * first claim, then each one's second ...), so one long document never crowds out the product's other sources.
   */
  function claimsFor(product, limit = serving.claims_per_product || 24) {
    const pid = `product:${product}`;
    const all = allRecords().filter((r) => r.kind === "Claim" && asList(r.about).includes(pid) && r.state !== "retired" && String(r.artifact).startsWith(`artifact:${TEAM_REPO}/`));
    const tiers = (serving.claim_authority?.tiers || []).map((globs) => globs.map((g) => view.glob(g)));
    const tierOf = (c) => { const rel = String(c.artifact).slice(`artifact:${TEAM_REPO}/`.length); const i = tiers.findIndex((res) => res.some((re) => re.test(rel))); return i < 0 ? tiers.length : i; };
    const out = [];
    const groups = new Map();
    for (const c of all) { const k = `${String(tierOf(c)).padStart(3, "0")}|${String(facetRank(c.facet)).padStart(3, "0")}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
    for (const k of [...groups.keys()].sort()) {
      const byArtifact = new Map();
      for (const c of groups.get(k).sort((a, b) => a.id.localeCompare(b.id))) { if (!byArtifact.has(c.artifact)) byArtifact.set(c.artifact, []); byArtifact.get(c.artifact).push(c); }
      const lists = [...byArtifact.keys()].sort().map((a) => byArtifact.get(a));
      for (let i = 0; lists.some((l) => l.length > i); i += 1) for (const l of lists) if (l[i]) out.push(l[i]);
    }
    return out.slice(0, limit);
  }
  function ideasFor(product, limit = Infinity) {
    const pid = `product:${product}`;
    const edges = graph.assertions.map((x) => x.record).filter((e) => e.to === pid && ["candidate_application", "documented_influence"].includes(e.predicate) && rec(e.from)?.kind === "Concept" && isActive(rec(e.from)) && e.state !== "retired");
    const seen = new Set();
    return edges.sort((a, b) => (b.predicate === "documented_influence") - (a.predicate === "documented_influence") || b.confidence - a.confidence || a.from.localeCompare(b.from)).filter((e) => { if (seen.has(e.from)) return false; seen.add(e.from); return true; }).slice(0, limit).map((e) => ({ edge: e, concept: rec(e.from) }));
  }
  const canonRules = canon.rules || [];
  const ruleBasis = (r) => r.basis.map((b) => b.split("#")[0]);
  const ruleVerified = (r) => ruleBasis(r).every((id) => (rec(id)?.kind === "FounderAnchor" ? view.verified(id) && isActive(rec(id)) : rec(id)?.kind === "Inference"));
  function canonFor(a) { return canonRules.filter((r) => ruleBasis(r).includes(a.id) && r.section !== "acceptance"); }
  function canonForMust(anchorId, mustId) { return canonRules.find((r) => r.section === "acceptance" && r.basis.includes(`${anchorId}#${mustId}`)); }
  function flaggedFor(req) {
    return allRecords().filter((r) => r.kind === "Inference" && r.agent_guess === true).filter((r) => {
      if (req.classes.includes("governance")) return true;
      return req.products.some((p) => (serving.product_aliases?.[p] || []).some((al) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(al)}(?![\\p{L}\\p{N}])`, "iu").test(`${r.statement || ""} ${r.label || ""}`)));
    });
  }
  const readingsFor = (ids) => allRecords().filter((r) => r.kind === "Inference" && r.agent_guess !== true && !r.located_in && asList(r.derived_from).some((d) => ids.has(d)));

  // ---- context -------------------------------------------------------------------------------------------------
  function context(req0) {
    const profile = profileFor(serving, req0);
    const classes = classify(req0.task, { kind: req0.kind, artifact: req0.artifact });
    const req = { ...req0, classes, products: productsFor({ ...req0, classes }) };
    const budget = Number(req0.budget) > 0 ? Number(req0.budget) : serving.budget_bytes || 12288;
    const base = { profile, classes, products: req.products, snapshot: view.revision };
    const named = asList(req0.product).map(productLocal).filter((p) => !products.has(p));
    if (classes.length === 1 && classes[0] === "routine") {
      // A routine code task gets no library bundle (X08). When a scope that governs its domain opts in, it gets that
      // scope's binding constraints only (the scoped block); a pure code task with no governed domain gets nothing.
      const B = binding(req);
      if (!B.active.length) return { ...base, applies: false, reason: "routine code task: no library bundle (X08)" };
      return profile === "team" ? teamScoped(req, base, budget, named, B) : privateContext(req, base, budget, named, B);
    }
    return profile === "team" ? teamContext(req, base, budget, named) : privateContext(req, base, budget, named);
  }

  /**
   * The scoped block of a routine task on a team surface: projection content only, as every team bundle. It carries the
   * binding items of the committed projections that rest on a matched, servable anchor (one per canon rule, the parent's
   * first), by their ctx: handles and team phrasing. A matched anchor with no such item (unphrased, founder-private or
   * not verified) is counted in the report, never named: no id, no scope, no capture.
   */
  function teamScoped(req, base, budget, named, B) {
    const keys = [...view.projections.keys()].sort((x, y) => (y === "parent") - (x === "parent") || x.localeCompare(y));
    const items = []; const seen = new Set(); const used = new Set(); const stale = new Set(); let unserved = 0;
    for (const a of B.active) {
      let found = false;
      if (!isFounderPrivate(a) && refEligible(a.id)) {
        for (const key of keys) {
          const pj = view.projections.get(key);
          for (const it of pj.payload.items) {
            if (!it.binding || it.section === "acceptance") continue;
            const b = pj.basis?.items?.[it.handle];
            if (!b || !b.refs.some((r) => String(r).split("#")[0] === a.id) || !b.refs.every(refEligible)) continue;
            found = true; used.add(key); if (pj.stale) stale.add(key);
            const k = `${it.section}\n${it.text}`; if (seen.has(k)) continue;
            seen.add(k); items.push(it);
          }
        }
      }
      if (!found) unserved += 1;
    }
    const missing = [...named.map((p) => `product ${p} is not in the graph`), ...[...stale].sort().map((key) => `projection for ${key === "parent" ? "the parent" : key} is stale: a record it rests on changed since it was generated; regenerate it`)];
    const inaccessible = unserved ? [`${unserved} binding constraint(s) govern this task's domain with no team phrasing (or founder-private): served in the private profile only`] : [];
    const L = ["# Scoped constraints (team profile)", `classes: ${req.classes.join(", ")}; products: ${req.products.length ? req.products.join(", ") : "none named"}`, "A routine code task gets no library bundle (X08). These are the binding constraints whose scope governs its domain; ctx: handles are opaque, and the founder's lane resolves them.", "", "## Binding constraints (never truncated)"];
    const titles = { terms: "Terms (canon rules)", definitions: "Definitions", decisions: "Decisions" };
    for (const s of ["terms", "definitions", "decisions"]) { const list = items.filter((it) => it.section === s); if (list.length) L.push(`### ${titles[s]}`, ...list.map((it) => `- [${it.handle}] ${it.text}`)); }
    if (!items.length) L.push("- none servable on a team surface (see the report)");
    L.push("", "## Report", "- truncated: none", `- missing: ${missing.length ? missing.join("; ") : "none"}`, `- inaccessible: ${inaccessible.length ? inaccessible.join("; ") : "none"}`);
    const text = `${L.join("\n")}\n`;
    const hits = view.scanner().scan(text, { surface: "team" });
    if (hits.length) return { ...base, applies: true, ok: false, scoped: true, error: `leak scanner refused the team scoped block: ${hits.map((h) => h.id).join(", ")}` };
    const handles = items.map((it) => it.handle);
    return { ...base, applies: true, ok: true, scoped: true, bundle_sha256: sha256(text), bytes: Buffer.byteLength(text, "utf8"), budget, text, binding: handles, included: handles, report: { truncated: [], missing, inaccessible }, projections: [...used].sort().map((key) => ({ product: key, handle: view.projections.get(key).payload.projection, payload_sha256: view.projections.get(key).payload_sha256 })) };
  }

  function teamContext(req, base, budget, named) {
    const family = !req.products.length || req.products.some((p) => familyProducts.has(p));
    const want = [...(family ? ["parent"] : []), ...req.products.filter((p) => teamProducts.has(p))];
    const payloads = []; const missing = [...named.map((p) => `product ${p} is not in the graph`)];
    for (const key of want) {
      const pj = view.projections.get(key);
      if (!pj) { missing.push(`no team projection for ${key === "parent" ? "the parent" : key}`); continue; }
      // Every request re-checks every item: an item whose records are no longer servable (founder-private now,
      // unverified, superseded or gone) is withheld and reported, whether or not the projection's hashes moved.
      const keep = (it) => { const b = pj.basis?.items?.[it.handle]; return !!b && b.refs.every(refEligible); };
      const dropped = pj.payload.items.filter((it) => !keep(it)).length;
      if (pj.stale || dropped) missing.push(`projection for ${key === "parent" ? "the parent" : key} is stale: a record it rests on changed since it was generated; regenerate it${dropped ? ` (${dropped} item(s) withheld until then)` : ""}`);
      payloads.push(dropped ? { ...pj.payload, items: pj.payload.items.filter(keep) } : pj.payload);
    }
    for (const p of req.products.filter((x) => !teamProducts.has(x))) missing.push(`product ${p} is private; it has no team projection`);
    const b = teamBundle(payloads, { task: req.task || "", products: req.products, classes: req.classes, budget, missing });
    if (!req.classes.includes("story") && req.classes.includes("governance")) b.report.inaccessible.push("governance decisions are served in the private profile only");
    const hits = view.scanner().scan(b.text, { surface: "team" });
    if (hits.length) return { ...base, applies: true, ok: false, error: `leak scanner refused the team bundle: ${hits.map((h) => h.id).join(", ")}` };
    return { ...base, applies: true, ok: true, bundle_sha256: b.sha256, bytes: b.bytes, budget, overBudget: b.bytes > budget, requiredBytes: b.requiredBytes, selectionAlgorithm: b.selectionAlgorithm, text: b.text, binding: b.binding.map((it) => it.handle), included: b.items.map((it) => it.handle), report: b.report, projections: payloads.map((p) => ({ product: p.scope === "parent" ? "parent" : p.product, handle: p.projection, payload_sha256: view.projections.get(p.scope === "parent" ? "parent" : p.product).payload_sha256 })) };
  }

  function captureLine(a) {
    const c = view.captureText(a);
    if (c.status === "pinned") return `capture ${c.id || a.capture?.id} sha256 ${c.sha256} (id and hash only; its wording never leaves its capture)`;
    if (c.status !== "ok") return `capture ${c.status}${c.reason ? `: ${c.reason}` : ""}`;
    return `his words (${c.where}${c.whole ? ", whole capture: the paste is not split per statement" : ""}):\n  > ${c.text.replace(/\s*\n\s*/g, " ").trim()}`;
  }
  /** The private bundle; with scoped (a routine task's binding), the scoped block: binding constraints and the superseded list only. */
  function privateContext(req, base, budget, named, scoped = null) {
    const B = scoped || binding(req);
    const missing = named.map((p) => `product ${p} is not in the graph`);
    // The bundle text holds no checkout revision, so the same records give the same bundle on any clean or dirty checkout.
    const L = [scoped ? "# Scoped constraints (private profile)" : "# Context bundle (private profile)", `classes: ${req.classes.join(", ")}; products: ${req.products.join(", ") || "none named"}`, ...(scoped ? ["A routine code task gets no library bundle (X08). These are the binding constraints whose scope governs its domain."] : []), "", "## Binding constraints (never truncated)"];
    const titles = { term: "Terms", definition: "Definitions", decision: "Decisions" };
    for (const k of ["term", "definition", "decision"]) {
      const list = B.active.filter((a) => a.anchor_kind === k);
      if (!list.length) continue;
      L.push(`### ${titles[k]}`);
      for (const a of list) {
        const meta = k === "term" ? `preferred ${a.preferred}${asList(a.deprecated).length ? `; deprecated ${asList(a.deprecated).join(", ")}` : ""}` : k === "definition" ? `defines ${a.defines}` : `scope ${a.scope}`;
        L.push(`- ${a.id} (${a.label}; ${meta}${view.verified(a.id) ? "; verified" : "; not ledgered"}${isFounderPrivate(a) ? "; founder-private" : ""}) ${captureLine(a)}`);
      }
    }
    if (B.acceptance.length) {
      L.push("### Acceptance (must appear)");
      for (const { anchor, entry: m } of B.acceptance) L.push(`- ${anchor}#${m.id}: ${m.label}; ${m.requirement}${m.subject ? ` ${m.subject}` : ""}${m.text_sha256 ? ` (words by sha256 ${m.text_sha256.slice(0, 12)})` : ""}; applies to ${m.applies_to.scope}${m.applies_to.target ? ` ${m.applies_to.target}` : ""}${m.applies_to.page ? ` (${m.applies_to.page})` : ""}`);
    }
    let text = `${L.join("\n")}\n`;
    const bindingIds = new Set([...B.active.map((a) => a.id)]);
    const extra = [];
    const readings = scoped ? [] : readingsFor(bindingIds);
    if (readings.length) extra.push(["Agent readings of these anchors (derived, not his words)", readings.map((r) => [r.id, `- ${r.id} (from ${asList(r.derived_from).join(", ")}): ${r.statement || r.label}`])]);
    const flagged = scoped ? [] : flaggedFor(req);
    if (flagged.length) extra.push(["Agent rules with no founder source (never apply them as restrictions)", flagged.map((r) => [r.id, `- ${r.id}: ${r.statement || r.label}`])]);
    if (B.superseded.length) extra.push(["Superseded, not binding", B.superseded.map((s) => [s.id, `- ${s.id} (${s.label})${s.superseded_by ? ` superseded by ${s.superseded_by}` : " inactive"}`])]);
    if (req.classes.includes("story")) {
      for (const p of req.products) {
        const cl = claimsFor(p);
        if (cl.length) extra.push([`Claims of ${p} (our own docs, paraphrased)`, cl.map((c) => [c.id, `- ${c.id} [${c.facet}] ${c.label} (${String(c.artifact).replace(/^artifact:/, "")} ${c.selector})`])]);
        const ideas = ideasFor(p);
        if (ideas.length) extra.push([`Library ideas for ${p} (${ideas.some((x) => x.edge.predicate === "documented_influence") ? "documented influence first, then " : ""}candidate applications)`, ideas.map(({ edge, concept }) => [concept.id, `- ${concept.id} [${edge.predicate}, confidence ${edge.confidence}] ${concept.label}: ${concept.definition}`])]);
      }
      const open = (canon.open || []).filter((o) => (o.products || []).some((p) => req.products.includes(p)));
      if (open.length) extra.push(["Open decisions", open.map((o) => [o.id, `- ${o.id}: ${o.text}`])]);
    }
    if (req.classes.includes("library")) {
      const qs = allRecords().filter((r) => r.kind === "Question" && r.question_status === "open");
      if (qs.length) extra.push(["Open library questions", qs.map((q) => [q.id, `- ${q.id}: ${q.label}`])]);
    }
    const rows = extra.flatMap(([title, list]) => list.map(([id, row]) => ({ title, id, row })));
    const render = (n) => { let t = text; let last = null; for (const r of rows.slice(0, n)) { if (r.title !== last) { t += `\n## ${r.title}\n`; last = r.title; } t += `${r.row}\n`; } return t; };
    const tail = (n) => Buffer.byteLength(`\n## Report\n- truncated: ${rows.slice(n).map((r) => r.id).join(", ")}\n- missing: ${missing.join("; ")}\n- inaccessible: interview anchors return id and sha256 only\n`, "utf8");
    let kept = rows.length;
    if (Buffer.byteLength(render(kept), "utf8") + tail(kept) > budget) { let lo = 0; let hi = rows.length; while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (Buffer.byteLength(render(mid), "utf8") + tail(mid) <= budget) lo = mid; else hi = mid - 1; } kept = lo; }
    text = render(kept);
    const included = rows.slice(0, kept).map((r) => r.id); const truncated = rows.slice(kept).map((r) => r.id);
    const inaccessible = [];
    if (B.active.some((a) => a.capture?.class === "interview")) inaccessible.push("interview anchors return id and sha256 only");
    text += `\n## Report\n- truncated: ${truncated.length ? `${truncated.length} item(s): ${truncated.join(", ")}` : "none"}\n- missing: ${missing.length ? missing.join("; ") : "none"}\n- inaccessible: ${inaccessible.length ? inaccessible.join("; ") : "none"}\n`;
    const hits = view.scanner().scan(text, { surface: "private" });
    if (hits.length) return { ...base, applies: true, ok: false, ...(scoped ? { scoped: true } : {}), error: `leak scanner refused the private bundle: ${hits.map((h) => h.id).join(", ")}` };
    return { ...base, applies: true, ok: true, ...(scoped ? { scoped: true } : {}), bundle_sha256: sha256(text), bytes: Buffer.byteLength(text, "utf8"), budget, text, binding: [...bindingIds, ...B.acceptance.map((x) => `${x.anchor}#${x.entry.id}`)], included, report: { truncated, missing, inaccessible }, superseded: B.superseded.map((s) => s.id) };
  }

  // ---- explain -------------------------------------------------------------------------------------------------
  function resolveHandle(h) {
    for (const [key, pj] of view.projections) { const b = pj.basis?.items?.[h]; if (b) return { projection: key, ...b }; if (pj.payload?.projection === h) return { projection: key, refs: [`projection:context-${key}`] }; }
    // An intent card's handles (P5): its root and parent intents and the sources of his request and corrections.
    const i = view.intentHandles?.get(h);
    return i ? { intent: i.kind, refs: i.refs } : null;
  }
  const allow = new Set(graph.table.query_allowlist || []);
  function explain(id, { surface, repo } = {}) {
    if (profileFor(serving, { surface, repo }) !== "private") return { ok: false, error: "explain runs in the private profile only (a private surface in a private repository)" };
    let target = id; let via = null;
    if (/^ctx:[a-f0-9]{8}$/.test(String(id))) { via = resolveHandle(id); if (!via) return { ok: false, error: `unknown handle ${id}` }; target = via.refs[0]; }
    const r = rec(target);
    if (!r) return { ok: false, error: `unknown node ${target}` };
    const out = { ok: true, id: target, ...(via ? { handle: id, ...(via.projection ? { projection: via.projection } : { intent_handle: via.intent }), refs: via.refs } : {}), kind: r.kind, label: r.label ?? null, state: r.state, profile: r.profile, policy: r.policy, origin: nodes.get(target).origin };
    if (r.kind === "FounderAnchor") {
      out.anchor_kind = r.anchor_kind; out.capture = r.capture;
      const c = view.captureText(r);
      out.provenance = c.status === "pinned" ? { status: "pinned", id: c.id || r.capture?.id, sha256: c.sha256, note: "id and sha256 only; protected interview wording never leaves its capture" } : c.status === "ok" ? { status: "ok", where: c.where, text: c.text, whole: !!c.whole } : { status: c.status, reason: c.reason || null };
      const le = (graph.ledger?.data?.entries || []).find((e) => e.anchor === target);
      out.ledger = le ? { seq: le.seq, accepted_at: le.accepted_at } : null;
      out.verified = view.verified(target); out.active = isActive(r);
      out.superseded_by = superseder.get(target) || null; out.supersedes = asList(r.supersedes);
      for (const k of ["scope", "defines", "preferred", "deprecated", "must_appear", "active"]) if (r[k] !== undefined) out[k] = r[k];
      out.applies_to_scope = r.scope ? serving.scopes?.[r.scope] || "no serving scope (served nowhere)" : null;
      out.team_phrasing = canonFor(r).map((x) => ({ rule: x.id, section: x.section, text: x.text }));
    }
    if (r.kind === "Inference") { out.statement = r.statement || null; out.derived_from = asList(r.derived_from); out.agent_guess = !!r.agent_guess; out.located_in = r.located_in || null; }
    if (r.kind === "Claim") { out.artifact = r.artifact; out.selector = r.selector; out.facet = r.facet; out.about = asList(r.about); }
    if (r.kind === "Concept") { out.definition = r.definition; out.excludes = r.excludes; out.examples = asList(r.examples).length; }
    if (r.kind === "Product") { out.product_class = r.product_class; out.relations = r.relations; }
    if (r.kind === "Intent") { out.task_id = r.task_id; out.root_intent = r.root_intent; out.parent_intent = r.parent_intent; out.source_refs = asList(r.source_refs); }
    const edges = graph.assertions.map((x) => x.record).filter((e) => (e.from === target || e.to === target) && allow.has(e.predicate));
    out.edges = edges.map((e) => ({ predicate: e.predicate, direction: e.from === target ? "out" : "in", other: e.from === target ? e.to : e.from, state: e.state, confidence: e.confidence })).slice(0, 60);
    out.edges_total = edges.length;
    out.in_projections = [...view.projections].flatMap(([key, pj]) => Object.entries(pj.basis?.items || {}).filter(([, b]) => b.refs.includes(target)).map(([h]) => ({ projection: key, handle: h })));
    const imp = impactOf(target);
    out.why = `${out.in_projections.length} team projection item(s) carry it; ${imp.dependents.length} dependent(s) (${["blocking", "review-required", "inspiration"].map((c) => `${imp.dependents.filter((d) => d.class === c).length} ${c}`).join(", ")})`;
    const hits = stringsOf(out).flatMap(({ text }) => view.scanner().scan(text, { surface: "private" }));
    if (hits.length) return { ok: false, error: `leak scanner refused the explain result: ${hits.map((h) => h.id).join(", ")}` };
    return out;
  }

  // ---- impact --------------------------------------------------------------------------------------------------
  /** impact names records, artifacts and projections by private id: private profile only. */
  function impact(change, { surface, repo } = {}) {
    if (profileFor(serving, { surface, repo }) !== "private") return { ok: false, error: "impact runs in the private profile only (a private surface in a private repository)" };
    return { ok: true, ...impactOf(change) };
  }
  function impactOf(change) {
    let ids = [];
    if (/^ctx:[a-f0-9]{8}$/.test(String(change))) ids = resolveHandle(change)?.refs || [];
    else if (rec(change)) ids = [change];
    else {
      const clean = String(change).replace(new RegExp(`^${TEAM_REPO}:`), "");
      const art = (view.snapshot?.artifacts || []).find((a) => a.path === clean);
      if (art) ids = [art.id];
      else ids = productsOfPath(clean).map((p) => `product:${p}`);
    }
    const dependents = []; const seen = new Set();
    const add = (d) => { const k = `${d.kind}|${d.id}`; if (seen.has(k)) return; seen.add(k); dependents.push(d); };
    const projOf = (id) => [...view.projections].filter(([, pj]) => Object.values(pj.basis?.items || {}).some((b) => b.refs.includes(id))).map(([key]) => key);
    const blockingProducts = new Set(serving.gate?.blocking_products || []);
    for (const id of ids) {
      const r = rec(id); if (!r) continue;
      for (const key of projOf(id)) add({ kind: "projection", id: `projection:context-${key}`, class: "blocking", why: `its payload carries ${id}; regenerate and re-export it, and the gate re-validates receipts against the new hash` });
      if (r.kind === "FounderAnchor") {
        if (superseder.has(id)) add({ kind: "anchor", id: superseder.get(id), class: "inspiration", why: "supersedes it" });
        for (const inf of allRecords().filter((x) => x.kind === "Inference" && asList(x.derived_from).includes(id))) add({ kind: "inference", id: inf.id, class: "review-required", why: "derived from it" });
        const prods = r.defines ? [productLocal(r.defines)] : r.scope && serving.scopes?.[r.scope] ? (Array.isArray(serving.scopes[r.scope].products) ? serving.scopes[r.scope].products : [...teamProducts]) : [];
        for (const m of asList(r.must_appear)) if (m.applies_to?.target) prods.push(productLocal(m.applies_to.target));
        const deprecated = canonFor(r).flatMap((x) => x.deprecated || []);
        for (const a of view.snapshot?.artifacts || []) {
          if (a.repo !== TEAM_REPO) continue;
          if (deprecated.length) {
            const n = view.occurrences ? view.occurrences(a, deprecated) : null;
            if (n) add({ kind: "artifact", id: a.id, class: blockingProducts.has(a.product) ? "blocking" : "review-required", why: `${n} occurrence(s) of a deprecated variant` });
          } else if (prods.includes(a.product) && ["product-md", "brief", "page-block", "faq", "article", "contract-test"].includes(a.kind)) add({ kind: "artifact", id: a.id, class: "review-required", why: `story file of ${a.product}` });
        }
      }
      if (r.kind === "Artifact") {
        for (const c of allRecords().filter((x) => x.kind === "Claim" && x.artifact === id)) { add({ kind: "claim", id: c.id, class: "review-required", why: "re-extract: its artifact changed" }); for (const key of projOf(c.id)) add({ kind: "projection", id: `projection:context-${key}`, class: "blocking", why: `carries claim ${c.id}` }); }
        if (r.product) add({ kind: "product", id: r.product, class: "inspiration", why: "the artifact tells its story" });
      }
      if (r.kind === "Concept") for (const e of graph.assertions.map((x) => x.record).filter((e) => e.from === id && e.predicate === "candidate_application")) add({ kind: "product", id: e.to, class: "inspiration", why: "candidate application" });
      if (r.kind === "Product") {
        for (const a of (view.snapshot?.artifacts || []).filter((x) => `product:${x.product}` === id)) add({ kind: "artifact", id: a.id, class: "review-required", why: "story file of the product" });
        for (const e of graph.assertions.map((x) => x.record).filter((e) => e.to === id && ["depends_on", "belongs_to", "powers", "productizes"].includes(e.predicate) && rec(e.from)?.kind === "Product")) add({ kind: "product", id: e.from, class: "inspiration", why: `${e.predicate} it` });
      }
    }
    return { change, resolved: ids, dependents, receipts: "context receipts live in the team repository; its gate re-validates each one against the regenerated CONTEXT.md hash" };
  }

  // ---- questions -----------------------------------------------------------------------------------------------
  function questions(scope0 = "all", { surface, repo } = {}) {
    const profile = profileFor(serving, { surface, repo });
    // The scope is a known name or a known product id; anything else is refused, never echoed.
    const named = ["all", "library", "founder"].includes(scope0);
    const scope = named || products.has(productLocal(scope0)) ? (named ? scope0 : productLocal(scope0)) : null;
    if (!scope) return { profile, scope: null, questions: [], error: "unknown scope: use all, library, founder or a product id" };
    const p = named ? null : scope;
    const out = [];
    if (profile === "team") {
      // Team questions come from the committed projections only, item by item still servable, and leave only when
      // every string passes the team leak scan.
      for (const [key, pj] of view.projections) {
        if (p && key !== p) continue;
        for (const it of pj.payload.items.filter((x) => x.section === "open")) { const b = pj.basis?.items?.[it.handle]; if (b && b.refs.every(refEligible) && !out.some((q) => q.text === it.text)) out.push({ kind: "open-decision", handle: it.handle, text: it.text }); }
      }
      const result = { profile, scope, questions: out };
      const hits = stringsOf(result).flatMap(({ text }) => view.scanner().scan(text, { surface: "team" }));
      return hits.length ? { profile, scope: null, questions: [], error: `leak scanner refused the team questions: ${hits.map((h) => h.id).join(", ")}` } : result;
    }
    for (const o of canon.open || []) if (!p || (o.products || []).includes(p)) out.push({ kind: "open-decision", text: o.text, id: o.id, basis: o.basis });
    if (profile === "private") {
      if (scope === "all" || scope === "library") for (const q of allRecords().filter((r) => r.kind === "Question" && r.question_status === "open")) out.push({ kind: "library", id: q.id, text: q.label });
      if (scope === "all" || scope === "founder" || p) {
        for (const r of allRecords().filter((x) => x.kind === "Inference" && x.agent_guess === true)) {
          if (p && !(serving.product_aliases?.[p] || []).some((al) => new RegExp(`(?<![\\p{L}\\p{N}])${esc(al)}(?![\\p{L}\\p{N}])`, "iu").test(r.statement || ""))) continue;
          out.push({ kind: "agent-rule", id: r.id, text: `An agent wrote this rule with no founder source: ${r.statement || r.label}. Keep it as a rule, or drop it?` });
        }
        const cands = allRecords().filter((r) => r.kind === "CandidateStatement" && ["unverified", "excerpt", "pasted"].includes(r.verification) && ["decision", "term", "definition"].includes(r.would_be));
        if (!p && cands.length) out.push({ kind: "unverified", text: `${cands.length} reported decisions, terms or definitions are not verified against his typed words; the founder-layer report lists the ten most consequential.` });
      }
    }
    return { profile, scope, questions: out };
  }

  // ---- check ---------------------------------------------------------------------------------------------------
  /** check over added lines (and coverage over page files) with the rules of fresh payloads; candidate drift apart. */
  /**
   * lines: the changed lines to check; changed: every path the change touches (deletions included), so coverage runs
   * even when a change only deletes; products: the products a caller names for lines no projection claims.
   */
  function check({ lines = [], products: wantProducts = null, coverage = false, files = new Map(), changed = null } = {}, { surface, repo } = {}) {
    const profile = profileFor(serving, { surface, repo });
    const payloads = view.freshPayloads();
    const findings = checkLines(payloads, { lines }, { lockedPaths: serving.gate?.locked_files || [], products: wantProducts || [] });
    // Candidate drift: canon rules whose anchors are not verified, and lexicon terms no verified rule covers.
    const candidates = [];
    const covered = new Set(canonRules.filter((r) => r.section === "terms" && ruleVerified(r)).flatMap((r) => (r.deprecated || []).map((d) => d.text.toLowerCase())));
    for (const r of canonRules.filter((x) => x.section === "terms" && !ruleVerified(x))) for (const d of r.deprecated || []) for (const l of lines) if (new RegExp(d.re, d.flags || "").test(l.text)) candidates.push({ kind: "candidate-drift", rule: profile === "private" ? r.id : "an unverified term", path: l.path, line: l.line, found: d.text, note: "its founder anchor is not verified: reported to the conductor, never opened as a change (X03)" });
    for (const t of view.lexicon?.terms || []) {
      const variants = String(t.deprecated).split(/[,;]\s*/).map((s) => s.replace(/\s*\(.*\)$/, "").toLowerCase());
      if (variants.every((v) => covered.has(v))) continue;
      for (const pat of t.patterns || []) for (const l of lines) {
        const m = new RegExp(pat.re, pat.flags || "").exec(l.text);
        if (m && !findings.some((f) => f.path === l.path && f.line === l.line && String(f.found).toLowerCase() === m[0].toLowerCase())) candidates.push({ kind: "candidate-drift", rule: profile === "private" ? `lexicon ${t.id}` : "a candidate term", path: l.path, line: l.line, found: m[0], note: "no verified anchor: reported, never opened as a change (X03)" });
      }
    }
    const seenC = new Set();
    const uniqueCandidates = candidates.filter((c) => { const k = `${c.path}|${c.line}|${String(c.found).toLowerCase()}`; if (seenC.has(k)) return false; seenC.add(k); return true; });
    candidates.length = 0; candidates.push(...uniqueCandidates);
    const paths = [...new Set([...(changed || []), ...lines.map((l) => l.path)])];
    const touched = [...new Set([...(wantProducts || []), ...paths.flatMap((rel) => teamProductsForPath(payloads, rel))])].sort();
    const cov = coverage ? teamCoverage(payloads, { products: touched, files, neverPages: serving.gate?.never_pages || [], changed: changed ? paths : null }) : [];
    const mapRule = (h) => (profile === "private" ? view.handleRefs(h) || h : h);
    const shown = findings.map((f) => ({ ...f, rule: mapRule(f.rule) }));
    // Claims outside a product's definition are not decided by patterns: each touched product's definition is listed as
    // unresolved, for the story review seat that receives the bundle, so a clean check never reads as definition-clean.
    const unresolved = touched.flatMap((product) => payloads.filter((x) => x.scope !== "parent" && x.product === product).flatMap((x) => x.items.filter((it) => it.section === "definitions").map((it) => ({ kind: "definition-review", product, rule: mapRule(it.handle), text: it.text }))));
    const result = { profile, ok: !shown.some((f) => f.kind !== "held") && cov.every((c) => c.ok), complete: unresolved.length === 0, findings: shown, candidates, coverage: cov.map((c) => ({ ...c, rule: c.rule ? mapRule(c.rule) : c.rule })), unresolved, definition_scope: "claims outside a product's definition are judged by the story review seat with the bundle injected; unresolved lists what it must judge" };
    if (profile === "team") {
      // A team answer echoes caller paths and text: it leaves only when the whole answer passes the team leak scan.
      const hits = stringsOf(result).flatMap(({ text }) => view.scanner().scan(text, { surface: "team" }));
      if (hits.length) return { profile, ok: false, error: `leak scanner refused the team check result: ${hits.map((h) => h.id).join(", ")}`, findings: [], candidates: [], coverage: [] };
    }
    return result;
  }

  const recAny = (id) => rec(id) || assertionById.get(id) || null;
  return { recAny, refEligible, classify, productsFor, productsOfPath, binding, context, explain, impact, impactOf, questions, check, claimsFor, ideasFor, canonFor, canonForMust, ruleVerified, isActive, isFounderPrivate, flaggedFor, teamProducts, familyProducts, products, anchors, superseder, rec, scopeApplies, mustAppearApplies };
}

/** A stable short hash of any JSON value. */
export const shortHash = (value, n = 12) => canonicalHash(value).slice(0, n);
