# Context Graph

Experimental context infrastructure for agents: typed graph records, validated team projections, a local CLI and an optional read-only MCP server. Version 0.1 is an integration release. It does not claim that retrieval effectiveness has been established.

Requires Node.js 22.13 or newer.

```sh
npm install @lucentive-labs/context-graph
npx context-graph status --root ./node_modules/@lucentive-labs/context-graph/examples/minimal
npx context-graph context --root ./node_modules/@lucentive-labs/context-graph/examples/minimal --task 'Explain the sample product' --product sample
```

The example contains synthetic data only. To adopt it, replace the example projections with material cleared by your own source and privacy workflow. Revalidate projections by their declared dates.

## Interfaces

- **Library:** `import { serve, validate, project, intent, query } from '@lucentive-labs/context-graph'`. The core takes explicit graph views and policy adapters. It contains no model-provider client, credentials, personal store or source-capture agent.
- **Projection API:** `loadWorkspace(root)` and `contextFromWorkspace(workspace, request)` from `@lucentive-labs/context-graph/workspace` use the same projection validation and bundle selection as the CLI and MCP server.
- **CLI:** `context-graph context|check|status --root <directory> [--parent CONTEXT.md]`. Context accepts `--task`, repeated `--product`, repeated `--class story|governance|library`, `--budget <bytes>` and `--json`. Check reads `{lines:[{path,line,text}],products?:[id]}` from stdin.
- **Agent skill:** copy `skills/context-graph/` into your host's skill directory. It adds no credentials or automatic background jobs.
- **Optional MCP:** configure a stdio server that executes your installed `context-graph mcp --root /absolute/workspace`. Its tools are `context`, `check` and `status`; they cannot change the root or write files.

The projection CLI reads only the parent projection and files in its registry. Missing, malformed, inconsistent, escaped or expired projections fail the request. Paths supplied to `check` label text; the server does not read those paths.

Binding constraints remain complete even when they exceed the byte budget. Optional items are ranked and truncated with an explicit report. A bundle hash identifies the exact returned bytes; it does not authenticate a source or establish permission to publish.

## Integration boundaries

The core supports private graph adapters, typed provenance, scoped context, intent handoffs, leak scanning and propagation planning. The intent API takes the consuming contract adapter (`canonicalIntentJson`, `createIntentReceiptV2`, `assembleIntentReceipt`, `validateIntentCardV2`, and `validateIntentCardLineage`); that adapter owns card validation and immutable lineage. The package does not introduce a second card schema. These require the consuming application's authenticated records, policy, contract validators and clearance decisions. The included CLI and MCP adapter serve approved team projections only. Routine-task scope classification, private capture, automatic publication, model invocation and a durable agent lifecycle are outside that adapter.

The protocol identifiers `origin-graph/v1` and `urn:origin:graph:*` remain for schema compatibility. They identify the wire format, not a connection to any private repository. Do not treat proposed graph records or agent interpretations as authenticated human instructions.

## Development

```sh
npm ci --ignore-scripts
npm test
npm run check:pack
```

The release comes from this canonical repository. The release workflow gates a tarball without publication credentials, publishes those exact bytes through npm trusted publishing, then verifies the registry revision, tarball integrity, install/import behavior, and cryptographic signatures in a separate job. Configure the package trusted publisher for `LucentiveLabs/context-graph` and `release.yml` with direct publication enabled before the first release. No local npm token is part of this lane. A failed run can be retried through workflow dispatch with `confirm: recover`; an existing version is accepted only when its revision and bytes match. A public source release and a successful npm release are separate states.

MIT licensed.
