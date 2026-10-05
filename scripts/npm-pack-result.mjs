// npm 12 keys pack JSON by package name; npm 10/11 return an array.
export function parseNpmPackResult(output, expected) {
  const value = JSON.parse(output);
  const entries = Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];
  if (entries.length !== 1) throw new Error("Expected exactly one packed package");
  const pack = entries[0];
  if (!pack || pack.name !== expected.name || pack.version !== expected.version || typeof pack.filename !== "string" || typeof pack.integrity !== "string" || !Array.isArray(pack.files)) throw new Error("Packed package metadata differs from expected source");
  return pack;
}
