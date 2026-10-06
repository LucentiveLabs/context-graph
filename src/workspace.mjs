// A filesystem adapter for approved team projections. All selection and checks
// use the graph's shared team core; source capture and clearance stay upstream.
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { locate } from "./core/portable.mjs";
import { parseProjection, loadInventory, uniquePayloads, teamBundle, checkLines as checkProjection, sha256 } from "./core/team.mjs";

export class WorkspaceError extends Error {
  constructor(code, message) { super(message); this.name = "WorkspaceError"; this.code = code; }
}
const reject = (code, message) => { throw new WorkspaceError(code, message); };
const read = (root, relative) => {
  const location = locate(root, relative);
  if (!location.file) reject("PATH_REFUSED", "A registered projection path escapes the workspace.");
  try {
    if (!statSync(location.file).isFile() || statSync(location.file).size > 1024 * 1024) reject("FILE_REFUSED", "A projection must be a regular file of at most 1 MiB.");
    return readFileSync(location.file, "utf8");
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
    reject("FILE_UNREADABLE", "A registered projection cannot be read.");
  }
};

export function loadWorkspace(root, { parentPath = "CONTEXT.md", today = new Date().toISOString().slice(0, 10) } = {}) {
  const directory = resolve(root);
  const files = new Map([[parentPath, read(directory, parentPath)]]);
  let parent;
  try { parent = parseProjection(files.get(parentPath)); }
  catch { reject("PROJECTION_INVALID", "The parent projection is malformed."); }
  if (parent.scope !== "parent") reject("PROJECTION_INVALID", "The entry projection must have parent scope.");
  const registry = parent.gate_config.projections;
  if (new Set(registry.map((entry) => entry.path)).size !== registry.length) reject("PROJECTION_INVALID", "The registry contains duplicate paths.");
  for (const { path } of registry) if (!files.has(path)) files.set(path, read(directory, path));
  const inventory = loadInventory(files, parentPath);
  if (inventory.problems.length) reject("INVENTORY_INVALID", "Registered projections are missing, inconsistent, or malformed.");
  if (inventory.payloadsByPath.get(parentPath)?.scope !== "parent") reject("INVENTORY_INVALID", "The parent must register itself.");
  const payloads = uniquePayloads([...inventory.payloadsByPath.values()]);
  const stale = payloads.filter((p) => p.revalidate_by < today).map((p) => p.projection);
  if (stale.length) reject("PROJECTION_STALE", `Revalidation is required for ${stale.length} projection(s).`);
  return { files, payloads, parent: inventory.parent, revision: sha256([...files].map(([p, value]) => `${p} ${sha256(value)}`).sort().join("\n")) };
}

export function contextFromWorkspace(workspace, { task, products = [], classes = ["story"], budget = 12288 } = {}) {
  if (typeof task !== "string" || !task.trim() || task.length > 16000) reject("INPUT_INVALID", "Task must contain 1 to 16000 characters.");
  if (!Array.isArray(classes) || !classes.length || classes.some((c) => !["story", "governance", "library"].includes(c))) reject("CLASS_UNSUPPORTED", "Projection context supports story, governance and library work; routine scopes require a policy adapter.");
  if (!Array.isArray(products) || products.some((p) => typeof p !== "string" || !p)) reject("INPUT_INVALID", "Products must be non-empty identifiers.");
  if (!Number.isSafeInteger(budget) || budget < 1 || budget > 1048576) reject("INPUT_INVALID", "Budget must be between 1 and 1048576 bytes.");
  const known = new Set(workspace.payloads.map((p) => p.product));
  if (products.some((p) => !known.has(p))) reject("PRODUCT_UNKNOWN", "A requested product has no registered projection.");
  const family = !products.length || products.some((id) => workspace.payloads.some((p) => p.product === id && (p.scope === "parent" || p.family !== false)));
  const selected = workspace.payloads.filter((p) => p.scope === "parent" ? family : products.includes(p.product));
  const bundle = teamBundle(selected, { task, products, classes, budget });
  return { ok: true, profile: "team", revision: workspace.revision, budget, overBudget: bundle.bytes > budget, ...bundle };
}

export function checkWorkspace(workspace, { lines, products = null } = {}) {
  if (!Array.isArray(lines) || lines.length > 10000 || lines.some((line) => typeof line?.path !== "string" || typeof line.text !== "string" || line.text.length > 16000 || !Number.isSafeInteger(line.line) || line.line < 1)) reject("INPUT_INVALID", "Check requires at most 10000 text lines with a path and positive line number.");
  if (products !== null && (!Array.isArray(products) || products.some((p) => typeof p !== "string"))) reject("INPUT_INVALID", "Products must be a list of identifiers.");
  return { ok: true, revision: workspace.revision, findings: checkProjection(workspace.payloads, { lines }, { products: products ?? [], lockedPaths: workspace.parent.gate_config.locked_files }) };
}

export const workspaceStatus = (workspace) => ({ ok: true, revision: workspace.revision, projections: workspace.payloads.map((p) => ({ handle: p.projection, product: p.product, revalidateBy: p.revalidate_by, items: p.items.length })) });
