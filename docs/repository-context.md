# Repository orientation and engineering context

Version 0.3 adds explicit `orientation` and `engineering` requests. These use reviewed repository facts, not a default story or library bundle. They work locally without a private source service.

```sh
node bin/context-graph.mjs context --root . --class orientation --repo context-graph --task 'Explain this repository purpose, architecture, boundaries and current implementation.' --budget 4096
node bin/context-graph.mjs context --root . --class engineering --repo context-graph --path src/workspace.mjs --task 'Trace the projection reader boundary' --json
```

The library accepts `repo` and `paths` alongside `classes`. The MCP `context` tool accepts the same fields. Request repository and product context separately: neither a repository name nor a path grants access to another workspace or imports a product's narrative rules.

## Authoring a baseline

Use the existing `CONTEXT.md` projection format. The parent registers every projection as before. A repository projection adds:

```json
{
  "repository": {
    "id": "sample-repo",
    "sources": [{ "path": "README.md", "sha256": "<64 lowercase hexadecimal characters>" }]
  }
}
```

Sources are 1..64 explicitly registered files inside this workspace, each at most 1 MiB. Every read checks confinement, source hashes, projection inventory, and revalidation dates. A changed source returns `SOURCE_STALE`; it never silently updates an approved summary. Review the source and baseline together before regenerating the recorded hash. Hashes establish byte agreement, not factual correctness or clearance.

Each repository item reuses an existing section (`map`, `claims`, `decisions`, and so on) and adds explicit classes and supporting source paths:

```json
{
  "handle": "ctx:12345678",
  "section": "map",
  "binding": false,
  "text": "The reader supplies approved records to the command-line adapter.",
  "classes": ["orientation", "engineering"],
  "source_paths": ["README.md"],
  "paths": ["src/**"]
}
```

Only explicitly classed repository items enter an engineering request. Optional `paths` globs scope an item when a request names paths; an orientation request without paths sees the repository-wide baseline. Binding requirements retain their section semantics and survive byte pressure within the selected scope. Unrelated story bindings and library ideas do not become engineering requirements.

Keep the baseline small: purpose, current implementation, architecture, boundaries, entry points, dependencies, and verification pointers. Clearly label aspirations and unknowns. Link back to repo-owned evidence. Do not copy another repository's private context or assume all agents may read it.

The response retains included handles and source references. Text includes source paths beside each item. `report.sources` records the source hashes; the workspace revision binds the projection bytes that declare them. The 4096-byte orientation budget is a caller-selected target, not permission to truncate binding requirements. Hosts with a hard delivery ceiling must fetch the complete bundle or report unchecked context.

## Host integration and compatibility

A host should request orientation before substantive work and reuse it only while its task, repository and approved snapshot remain current. Fetch deeper engineering context when the task needs it. Rehydrate context after a fresh child session or compaction. This package supplies retrieval, not a global hook or proof of model consumption.

Version 0.3 uses `context-selection/v3` and `context-receipt/v3`. Exact normalized token matching now retains short identifiers such as API and IAS and avoids substring matches such as line/deadline. Selection and bundle hashes therefore change. Install compatible readers first, regenerate current delivery receipts, and retain historical v1/v2 receipts with their exact source pins. Do not relabel old receipts. The existing receipt validator still serves story delivery; host delivery receipts for engineering are the owning adapter's responsibility.

Use real tasks to measure whether a baseline improves outcomes. Successful lookup, source-hash agreement, and a model acknowledging context are separate from verified use and benefit.
