# Changelog

## 0.3.0 (experimental)

- Explicit repository orientation and engineering requests across library, CLI and MCP, with optional path selection.
- Repo-owned baseline metadata checks source hashes and path confinement; each engineering item cites registered sources and explicitly declares its applicable classes.
- Exact Unicode-normalized token matching includes short domain identifiers and prevents substring relevance false positives.
- Selection/v3 and receipt/v3 identify changed bundle behavior. Upgrade readers before regenerating exports and receipts; keep frozen evaluations and historical receipts on their original pins.
- Source-ready, installed, registry-released, actually used, and beneficial remain separate evidence states.

## 0.2.0 (experimental)

- Library requests now include relevant ideas; every class retains applicable acceptance.
- Deterministic task ranking, idea space reservation, oversized-item skipping and explicit idea omission diagnostics.
- Full eligible concept export with a 1 MiB refusal, opaque evidence metadata and semantic exclusions.
- Selection/v2 and receipt/v2 make the behavior change explicit. Regenerate receipts after reader upgrades; keep v1 history at its original pin.
- Product-linked claims keep lexical relevance: the named product's words score claims, meaning, checks and open decisions (ideas still exclude them), and equal-relevance items keep their projection's declared order, the named product's own projection first, instead of handle order. Bundles and receipt hashes taken from the earlier 0.2 source pin change; regenerate them.
- Canonical core file manifest and source/vendoring integration guide. Node minimum aligns with tested 22.14+.
- Registry publication remains a separately verified release outcome.


## Unreleased

- Stored projections preserve all eligible product claims and parent definition, constraint and term claims. Query limits no longer remove existing claims when new source material arrives; request-time byte budgets and privacy filtering remain in force.

- Reject inherited object-property names as acceptance requirements instead of treating them as valid rules. Brace alternatives in path globs now preserve wildcard semantics, including `docs/{*.md,*.mdx}`.
- Shared-path checks now retain each applicable product and rule. A blocking owner cannot be masked by an earlier advisory co-owner; parent rules apply only to family owners. Consumers may receive additional findings for distinct owners or rules, while duplicate occurrences of the same finding remain collapsed.
- A deprecated term variant may name `allowed_paths`: path globs where that variant is the accepted wording (for example a product that keeps a name the rest of the family retires). `check` gives no finding for it there while the term's other variants still apply, impact no longer counts it as an occurrence in artifacts on those paths, and the rendered CONTEXT.md lists the allowance beside the retired variant. Additive: a projection without the field behaves as before, and a reader that predates it reports the variant as drift.
- Add a source-install quickstart, plain-language architecture and diagrams, projection/API reference, writing and evaluation guide, contributor instructions, and security reporting guidance.
- State npm release availability explicitly and document current selection and check-result semantics.
- Resolve the verified release tarball to an absolute local path so npm does not interpret it as a GitHub package reference.

## 0.1.0 source baseline

- Experimental typed graph core, validated projection API, local CLI, portable skill, and read-only MCP adapter.
- Synthetic examples, package boundary checks, independent review requirements, and a trusted-publishing workflow with tarball/provenance verification.

This entry describes the source baseline; it does not assert a successful npm publication. Consult the release workflow and registry for publication status.
