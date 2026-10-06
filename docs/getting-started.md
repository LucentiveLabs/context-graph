# Getting started

Complete the source installation in the [README](../README.md). Run the examples below from the repository root with Node.js 22.14 or newer.

## Inspect a workspace and ask for context

```sh
node bin/context-graph.mjs status --root examples/minimal
node bin/context-graph.mjs context --root examples/minimal --task 'Explain the sample product' --product sample --class story --class library --json
```

`status` returns a workspace revision and projection inventory. `context` returns `text`, `items`, `binding`, `bytes`, `budget`, `overBudget`, and a `report` with `truncated`, `missing`, and `inaccessible` entries. The synthetic example deliberately includes one inaccessible notice.

Keep the bundle alongside the draft and record its hash. A missing or inaccessible item means the context may be incomplete. Do not invent its contents.

## Check changed text

```sh
printf '%s\n' '{"lines":[{"path":"docs/guide.md","line":1,"text":"Use the old record."}]}' | node bin/context-graph.mjs check --root examples/minimal
```

Expect a `term-drift` finding pointing to line 1 and the preferred term `project record`. Change the input to that preferred wording and the finding disappears.

**A successful `check` request exits zero even when it returns findings.** The response's `ok` means the request ran. A CI adapter must inspect `findings` and apply its own failure policy. Some findings describe held exceptions; do not assume every finding should block.

## Use the JavaScript API

After installing a built local tarball or a verified registry release into your application:

```js
import {
  loadWorkspace,
  contextFromWorkspace,
  checkWorkspace,
} from '@lucentive-labs/context-graph/workspace';

const workspace = loadWorkspace('./knowledge');
const bundle = contextFromWorkspace(workspace, {
  task: 'Explain the sample product',
  products: ['sample'],
  classes: ['story', 'library'],
  budget: 12288,
});
console.log(bundle.text);

const checked = checkWorkspace(workspace, {
  lines: [{ path: 'docs/guide.md', line: 1, text: 'Use the project record.' }],
});
console.log(checked.findings);
```

Copy the complete `examples/minimal/` directory to `knowledge/` to run this example. In an installed package, the example is at `node_modules/@lucentive-labs/context-graph/examples/minimal/`. The minimal fixture registers only its own `CONTEXT.md`; a larger workspace must also include every product projection named in the parent registry. In production, replace synthetic material with your cleared records and choose a meaningful revalidation deadline. Do not reuse the example's distant expiry as a production freshness policy. Reload the workspace when files change; a loaded workspace is an in-memory snapshot.

## Connect an agent

Copy [the portable skill](../skills/context-graph/SKILL.md) into the skill directory supported by your host. Configure its workspace path and explicitly test that the host invokes it. A copied skill is not proof of automatic adoption.

For MCP, configure a stdio server. A source-checkout example is:

```json
{
  "mcpServers": {
    "context-graph": {
      "command": "node",
      "args": [
        "/absolute/path/to/context-graph/bin/context-graph.mjs",
        "mcp",
        "--root",
        "/absolute/path/to/knowledge"
      ]
    }
  }
}
```

Adapt the registration shape to your host. The tools are `context`, `check`, and `status`; the root is fixed at startup. Verify an actual `status` and `context` call from the host, not just its configuration file. No HTTP listener, model credentials, or source-writing tools are provided.

## When something fails

| Symptom | Action |
|---|---|
| npm installation returns 404 | Use the source quickstart; check release status. |
| `FILE_UNREADABLE` or `INVENTORY_INVALID` | Restore the registered files and matching handles/products. |
| `PATH_REFUSED` | Keep projection paths relative and inside the workspace, including symlink targets. |
| `PROJECTION_STALE` | Revalidate the sources and regenerate the projection; do not just extend the date. |
| `PRODUCT_UNKNOWN` | Use a product ID in the parent registry. |
| Ideas are absent | Include `story`, inspect truncation, and verify that ideas exist in the selected projection. |
| Binding context exceeds the budget | Allocate more context or reduce the correctly scoped source set upstream. |

For field-level details, see the [reference](reference.md).
