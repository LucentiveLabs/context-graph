import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repository = "LucentiveLabs/context-graph";
const registry = "https://registry.npmjs.org/";
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const digest = (bytes, algorithm = "sha256", encoding = "hex") => createHash(algorithm).update(bytes).digest(encoding);
async function get(url, missing = false) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (missing && response.status === 404) return null;
  if (!response.ok) throw new Error(`Release evidence request failed (${response.status})`);
  return response.json();
}
export function assertVersionAvailable(pkg, packument, head) {
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error("Release versions must be stable numeric semver");
  const current = packument?.versions?.[pkg.version];
  if (current && current.gitHead !== head) throw new Error("Published version belongs to another revision");
  const compare = (a, b) => { for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] - b[i]; } return 0; };
  for (const version of Object.keys(packument?.versions ?? {})) {
    if (/^\d+\.\d+\.\d+$/.test(version) && compare(version.split(".").map(Number), pkg.version.split(".").map(Number)) > 0) throw new Error("A newer stable version already exists");
  }
  return current ?? null;
}
export function assertPublished(receipt, published) {
  if (published?.name !== receipt.name || published.version !== receipt.version || published.gitHead !== receipt.head) throw new Error("Registry revision binding differs");
  if (published.dist?.integrity !== receipt.integrity) throw new Error("Registry tarball differs from the gated artifact");
  if (!published.dist?.attestations?.url) throw new Error("Registry provenance is missing");
}
export function readReleaseArtifact(receipt, directory = "release-artifact") {
  if (typeof receipt.file !== "string" || !/^[a-z0-9][a-z0-9.-]*\.tgz$/.test(receipt.file)) throw new Error("Invalid artifact name");
  const file = join(directory, receipt.file); const bytes = readFileSync(file);
  if (digest(bytes) !== receipt.sha256 || `sha512-${digest(bytes, "sha512", "base64")}` !== receipt.integrity) throw new Error("Artifact digest differs");
  return file;
}
async function prepare() {
  const env = process.env;
  if (env.GITHUB_REPOSITORY !== repository || env.GITHUB_REF !== "refs/heads/main") throw new Error("Release requires the canonical main branch");
  if (!(env.GITHUB_EVENT_NAME === "push" || (env.GITHUB_EVENT_NAME === "workflow_dispatch" && env.RELEASE_CONFIRM === "recover"))) throw new Error("Invalid release event");
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (head !== env.GITHUB_SHA || !/^[a-f0-9]{40}$/.test(head)) throw new Error("Checkout differs from release revision");
  if (execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()) throw new Error("Release source must be clean");
  const repo = await get(`https://api.github.com/repos/${repository}`);
  if (repo.private || repo.full_name !== repository) throw new Error("Provenance requires the public canonical repository");
  const original = readFileSync("package.json"); const pkg = JSON.parse(original);
  const existing = assertVersionAvailable(pkg, await get(registry + encodeURIComponent(pkg.name), true), head);
  mkdirSync("release-artifact", { recursive: true });
  let packed;
  try {
    // npm's directory publisher supplies gitHead. Include the same exact
    // metadata in the prebuilt tarball so the privileged job never repacks.
    writeFileSync("package.json", JSON.stringify({ ...pkg, gitHead: head }, null, 2) + "\n");
    [packed] = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", "release-artifact"], { encoding: "utf8" }));
  } finally { writeFileSync("package.json", original); }
  const bytes = readFileSync(join("release-artifact", packed.filename));
  const receipt = { schema: "context-graph-release.v1", name: pkg.name, version: pkg.version, head, file: packed.filename, sha256: digest(bytes), integrity: `sha512-${digest(bytes, "sha512", "base64")}`, checkedAt: new Date().toISOString() };
  if (existing) assertPublished(receipt, existing);
  writeFileSync("release-artifact/receipt.json", JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify({ ...receipt, alreadyPublished: !!existing }));
}
async function publish() {
  if (process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN) throw new Error("Token-based publication is not this release lane");
  if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL || !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) throw new Error("Trusted publisher identity is unavailable");
  const receipt = json("release-artifact/receipt.json");
  if (receipt.head !== process.env.GITHUB_SHA || process.env.GITHUB_REPOSITORY !== repository || process.env.GITHUB_REF !== "refs/heads/main") throw new Error("Artifact revision differs from publisher");
  const file = readReleaseArtifact(receipt);
  const existing = await get(registry + encodeURIComponent(receipt.name) + "/" + receipt.version, true);
  if (existing) { assertPublished(receipt, existing); console.log("Existing exact release will be reverified"); return; }
  execFileSync("npm", ["publish", file, "--ignore-scripts", "--access", "public", "--provenance", "--registry", registry], { stdio: "inherit" });
}
async function verify() {
  const receipt = json("release-artifact/receipt.json");
  if (receipt.head !== process.env.GITHUB_SHA) throw new Error("Verification revision differs");
  assertPublished(receipt, await get(registry + encodeURIComponent(receipt.name) + "/" + receipt.version));
  const cwd = mkdtempSync(join(tmpdir(), "context-graph-release-"));
  try {
    writeFileSync(join(cwd, "package.json"), '{"private":true,"type":"module"}\n');
    execFileSync("npm", ["install", "--ignore-scripts", "--registry", registry, `${receipt.name}@${receipt.version}`], { cwd, stdio: "inherit" });
    execFileSync(process.execPath, ["--input-type=module", "-e", "await import('@lucentive-labs/context-graph'); await import('@lucentive-labs/context-graph/workspace')"], { cwd, stdio: "inherit" });
    execFileSync("npm", ["audit", "signatures"], { cwd, stdio: "inherit" });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
  console.log(JSON.stringify({ ...receipt, verifiedAt: new Date().toISOString(), verified: true }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const action = { prepare, publish, verify }[process.argv[2]];
  if (!action) throw new Error("Use prepare, publish or verify");
  await action();
}
