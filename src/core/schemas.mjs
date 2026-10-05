// Ajv (JSON Schema 2020-12) for the graph schemas. Generic: the caller hands in the parsed schema files.
import Ajv2020 from "ajv/dist/2020.js";

export const GRAPH_SCHEMA_NAMES = ["common", "node", "assertion", "ledger", "predicates", "baseline", "baseline-provenance"];
export const schemaUrn = (name) => `urn:origin:graph:schema:${name}`;

/**
 * Compiles the five graph schemas. strictRequired and strictTypes stay off because conditional subschemas
 * (if/then) name required keys without restating their types; every other strict check (unknown keywords,
 * ignored keywords, number limits, tuples) stays on.
 */
export function compileSchemas(raw) {
  const missing = GRAPH_SCHEMA_NAMES.filter((n) => !raw?.[n]);
  if (missing.length) throw new Error(`graph schemas missing: ${missing.join(", ")}`);
  // The five P1 schemas plus the pinned-baseline manifest (P2) and its provenance addendum.
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false, discriminator: true, allowUnionTypes: true });
  for (const n of GRAPH_SCHEMA_NAMES) ajv.addSchema(raw[n]);
  const get = (n) => { const v = ajv.getSchema(schemaUrn(n)); if (!v) throw new Error(`graph schema ${n} has no $id ${schemaUrn(n)}`); return v; };
  return { raw, node: get("node"), assertion: get("assertion"), ledger: get("ledger"), predicates: get("predicates"), baseline: get("baseline"), baselineProvenance: get("baseline-provenance") };
}

/** Readable problems of one validation, or [] when it passes. */
export function schemaErrors(validate, value) {
  if (validate(value)) return [];
  return (validate.errors || []).map((e) => {
    const extra = e.params?.unevaluatedProperty ?? e.params?.additionalProperty;
    const where = e.instancePath || "/";
    return `${where} ${e.message}${extra ? ` (${extra})` : ""}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(", ")})` : ""}`;
  });
}

/** The node kinds the node schema allows, and the predicates the assertion schema allows. */
export const nodeKinds = (raw) => raw.node?.properties?.kind?.enum || [];
export const predicateEnum = (raw) => raw.assertion?.properties?.predicate?.enum || [];
