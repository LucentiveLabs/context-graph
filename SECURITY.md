# Security

The current 0.1 line is experimental. There is no supported older release line or promised response-time service level.

Report suspected vulnerabilities through the repository's [private vulnerability reporting page](https://github.com/LucentiveLabs/context-graph/security/advisories/new) when enabled. If that channel is unavailable, open an issue asking for a private reporting channel without including exploit details or sensitive records.

Include the affected version, a synthetic reproduction, impact, and expected boundary. Never include real source records, credentials, private projections, or personal data in a public issue.

## Boundary

- The projection client reads a fixed local root and its registered files. It confines paths and rejects escaped symlink targets, invalid inventories, and expired projections.
- MCP exposes read-only `context`, `check`, and `status` tools. A `check` path is a label for supplied text, not permission to read that file.
- Projections and their regular-expression rules are trusted, application-authored input. This package is not a sandbox for hostile projection authors. Do not load unreviewed projections into a privileged process.
- A hash detects a change in bytes; it is not an authenticated identity, consent record, publication grant, or factual verification.
- Every process that can read a projection can read its contents. Enforce access controls and clearance before producing a shared projection.

See [architecture and ownership](docs/architecture.md) for the application responsibilities and [contributing](CONTRIBUTING.md) for security checks and release provenance.
