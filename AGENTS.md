# Context Graph

This repository owns the experimental generic context graph engine, projection CLI, agent skill, and read-only MCP adapter. Read README.md before changing behavior.

Keep source capture, private stores, provider credentials, policy adapters, and consumer-specific contracts outside this package. Fixtures must be synthetic. Preserve binding constraints, source attribution, privacy boundaries, and explicit missing/inaccessible reports. The CLI and MCP adapter share the library policy functions.

Work on a task branch and merge through a pull request after two independent reviews of the final revision. Run `npm test`, `npm run check:pack`, `npm audit --omit=dev --audit-level=high`, and `bash scripts/security-scan.sh --mode full`. Install the local secret hook with `git config core.hooksPath scripts/githooks`.

The release workflow publishes from main with trusted publishing and verifies the exact tarball and provenance. Never replace that lane with a local token-based publish. An unavailable publishing identity is an external blocker; code completion and a verified release are separate outcomes. Experimental integration status is not evidence of retrieval effectiveness.
