// Canonical JSON and the hashes the context graph binds: proposal hashes (what reviewers approve), anchor record
// hashes (what the anchor ledger freezes) and ledger entry hashes (the chain). Generic: no repository layout, no data.
import { sha256 } from "./portable.mjs";

/** JSON with object keys sorted at every level and no whitespace; undefined members are dropped. */
export function canonical(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("canonical JSON has no NaN or Infinity");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : canonical(v))).join(",")}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}
export const canonicalHash = (value) => sha256(Buffer.from(canonical(value), "utf8"));
const omit = (obj, keys) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => !keys.includes(k)));

/** What a review approves: the record without review_receipts and state (state is the review's outcome, so it cannot be part of what is reviewed). */
export const PROPOSAL_EXCLUDES = ["review_receipts", "state"];
export const proposalHash = (record) => canonicalHash(omit(record, PROPOSAL_EXCLUDES));
/** What the anchor ledger freezes: the whole anchor record except its state, which the ledger itself decides. */
export const anchorRecordHash = (record) => canonicalHash(omit(record, ["state"]));
/** A ledger entry's own hash: the entry without entry_sha256. */
export const ledgerEntryHash = (entry) => canonicalHash(omit(entry, ["entry_sha256"]));
