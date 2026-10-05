// query --from <id> --via <predicate,...> --hops <1|2>: the maintenance query of the design record (Interfaces).
// It returns the nodes and edges reached over allowlisted predicates, in either direction, with each edge's state,
// confidence and policy. A two-hop path implies a relation only for a forward chain the composition table lists;
// every other path is a discovery hint. Trust never grows: an implied relation carries the lower confidence, the
// weaker state, the more restricted profile and the intersection of both policies. Generic.
import { combineTrust, composeChain, pairProblem } from "./predicates.mjs";

export class QueryError extends Error {
  constructor(message, code = 2) { super(message); this.code = code; }
}

export function parseQueryArgs(table, { from, via, hops }) {
  const max = table.max_hops;
  const h = typeof hops === "number" ? hops : /^\d+$/.test(String(hops ?? "")) ? Number(hops) : NaN;
  if (!(Number.isInteger(h) && h >= 1 && h <= max)) throw new QueryError(`--hops must be 1 or ${max}; free traversal is out of scope for v1 (got ${hops ?? "nothing"})`);
  if (typeof from !== "string" || !from) throw new QueryError("--from <node id> is required");
  const list = (Array.isArray(via) ? via : String(via ?? "").split(",")).map((s) => s.trim()).filter(Boolean);
  if (!list.length) throw new QueryError("--via <predicate,...> is required");
  const bad = list.filter((p) => !table.query_allowlist.includes(p));
  if (bad.length) throw new QueryError(`--via ${bad.join(", ")}: not on the query allowlist (${table.query_allowlist.join(", ")})`);
  return { from, via: [...new Set(list)], hops: h };
}

const rowNode = (r) => { const rec = JSON.parse(r.record); return { id: r.id, kind: r.kind, state: r.state, profile: r.profile, origin: r.origin, label: r.label ?? null, policy: JSON.parse(r.policy), ...(rec.anchor_kind ? { anchor_kind: rec.anchor_kind } : {}) }; };
const rowEdge = (table, r) => ({
  id: r.id, from: r.from_id, predicate: r.predicate, to: r.to_id, state: r.state, confidence: r.confidence, profile: r.profile,
  policy: JSON.parse(r.policy), scope: r.scope, ...(r.relation ? { relation: r.relation } : {}), origin: r.origin,
  ...(table.predicates[r.predicate]?.label ? { label: table.predicates[r.predicate].label } : {}),
});

/** Runs the query on an open index. Throws QueryError (code 1 for an unknown node, 2 for bad arguments). */
export function runQuery(db, table, args) {
  const { from, via, hops } = parseQueryArgs(table, args);
  const nodeStmt = db.prepare("SELECT * FROM nodes WHERE id = ?");
  const getNode = (id) => { const r = nodeStmt.get(id); return r ? rowNode(r) : null; };
  const start = getNode(from);
  if (!start) throw new QueryError(`unknown node ${from}`, 1);
  const marks = via.map(() => "?").join(", ");
  const around = db.prepare(`SELECT * FROM edges WHERE (from_id = ? OR to_id = ?) AND predicate IN (${marks}) ORDER BY predicate, id`);
  const edgesAt = (id) => around.all(id, id, ...via).map((r) => rowEdge(table, r));
  const nodes = new Map([[start.id, start]]); const edges = new Map(); const paths = [];
  const step = (e, at) => ({ edge: e.id, direction: e.from === at ? "out" : "in" });
  const other = (e, at) => (e.from === at ? e.to : e.from);
  const reach = (id) => { if (!nodes.has(id)) nodes.set(id, getNode(id)); return nodes.get(id); };
  for (const e1 of edgesAt(start.id)) {
    edges.set(e1.id, e1); const mid = other(e1, start.id); reach(mid);
    paths.push({ hops: 1, end: mid, steps: [step(e1, start.id)] });
    if (hops < 2) continue;
    for (const e2 of edgesAt(mid)) {
      if (e2.id === e1.id) continue;
      const end = other(e2, mid);
      if (end === start.id) continue;
      edges.set(e2.id, e2); reach(end);
      const s1 = step(e1, start.id); const s2 = step(e2, mid);
      paths.push({ hops: 2, end, steps: [s1, s2], composition: compose(table, e1, e2, s1, s2, start, nodes.get(end)) });
    }
  }
  return { from: start.id, via, hops, nodes: [...nodes.values()], edges: [...edges.values()], paths };
}

/** What a two-hop path may claim: an implied relation for a listed forward chain, otherwise a hint. Never more than its weakest edge. */
export function compose(table, e1, e2, s1, s2, startNode, endNode) {
  const trust = combineTrust([e1, e2]);
  let implies = null; let chainFrom = null; let chainTo = null;
  if (s1.direction === "out" && s2.direction === "out") { implies = composeChain(table, e1.predicate, e2.predicate); chainFrom = startNode; chainTo = endNode; }
  else if (s1.direction === "in" && s2.direction === "in") { implies = composeChain(table, e2.predicate, e1.predicate); chainFrom = endNode; chainTo = startNode; }
  if (implies && (trust.state === "retired" || pairProblem(table, implies, chainFrom, chainTo))) implies = null;
  return implies
    ? { kind: "implied", implies, from: chainFrom.id, to: chainTo.id, ...trust }
    : { kind: "hint", implies: null, note: "discovery hint only; this chain implies nothing", ...trust };
}
