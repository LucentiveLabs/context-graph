import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertVersionAvailable, assertPublished, readReleaseArtifact } from "../scripts/release.mjs";
import { parseNpmPackResult } from "../scripts/npm-pack-result.mjs";
test("pack metadata supports legacy arrays and npm 12 maps and refuses ambiguous output", () => {
  const expected = { name: "@example/package", version: "0.1.0" };
  const pack = { ...expected, filename: "example-package-0.1.0.tgz", integrity: "sha512-example", files: [] };
  for (const output of [[pack], { [pack.name]: pack }]) assert.deepEqual(parseNpmPackResult(JSON.stringify(output), expected), pack);
  for (const output of [null, {}, [], [pack, pack], { a: pack, b: pack }]) assert.throws(() => parseNpmPackResult(JSON.stringify(output), expected), /exactly one/);
  for (const change of [{ name: "other" }, { version: "0.2.0" }, { files: null }, { filename: null }, { integrity: null }]) assert.throws(() => parseNpmPackResult(JSON.stringify([{ ...pack, ...change }]), expected), /metadata differs/);
});
test("publisher accepts npm's actual packed filename and refuses escaped or changed artifacts", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "context-graph-pack-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const packed = parseNpmPackResult(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", directory], { encoding: "utf8" }), JSON.parse(readFileSync("package.json", "utf8")));
  const bytes = readFileSync(join(directory, packed.filename));
  const receipt = { file: packed.filename, sha256: createHash("sha256").update(bytes).digest("hex"), integrity: packed.integrity };
  assert.equal(readReleaseArtifact(receipt, directory), join(directory, packed.filename));
  assert.throws(() => readReleaseArtifact({ ...receipt, sha256: "0".repeat(64) }, directory), /digest differs/);
  for (const file of ["../escape.tgz", "/escape.tgz", "..\\escape.tgz", "-option.tgz", "archive.zip"]) assert.throws(() => readReleaseArtifact({ ...receipt, file }, directory), /Invalid artifact name/);
});
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
