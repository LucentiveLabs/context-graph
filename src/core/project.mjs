// Team projections (design record: Projections and privacy). One CONTEXT.md per product a team repository serves,
// plus the parent: meaning and relations, active terms as canon rules, definitions phrased as canon, decisions,
// acceptance, check rules, claim constraints, open decisions and library ideas in our words with sources unnamed.
// Every item carries an opaque projection-scoped ctx: handle; the private basis file maps each handle to the records
// it rests on and their hashes, so a changed record marks the projection stale. Every payload passes the leak scanner
// before it is written. Generic over the server and view.
import { createHmac } from "node:crypto";
import { canonical, canonicalHash } from "./canonical.mjs";
import { BINDING_SECTIONS, MACHINE_FENCE, PAYLOAD_SCHEMA, SECTION_TITLES, sha256 } from "./team.mjs";
import { scanMarkdown, stringsOf } from "./leak.mjs";

export const PROJECTION = "origin-graph-projection/v1";
const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const addDays = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** An opaque handle, scoped to its projection: ctx: plus 8 hex of an HMAC under the private salt. */
export const ctxHandle = (salt, scope, key) => `ctx:${createHmac("sha256", salt).update(`${scope}\n${key}`).digest("hex").slice(0, 8)}`;

/**
 * The globs of a product in the team repository: story (prose files that always count as story work), pages (page
 * code whose prose changes count), entries (page entry files: a route's page, a site HTML page), landing (the entries
 * of its landing page) and read (what the gate loads to follow a page's imports). A pillar served from the shared app
 * is specific: its globs win over the shared app's own product.
 */
export function productPaths(serving, product) {
  const gate = serving.gate || {};
  const app = (globs, a) => (globs || []).filter((g) => g.startsWith("apps/*/")).map((g) => g.replace("apps/*/", `${a}/`));
  if ((gate.pillar_products || []).includes(product.id)) {
    const sub = (globs) => (globs || []).map((x) => x.replaceAll("{p}", product.id));
    const own = (product.apps || []).filter((a) => a !== gate.shared_app);
    return {
      story: [...sub(gate.pillar_story), ...own.flatMap((a) => app(gate.story_paths, a))],
      pages: [...sub(gate.pillar_paths), ...own.flatMap((a) => app(gate.page_paths, a))],
      entries: [...sub(gate.pillar_entries), ...own.flatMap((a) => app(gate.page_entries, a))],
      landing: [...sub(gate.pillar_landing), ...own.flatMap((a) => app(gate.landing_entries, a))],
      read: [...app(gate.page_paths, gate.shared_app), ...own.flatMap((a) => app(gate.page_paths, a))],
      specific: true,
    };
  }
  const apps = product.apps || [];
  return {
    story: apps.flatMap((a) => app(gate.story_paths, a)), pages: apps.flatMap((a) => app(gate.page_paths, a)),
    entries: apps.flatMap((a) => app(gate.page_entries, a)), landing: apps.flatMap((a) => app(gate.landing_entries, a)),
    read: apps.flatMap((a) => app(gate.page_paths, a)), specific: false,
  };
}

const RELATION_TEXT = { belongs_to: "belongs to", depends_on: "depends on", independent_of: "is independent of", powers: "powers", productizes: "productizes" };

/**
 * The payload and basis of one projection. key: "parent" or a product id. date: the generation day (YYYY-MM-DD).
 * Returns { payload, basis, inaccessible } where basis maps every handle to { key, refs, hashes }.
 */
export function buildPayload(view, server, key, { date }) {
  const { serving, canon } = view;
  const parent = key === "parent";
  const PARENT = serving.parent_product; const FAMILY = serving.family_token || "*family"; const TEAM_REPO = serving.team_repo;
  const product = parent ? server.products.get(PARENT) : server.products.get(key);
  if (!product) throw new Error(`no product ${key}`);
  const scope = parent ? "parent" : product.id;
  const req = { classes: ["story"], products: parent ? [] : [product.id], task: "", repo: TEAM_REPO };
  const B = server.binding(req);
  const items = []; const basis = {}; const counts = new Map();
  const miss = (reason) => counts.set(reason, (counts.get(reason) || 0) + 1);
  const recHash = (ref) => { const r = server.recAny(String(ref).split("#")[0]); return r ? canonicalHash(r) : null; };
  const add = (itemKey, section, text, refs, extra = {}) => {
    const handle = ctxHandle(view.salt, scope, `${section}:${itemKey}`);
    if (basis[handle]) return;
    // Every record an item rests on must be servable on a team surface: no founder-private record, and every founder
    // anchor verified and active. Checked for every section, maps, checks and open decisions included.
    if (!refs.every((r) => server.refEligible(r))) { miss("item(s) resting on a founder-private, unverified or superseded record, served in the private profile only"); return; }
    items.push({ handle, section, binding: BINDING_SECTIONS.includes(section), text, ...extra });
    basis[handle] = { key: `${section}:${itemKey}`, refs, hashes: Object.fromEntries(refs.map((r) => [r, recHash(r)])) };
  };
  const ruleExtra = (r) => {
    if (r.section === "terms") return { preferred: r.preferred || [], deprecated: r.deprecated || [], exceptions: r.exceptions || [], ...(r.held_paths ? { held_paths: r.held_paths, held_reason: r.held_reason } : {}) };
    return {};
  };
  const seenRules = new Set();
  for (const a of B.active) {
    if (server.isFounderPrivate(a)) { miss("founder-private constraint(s), served in the private profile only"); continue; }
    const rules = server.canonFor(a);
    if (!rules.length) { if (a.anchor_kind !== "decision" || serving.scopes?.[a.scope]?.tasks?.includes("story")) miss("binding constraint(s) without team phrasing yet"); continue; }
    for (const r of rules) {
      if (seenRules.has(r.id)) continue; seenRules.add(r.id);
      if (!server.ruleVerified(r)) { miss("constraint(s) whose founder anchor is not verified"); continue; }
      if (r.products && !parent && !r.products.includes(product.id) && !(r.products.includes(FAMILY) && server.familyProducts.has(product.id))) continue;
      add(r.id, r.section, r.text, r.basis.map((b) => b.split("#")[0]), ruleExtra(r));
    }
  }
  for (const { anchor, entry } of B.acceptance) {
    const a = server.rec(anchor);
    if (server.isFounderPrivate(a)) { miss("founder-private constraint(s), served in the private profile only"); continue; }
    const r = server.canonForMust(anchor, entry.id);
    if (!r) { miss("acceptance item(s) without team phrasing yet"); continue; }
    if (!server.ruleVerified(r)) { miss("constraint(s) whose founder anchor is not verified"); continue; }
    const applies = entry.applies_to.scope === "all-pages" ? { scope: "all-pages" } : { scope: "product", product: String(entry.applies_to.target).replace(/^product:/, ""), ...(entry.applies_to.page ? { page: entry.applies_to.page } : {}) };
    const extra = { requirement: r.requirement, applies_to: applies };
    if (r.requirement === "topic") extra.aliases = r.aliases;
    if (r.requirement === "absence") extra.patterns = serving.absence_patterns?.[r.absence] || [];
    if (r.requirement === "phrases") extra.phrases = r.phrases;
    add(r.id, "acceptance", r.text, [`${anchor}#${entry.id}`], extra);
  }
  for (const c of canon.checks || []) {
    const ok = parent ? (c.products || []).includes(FAMILY) : (c.products || []).includes(product.id) || ((c.products || []).includes(FAMILY) && server.familyProducts.has(product.id));
    if (!ok) continue;
    if (!server.ruleVerified(c)) { miss("check rule(s) whose founder anchor is not verified"); continue; }
    add(c.id, "checks", c.text, c.basis.map((b) => b.split("#")[0]), { kind: c.kind, patterns: c.patterns });
  }
  for (const o of canon.open || []) if ((o.products || []).includes(parent ? PARENT : product.id)) add(o.id, "open", o.text, o.basis);
  if (parent) {
    for (const p of [...server.products.values()].filter((x) => server.teamProducts.has(x.id) && x.id !== PARENT).sort((x, y) => x.id.localeCompare(y.id))) {
      const def = (canon.rules || []).find((r) => r.section === "definitions" && (r.products || []).includes(p.id) && server.ruleVerified(r));
      const rel = Object.entries(p.relations || {}).flatMap(([k, list]) => list.map((x) => `${RELATION_TEXT[k] || k} ${server.products.get(x.to)?.label || x.to}`));
      const first = def ? def.text.split(/(?<=\.)\s/)[0] : null;
      add(`portfolio:${p.id}`, "map", `${p.label} (${p.class})${rel.length ? `; ${rel.join("; ")}` : ""}${first ? `. ${first}` : "."}`, [`product:${p.id}`, ...(def ? def.basis.map((b) => b.split("#")[0]) : [])], { about: p.id });
    }
    // The parent's own claims: what the team canon states about the parent and every page (definitions, then
    // constraints and terms).
    const parentClaims = server.claimsFor(PARENT, 1000);
    for (const c of parentClaims.filter((x) => ["definition", "constraint", "term"].includes(x.facet)).slice(0, serving.parent_claims || 40)) add(c.id.replace(/^claim:/, ""), "claims", c.label, [c.id], { facet: c.facet, source: `${String(c.artifact).replace(`artifact:${TEAM_REPO}/`, "")} ${c.selector}` });
  } else {
    const rel = Object.entries(product.relations || {}).flatMap(([k, list]) => list.map((x) => ({ k, to: x.to })));
    for (const { k, to } of rel) add(`relation:${k}:${to}`, "map", `${product.label} ${RELATION_TEXT[k] || k} ${server.products.get(to)?.label || to}.`, [`product:${product.id}`]);
    for (const c of server.claimsFor(product.id)) add(c.id.replace(/^claim:/, ""), "claims", c.label, [c.id], { facet: c.facet, source: `${String(c.artifact).replace(`artifact:${TEAM_REPO}/`, "")} ${c.selector}` });
    for (const { edge, concept } of server.ideasFor(product.id)) add(concept.id.replace(/^concept:/, ""), "ideas", `${concept.label}: ${concept.definition}`, [concept.id, edge.id], { relation: edge.predicate === "documented_influence" ? "documented influence" : "candidate application" });
  }
  const order = ["map", ...BINDING_SECTIONS, "checks", "claims", "open", "ideas"];
  items.sort((x, y) => order.indexOf(x.section) - order.indexOf(y.section));
  const gate = serving.gate || {};
  const advisoryUntil = addDays(gate.start || date, gate.advisory_days || 14);
  const inaccessible = [...counts].map(([reason, count]) => ({ reason, count }));
  const payload = {
    schema: PAYLOAD_SCHEMA,
    projection: ctxHandle(view.salt, "projection", scope),
    scope: parent ? "parent" : "product",
    product: product.id,
    label: product.label,
    class: product.class,
    family: parent || server.familyProducts.has(product.id),
    generated: date,
    revalidate_by: addDays(date, 30),
    policy_revision: view.policyRevision,
    source_snapshot: null,
    gate: parent ? { mode: "advisory", advisory_until: advisoryUntil } : (gate.blocking_products || []).includes(product.id) ? { mode: "blocking" } : { mode: "advisory", advisory_until: advisoryUntil },
    ...(parent ? { gate_config: gateConfig(view, server, advisoryUntil) } : { paths: productPaths(serving, product) }),
    items,
    inaccessible,
  };
  // The snapshot slice this projection rests on, not the whole snapshot: a product's own register row and story files
  // (by id and sha256), or for the parent every product's row. A file of another product changing leaves it alone, so
  // a refresh regenerates only the projections it touches (P6).
  const snapProducts = view.snapshot?.products || [];
  const shape = (p) => ({ id: p.id, label: p.label, class: p.class, owned: p.owned ?? null, apps: p.apps || [], relations: p.relations || {} });
  const slice = !view.snapshot ? "none" : parent ? snapProducts.map(shape) : { product: shape(snapProducts.find((p) => p.id === product.id) || product), artifacts: (view.snapshot.artifacts || []).filter((a) => a.product === product.id).map((a) => [a.id, a.sha256 ?? null]).sort((x, y) => (x[0] < y[0] ? -1 : 1)) };
  payload.source_snapshot = `basis:${canonicalHash(Object.fromEntries(Object.entries(basis).map(([h, b]) => [h, b.hashes]))).slice(0, 12)};products:${slice === "none" ? "none" : canonicalHash(slice).slice(0, 12)}`;
  return { payload, basis };
}

/**
 * The parent's gate configuration: story paths, what never counts, locked files, the blocking set, the advisory date,
 * which product owns a doc outside the apps (the snapshot's artifacts, then the fallbacks), and the registry of every
 * projection by path, handle and product, so a deleted or damaged projection fails closed.
 */
function gateConfig(view, server, advisoryUntil) {
  const gate = view.serving.gate || {}; const PARENT = view.serving.parent_product;
  const docOwners = (view.snapshot?.artifacts || []).filter((a) => a.repo === view.serving.team_repo && /^docs\//.test(a.path) && server.teamProducts.has(a.product)).map((a) => ({ glob: a.path, product: a.product }))
    .sort((x, y) => x.glob.localeCompare(y.glob));
  for (const f of gate.doc_fallbacks || []) docOwners.push({ glob: f.glob, product: f.product === "$parent" ? PARENT : f.product });
  const projections = [];
  for (const [key, paths] of view.exports || []) for (const rel of paths) projections.push({ path: rel, handle: ctxHandle(view.salt, "projection", key === "parent" ? "parent" : key), product: key === "parent" ? PARENT : key });
  return {
    story_paths: gate.story_paths || [], never_story: gate.never_story || [], never_pages: gate.never_pages || [], locked_files: gate.locked_files || [],
    blocking_products: gate.blocking_products || [], advisory_until: advisoryUntil, doc_owners: docOwners, projections: projections.sort((x, y) => x.path.localeCompare(y.path)),
  };
}

const TITLES = { map: "Meaning and relations", ...SECTION_TITLES };
/** CONTEXT.md: the prose a person or agent reads, then the same payload as a machine block the gate reads. */
export function renderContextMd(payload) {
  const L = [];
  const what = payload.scope === "parent" ? "the parent and the whole portfolio" : payload.label;
  L.push("<!-- Generated from the private context store by the context graph. Do not edit by hand: changes come from regenerating it. -->");
  L.push(`# ${payload.label}: context`, "");
  L.push(`Team projection ${payload.projection} for ${what}. Read it before writing or reviewing story work for ${payload.scope === "parent" ? "any product of the family" : "this product"}: PRODUCT.md, DESIGN.md, copy briefs, page copy, FAQs, articles and brand docs. Binding rules come first. Handles (ctx:...) are opaque references; the founder's lane resolves them.`, "");
  L.push(`Generated ${payload.generated}; revalidate by ${payload.revalidate_by}. Policy ${payload.policy_revision}. Snapshot ${payload.source_snapshot}.`);
  L.push(payload.gate.mode === "blocking" ? "Delivery gate: blocking. A story change needs a fresh .context-receipt.json, a clean check and full coverage." : `Delivery gate: advisory until ${payload.gate.advisory_until}, blocking after. A story change needs a fresh .context-receipt.json, a clean check and full coverage.`, "");
  for (const s of ["map", ...BINDING_SECTIONS, "checks", "claims", "open", "ideas"]) {
    const list = payload.items.filter((it) => it.section === s);
    if (!list.length) continue;
    L.push(`## ${TITLES[s]}${BINDING_SECTIONS.includes(s) ? " (binding)" : ""}`, "");
    for (const it of list) {
      let extra = "";
      if (s === "terms" && it.deprecated?.length) extra = ` Retired: ${it.deprecated.map((d) => d.text).join(", ")}.${it.held_paths?.length ? ` Held, not drift: ${it.held_paths.join(", ")} (${it.held_reason}).` : ""}`;
      if (s === "acceptance") extra = ` Applies to ${it.applies_to.scope === "all-pages" ? "every page" : `${it.applies_to.product} ${it.applies_to.page || "pages"}`}.`;
      if (s === "claims") extra = ` (${it.facet}; ${it.source})`;
      if (s === "ideas") extra = ` (${it.relation})`;
      L.push(`- [${it.handle}] ${it.text}${extra}`);
    }
    L.push("");
  }
  if (payload.inaccessible.length) { L.push("## Not served here", "", ...payload.inaccessible.map((x) => `- ${x.count} ${x.reason}.`), ""); }
  L.push("## Machine-readable rules", "", `\`\`\`json ${MACHINE_FENCE}`, JSON.stringify(payload, null, 2), "```", "");
  return L.join("\n");
}

/** Leak-scans a payload (string by string) and its rendering; [] when both pass on a team surface. */
export function projectionLeaks(scanner, payload, md) {
  const hits = [];
  for (const { at, text } of stringsOf(payload)) {
    if (/^\$\.items\[\d+\]\.(?:deprecated|patterns)\[\d+\]\.re$/.test(at) || /\.(?:story|pages|landing|story_paths|never_pages|locked_files|held_paths)\[\d+\]$/.test(at)) continue;
    for (const h of scanner.scan(text, { surface: "team" })) hits.push({ ...h, at });
  }
  for (const h of scanMarkdown(scanner, md, { surface: "team" })) hits.push({ ...h, at: "CONTEXT.md" });
  return hits;
}

/** The Projection record bound to a rendered CONTEXT.md. */
export function projectionRecord({ key, payload, md, proposer, date, consumer }) {
  return {
    id: `projection:context-${key}`, kind: "Projection", label: `${payload.label}${payload.scope === "parent" ? " parent" : ""} team context`.slice(0, 200),
    consumer: `consumer:${consumer}`, product: `product:${payload.product}`, handle: payload.projection, payload_sha256: sha256(md),
    policy_revision: payload.policy_revision, source_snapshot: payload.source_snapshot, revalidate_by: payload.revalidate_by,
    profile: "private", policy: { visibility: "team", consumers: [consumer], uses: [], publication: "not-authorized" },
    state: "proposed", proposer, review_receipts: [], valid_from: date, valid_to: null,
  };
}
export const recordText = (r) => `${JSON.stringify(JSON.parse(canonical(r)), null, 2)}\n`;
