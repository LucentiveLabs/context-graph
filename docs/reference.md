# Interface reference

The projection interface is the smallest integration surface. All interfaces are experimental in 0.2; pin the version and test upgrades against your fixtures.

## CLI

`context-graph <context|check|status|mcp> --root <directory> [--parent CONTEXT.md]`

Use `node bin/context-graph.mjs` in a source checkout. The installed binary is `context-graph`.

| Command | Input | Output |
|---|---|---|
| `status` | Workspace root and optional parent path | JSON inventory, revision and dates |
| `context` | Required `--task`; repeated `--product` and `--class`; optional `--budget` and `--json` | Text by default, structured bundle with `--json` |
| `check` | JSON on stdin: `{lines:[{path,line,text}],products?:[]}` | JSON findings; findings do not make the command exit nonzero |
| `mcp` | Workspace root and optional parent path | Stdio protocol; tools mirror the projection API |

Classes: `story`, `governance`, `library`. Default: `story`.

| Requested classes | Selected content in 0.2 |
|---|---|
| Any supported class | Applicable binding terms, definitions, decisions and acceptance, without truncation |
| `library` | Also relevant ideas |
| `governance` | Also applicable checks |
| `story` | Also meaning, checks, claims, open decisions and relevant ideas |

Classes combine. They do not broaden a product or page requirement's scope. Story delivery still requires an explicit `story` receipt. The projection client rejects routine classification; routine code needs the owning policy adapter.

Task length: 1-16,000 characters. Budget: an integer from 1-1,048,576 UTF-8 bytes, default 12,288. Check input: at most 10,000 lines, each with a string path, positive integer line number, and text up to 16,000 characters. Registered projection files must be regular files no larger than 1 MiB.

Invalid requests write a JSON error to stderr and exit nonzero. Expected codes include `INPUT_INVALID`, `CLASS_UNSUPPORTED`, `PRODUCT_UNKNOWN`, `PATH_REFUSED`, `FILE_REFUSED`, `FILE_UNREADABLE`, `PROJECTION_INVALID`, `INVENTORY_INVALID`, and `PROJECTION_STALE`. Unexpected errors use `REQUEST_FAILED` without exposing a filesystem path.

## Projection JavaScript exports

From `@lucentive-labs/context-graph/workspace`:

| Export | Contract |
|---|---|
| `loadWorkspace(root, {parentPath?, today?})` | Validates all registered projections and returns an in-memory workspace. `today` is a YYYY-MM-DD testing seam; production callers should use the current date. |
| `contextFromWorkspace(workspace, {task, products?, classes?, budget?})` | Selects parent plus requested products and returns the deterministic bundle. |
| `checkWorkspace(workspace, {lines, products?})` | Returns `{ok, revision, findings}`. `ok` indicates request success, not a clean editorial verdict. |
| `workspaceStatus(workspace)` | Returns `{ok, revision, projections}`. |
| `WorkspaceError` | Error with a stable `code` and a human-readable message. |

Bundle fields include `profile`, `revision`, `text`, `sha256`, `items`, `binding`, `bytes`, `budget`, `overBudget`, `requiredBytes`, `selectionAlgorithm`, and `report`. `sha256` hashes returned text; `revision` hashes the loaded file inventory. Neither is a signature or an approval. Report entries distinguish optional handles omitted by budget, missing context, and inaccessible notices with counts and reasons. The workspace client leaves `report.missing` empty: missing registered files fail loading instead. `report.excludedByClass` counts class exclusions separately from budget omissions.

### Space and omission reports

`ok: true` means the request ran, not that a writer has enough evidence. All binding text survives. If the minimum bundle exceeds the budget, `overBudget` is true, `requiredBytes` gives the minimum diagnostic bundle size, a visible warning appears and optional material is excluded. Otherwise, relevant ideas receive 30% of remaining optional space, other sections follow, and ideas can borrow unused space. Oversized items are skipped so later smaller ones can fit.

`report.truncated` contains every budget-omitted candidate handle. The text shows its count to avoid spending the prompt on a long handle list. `report.ideas` includes `candidates`, `relevant`, `selected` and `status`:

| Status | Meaning |
|---|---|
| `selected` | At least one relevant idea is present; check `truncated` for partial omission |
| `no-relevant-ideas` | No cleared projected idea overlaps the task |
| `omitted-by-budget` | Relevant ideas exist, but none fit |
| `bindings-over-budget` | Mandatory context and its report exceed the budget |
| `not-requested` | Classes exclude ideas |

Product-name words select scope and do not count as topical relevance. The selector uses task-word overlap, then evidence quality, confidence and stable handles. Zero-overlap ideas are excluded from the candidate selection, never presented as relevant. This is a lexical heuristic, not a measure of truth or a promise of exhaustive research.

## Projection format

Use the complete [synthetic projection](../examples/minimal/CONTEXT.md) as a runnable starting point. Each Markdown file contains one `json context-projection` fenced block.

| Field | Meaning |
|---|---|
| `schema` | `context-projection/v1` |
| `projection` | Opaque `ctx:` handle followed by eight lowercase hexadecimal characters |
| `scope` | `parent` or `product` |
| `product` | Application-defined product identifier |
| `revalidate_by` | Date through which the projection is considered current |
| `gate` | `mode: blocking`, or `mode: advisory` with `advisory_until` |
| `items` | Reviewed text items with `handle`, `section`, `text`, and `binding` |
| `inaccessible` | Application-provided count/reason notices, never private source text |
| `gate_config` | Parent only: projection registry, path ownership, story/page exclusions, locked paths and gate configuration |
| `paths`, `family` | Product only: path ownership arrays and whether parent-family rules apply |

The parent registers itself and every product projection by `{path, handle, product}`. Refer to `payloadProblems` in [the team core](../src/core/team.mjs) for the exact runtime validation. The JSON Schemas in `schemas/` describe graph records; they are not a replacement schema for the projection payload.

Binding sections are `terms`, `definitions`, `decisions`, and `acceptance`; their items must set `binding: true`. Other sections (`map`, `checks`, `claims`, `open`, `ideas`) must set it to false. Terms declare deprecated patterns and preferred wording. Checks declare patterns. Acceptance items specify a requirement and where it applies. Equal wording does not combine requirements with different scopes or evidence. For product acceptance, omit `page` to check the product page union, use `page: "landing"` for configured landing entries, or name an exact repository-relative page entry. An unresolved named page fails coverage when the product is touched. A pattern check is narrower than semantic compliance or complete page coverage.

## Lower-level graph core

The package root exports namespaces: `canonical`, `fields`, `index_db`, `intent`, `leak`, `predicates`, `project`, `propagate`, `query`, `records`, `schemas`, `serve`, `team`, and `validate`. Import a module directly through `@lucentive-labs/context-graph/core/<name>` or use the namespace exports. The `index_db` namespace uses the filename-based subpath `@lucentive-labs/context-graph/core/index-db`.

`serve.makeServer(view)` needs an application-built view with graph, serving policy, cleared phrasing, capture resolution, and scanning adapters. It is not a drop-in replacement for `loadWorkspace`. The intent API requires `canonicalIntentJson`, `createIntentReceiptV2`, `assembleIntentReceipt`, `validateIntentCardV2`, and `validateIntentCardLineage` from the consuming contract. Source authentication and immutable task lineage remain that contract's responsibility.

Low-level signatures are documented alongside their implementations. The source and synthetic tests are the compatibility reference during 0.2. The projection API is the recommended starting point for a new consumer.

## Evidence and upgrades

Ideas may include `evidence: [{handle, kind, summary?}]`, `exclusions: string[]`, `confidence: 0..1` and `relation`. Evidence handles are opaque; summaries must already be cleared by the application. Kinds are `primary-excerpt`, `source-paraphrase`, `digest`, `unlocated-synthesis` or `unknown`. Missing evidence remains unknown. A candidate application is a possible writing angle; documented influence is a separately supported historical relationship. Neither establishes product efficacy.

Version 0.2 uses `selectionAlgorithm: context-selection/v2` and `context-receipt/v2`. Regenerate delivery receipts after upgrading every reader. Older v1 receipts remain historical artifacts and may be reverified with their exact old pin; current delivery rejects them. Do not change their schema labels to make them pass.

`core-manifest.json` names the canonical generic modules, version, algorithm and SHA-256 of each file. A source-pinned or vendored consumer must also retain the exact upstream commit and validate these bytes. Capture, authentication, source clearance, filesystem layout and consuming intent contracts belong in adapters. See [integration](integration.md).
