// Edges a stored record carries in its own fields (an inference's derived_from, an anchor's supersedes and defines,
// a claim's artifact and the products it is about, a projection's product, a product's relations, a concept's
// examples). They share the owning record's state, policy, profile and review, and are validated like every other
// assertion. Generic.

const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
/** [field path, predicate, direction]: "out" runs owner -> value, "in" runs value -> owner. */
export const FIELD_EDGES = {
  Inference: [["derived_from", "derived_from", "out"]],
  FounderAnchor: [["supersedes", "supersedes", "out"], ["defines", "defines", "out"]],
  Concept: [["examples", "expresses", "in"]],
  Product: [["relations.powers", "powers", "out"], ["relations.belongs_to", "belongs_to", "out"], ["relations.productizes", "productizes", "out"], ["relations.depends_on", "depends_on", "out"], ["relations.independent_of", "independent_of", "out"]],
  Claim: [["artifact", "contains_claim", "in"], ["about", "depends_on", "out"]],
  Projection: [["product", "exported_as", "in"]],
};
const at = (obj, dotted) => dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

export function fieldEdges(rec) {
  const out = [];
  for (const [field, predicate, dir] of FIELD_EDGES[rec.kind] || []) {
    for (const value of asList(at(rec, field))) {
      if (typeof value !== "string") continue;
      const [from, to] = dir === "out" ? [rec.id, value] : [value, rec.id];
      out.push({
        kind: "Assertion", id: `field:${from}|${predicate}|${to}`, from, predicate, to, scope: "record-field",
        rationale: `the ${field} field of ${rec.id}`, evidence_refs: [], proposer: rec.proposer, confidence: 1,
        state: rec.state, review_receipts: [], policy: rec.policy, binds: {}, valid_from: rec.valid_from, valid_to: rec.valid_to ?? null, profile: rec.profile,
      });
    }
  }
  return out;
}
