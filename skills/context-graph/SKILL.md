---
name: context-graph
description: Read registered context-graph team projections before writing or reviewing product content, and check changed text against their binding rules.
---

Use the workspace's configured context graph when it has a parent `CONTEXT.md` projection. The owning adapter must clear source material before creating those projections.

Run `context-graph status --root <workspace>` to verify the inventory and revalidation dates. Then use `context-graph context --root <workspace> --task '<requested outcome>' --product <registered-id>`. Keep the default `story` class for content work so acceptance requirements and optional ideas are included. `library` alone selects relevant ideas alongside applicable binding requirements. `governance` adds checks. In 0.2 every class retains applicable acceptance. Check `report.ideas.status`: increase the budget if evidence is omitted or bindings overflow; no-relevant-ideas is an explicit outcome. Optional idea metadata carries evidence kind, relationship and exclusions; do not turn an unknown source or candidate application into proof. Read the selected binding constraints and the missing, inaccessible and truncated-item report. Selected binding requirements can exceed the requested byte budget; do not silently shorten them.

Use the optional `context` MCP tool for the same operation when the host has configured it. The local MCP server reads the root fixed at startup; it does not capture sources, write records, or grant publication permission.

For changed text, send `{ "lines": [{ "path": "relative/file.md", "line": 1, "text": "changed text" }] }` to `context-graph check --root <workspace>` on stdin, or use the `check` MCP tool. Findings are deterministic rule matches, not proof of overall product quality.

A missing or stale projection is a missing context dependency. Report it and use the owning project's repair workflow. This projection client does not classify ordinary coding tasks or mint authenticated intent; those require the owning policy adapter. Do not imply that an empty result proves the task has no constraints.
