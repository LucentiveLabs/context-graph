// The predicate table: which node kinds a predicate may join, and which two-hop chains imply a relation.
// Trust never grows by traversal: a composed path takes the lower confidence, the weaker state, the most
// restricted profile and the intersection of both policies. Generic: the table is data (predicates.json).

/**
 * The v1 query allowlist of the design record (Ontology v1), plus the product relations of Ontology v1 that P3 turns
 * into predicates (powers, belongs_to, productizes, independent_of); the table must name exactly these.
 */
export const ONTOLOGY_V1_ALLOWLIST = ["derived_from", "supersedes", "defines", "uses_term", "deprecates", "depends_on", "contains_claim", "aligns_with", "documented_influence", "candidate_application", "powers", "belongs_to", "productizes", "independent_of"];
/**
 * Trust order of each record enum, weakest (most restricted) first. Composition reads these constants, never the
 * table, so a reordered table can never make a path claim a stronger state or a wider audience than its weakest edge.
 */
export const TRUST_ORDER = Object.freeze({
  state: Object.freeze(["retired", "contested", "proposed", "accepted"]),
  visibility: Object.freeze(["founder-private", "private", "team", "public"]),
  publication: Object.freeze(["do-not-publish", "not-authorized", "team-continuity-exists", "authorized"]),
  profile: Object.freeze(["private", "team"]),
});
const ANCHOR = "FounderAnchor";
const same = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
const sameOrder = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

/** Problems of the table itself, checked against the node kinds, the assertion predicate enum and the record enums. */
export function tableProblems(table, { kinds, predicates, states, visibilities, publications, profiles }) {
  const P = []; const names = Object.keys(table?.predicates || {});
  if (!same(names, predicates)) P.push(`predicates.json names [${names.join(", ")}] but the assertion schema allows [${predicates.join(", ")}]`);
  if (!same(table.query_allowlist, ONTOLOGY_V1_ALLOWLIST)) P.push(`predicates.json query_allowlist must be the Ontology v1 allowlist: ${ONTOLOGY_V1_ALLOWLIST.join(", ")}`);
  for (const n of table.never_compose || []) if (!names.includes(n)) P.push(`predicates.json never_compose names unknown predicate ${n}`);
  const enums = { state: states, visibility: visibilities, publication: publications, profile: profiles };
  for (const [k, values] of Object.entries(enums)) {
    if (!same(TRUST_ORDER[k], values)) P.push(`trust order ${k} does not cover the schema enum (${values.join(", ")})`);
    if (!sameOrder(table.order?.[k], TRUST_ORDER[k])) P.push(`predicates.json order.${k} must be exactly ${TRUST_ORDER[k].join(", ")}, in this order (weakest first)`);
  }
  for (const [name, p] of Object.entries(table.predicates || {})) {
    for (const [i, pair] of (p.pairs || []).entries()) for (const k of [...pair.from, ...pair.to]) if (!kinds.includes(k)) P.push(`predicate ${name} pair ${i + 1}: unknown node kind ${k}`);
    for (const k of p.evidence_kinds || []) if (!kinds.includes(k)) P.push(`predicate ${name}: unknown evidence kind ${k}`);
    if (p.evidence_kinds?.includes("Artifact") && !(p.evidence_artifact_kinds || []).length) P.push(`predicate ${name}: an Artifact counts as evidence only for named evidence_artifact_kinds`);
    for (const [then, implies] of Object.entries(p.compose || {})) {
      for (const x of [name, then, implies]) {
        if (!table.query_allowlist?.includes(x)) P.push(`predicate ${name} compose ${then} -> ${implies}: ${x} is not an allowlisted query predicate`);
        if ((table.never_compose || []).includes(x)) P.push(`predicate ${name} compose ${then} -> ${implies}: ${x} never composes (alignment and influence chains are discovery hints only)`);
      }
    }
  }
  return P;
}

const kindOk = (list, anchorKinds, node) => list.includes(node.kind) && (node.kind !== ANCHOR || !anchorKinds || anchorKinds.includes(node.anchor_kind));
/** null when the predicate may join from and to; otherwise the reason it may not. */
export function pairProblem(table, predicate, from, to) {
  const p = table.predicates?.[predicate];
  if (!p) return `unknown predicate ${predicate}`;
  if (p.same_kind && from.kind !== to.kind) return `${predicate} joins two nodes of the same kind (${from.kind} -> ${to.kind})`;
  const ok = p.pairs.some((pair) => kindOk(pair.from, pair.from_anchor_kinds, from) && kindOk(pair.to, pair.to_anchor_kinds, to));
  const ak = (n) => (n.kind === ANCHOR ? `/${n.anchor_kind}` : "");
  return ok ? null : `${predicate} may not join ${from.kind}${ak(from)} -> ${to.kind}${ak(to)}`;
}

// An unknown value ranks below every known one, so it can only make a path weaker.
const rank = (order, value) => { const i = order.indexOf(value); return i < 0 ? -1 : i; };
const weakest = (order, values) => values.reduce((a, b) => (rank(order, b) < rank(order, a) ? b : a));
/** The policy every one of the policies allows: most restricted visibility and publication, shared consumers and uses. */
export function intersectPolicies(policies) {
  const inter = (lists) => lists.reduce((a, b) => a.filter((x) => b.includes(x)));
  return {
    visibility: weakest(TRUST_ORDER.visibility, policies.map((p) => p.visibility)),
    consumers: inter(policies.map((p) => p.consumers || [])).sort(),
    uses: inter(policies.map((p) => p.uses || [])).sort(),
    publication: weakest(TRUST_ORDER.publication, policies.map((p) => p.publication)),
  };
}
/** What a chain of edges may claim at most: never more trust than its weakest edge. */
export function combineTrust(edges) {
  return {
    confidence: Math.min(...edges.map((e) => e.confidence)),
    state: weakest(TRUST_ORDER.state, edges.map((e) => e.state)),
    profile: weakest(TRUST_ORDER.profile, edges.map((e) => e.profile)),
    policy: intersectPolicies(edges.map((e) => e.policy)),
  };
}
/**
 * The relation a forward chain first -> second implies, or null for a discovery hint. Only the first predicate's
 * compose entry decides; a chain through a never_compose predicate implies nothing.
 */
export function composeChain(table, first, second) {
  if ((table.never_compose || []).includes(first) || (table.never_compose || []).includes(second)) return null;
  return table.predicates?.[first]?.compose?.[second] ?? null;
}
