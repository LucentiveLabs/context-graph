# Changelog

## 0.2.0 (experimental)

- Library requests now include relevant ideas; every class retains applicable acceptance.
- Deterministic task ranking, idea space reservation, oversized-item skipping and explicit idea omission diagnostics.
- Full eligible concept export with a 1 MiB refusal, opaque evidence metadata and semantic exclusions.
- Selection/v2 and receipt/v2 make the behavior change explicit. Regenerate receipts after reader upgrades; keep v1 history at its original pin.
- Product-linked claims keep lexical relevance: the named product's words score claims, meaning, checks and open decisions (ideas still exclude them), and equal-relevance items keep their projection's declared order, the named product's own projection first, instead of handle order. Bundles and receipt hashes taken from the earlier 0.2 source pin change; regenerate them.
- Canonical core file manifest and source/vendoring integration guide. Node minimum aligns with tested 22.14+.
- Registry publication remains a separately verified release outcome.


## Unreleased

- Add a source-install quickstart, plain-language architecture and diagrams, projection/API reference, writing and evaluation guide, contributor instructions, and security reporting guidance.
- State npm release availability explicitly and document current selection and check-result semantics.
- Resolve the verified release tarball to an absolute local path so npm does not interpret it as a GitHub package reference.

## 0.1.0 source baseline

- Experimental typed graph core, validated projection API, local CLI, portable skill, and read-only MCP adapter.
- Synthetic examples, package boundary checks, independent review requirements, and a trusted-publishing workflow with tarball/provenance verification.

This entry describes the source baseline; it does not assert a successful npm publication. Consult the release workflow and registry for publication status.
