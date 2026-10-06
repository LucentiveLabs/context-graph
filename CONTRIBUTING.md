# Contributing

Start with the [architecture](docs/architecture.md), then reproduce your change with synthetic data. Keep provider clients, private stores, capture systems, and application-specific policy outside the package.

For a bug, open an issue with the package and Node versions, expected behavior, observed behavior, and a minimal synthetic projection. Never attach a real private context bundle. For a proposed feature, explain the user task it improves and why the projection API or an external adapter cannot already solve it.

## Local workflow

Run these commands from a source checkout, not an installed runtime package.

```sh
npm ci --ignore-scripts
git config core.hooksPath scripts/githooks
npm test
npm run check:core
npm run check:pack
npm run check:install
npm audit --omit=dev --audit-level=high
bash scripts/security-scan.sh --mode full
```

Work on a task branch and submit a pull request to `main`. Describe the problem, behavior change, validation, and compatibility impact. Add focused regression coverage for behavioral fixes. Update the relevant guide and changelog. Maintainers obtain two independent reviews of the final revision before merging, as required by [AGENTS.md](https://github.com/LucentiveLabs/context-graph/blob/main/AGENTS.md).

The tests exercise projection boundaries, CLI/library parity, real MCP calls, release metadata, and scanner containment. They are not evidence that your source library is complete or that retrieval improves writing. Add application-level evaluations in the consuming system.

## Release and maintenance

The canonical release workflow is [release.yml](https://github.com/LucentiveLabs/context-graph/blob/main/.github/workflows/release.yml). It runs security and package gates, prepares a tarball without publication credentials, publishes those exact bytes with npm trusted publishing, then verifies registry revision, integrity, clean installation/imports, and signatures in a separate job. CI tests Node 22.14 and 24.

Before the first npm release, the maintainer must configure the package trusted publisher for `LucentiveLabs/context-graph`, workflow `release.yml`, with direct publication enabled. If that identity is unavailable, record the blocker. Do not substitute a local token-based publish.

A failed run may be retried through workflow dispatch with `confirm: recover`. An existing version is accepted only if its revision and bytes match. Source-only releases, npm publication, and downstream runtime adoption are different milestones; verify each explicitly.

Include every intended runtime/documentation file in `package.json` and the pack allowlist. Inspect the actual tarball. Keep action references pinned and review dependency updates through the normal PR process. Hosted security scanning runs on reviewed main and weekly; PR-controlled CI alone does not constitute security approval.

Experimental APIs may change before 1.0. Use the changelog to call out incompatible changes, and provide migration steps when changing a projection or graph contract. Maintain downstream compatibility fixtures rather than assuming a copied engine remains equivalent.

Core changes update `core-manifest.json` with `npm run update:core`. Review the changed hashes and run `npm run check:core`. Consumers pin the upstream commit separately; a manifest is an integrity inventory, not approval.
