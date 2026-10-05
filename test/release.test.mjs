import test from "node:test";
import assert from "node:assert/strict";
import { assertVersionAvailable, assertPublished } from "../scripts/release.mjs";
test("release retries admit only the same revision and reject version regression", () => {
  const pkg = { name: "sample", version: "0.1.0" }; const head = "a".repeat(40);
  assert.equal(assertVersionAvailable(pkg, null, head), null);
  assert.throws(() => assertVersionAvailable(pkg, { versions: { "0.1.0": { gitHead: "b".repeat(40) } } }, head), /another revision/);
  assert.throws(() => assertVersionAvailable(pkg, { versions: { "0.2.0": {} } }, head), /newer/);
  assert.deepEqual(assertVersionAvailable(pkg, { versions: { "0.1.0": { gitHead: head } } }, head), { gitHead: head });
});
test("release verification binds source, exact bytes and provenance presence", () => {
  const receipt = { name: "sample", version: "0.1.0", head: "a".repeat(40), integrity: "sha512-example" };
  const published = { name: receipt.name, version: receipt.version, gitHead: receipt.head, dist: { integrity: receipt.integrity, attestations: { url: "https://registry.npmjs.org/example" } } };
  assert.doesNotThrow(() => assertPublished(receipt, published));
  assert.throws(() => assertPublished(receipt, { ...published, gitHead: "b".repeat(40) }), /binding/);
  assert.throws(() => assertPublished(receipt, { ...published, dist: { ...published.dist, integrity: "changed" } }), /tarball/);
  assert.throws(() => assertPublished(receipt, { ...published, dist: { integrity: receipt.integrity } }), /provenance/);
});
