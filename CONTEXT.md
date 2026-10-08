# Repository context

Reviewed orientation and engineering facts. Source changes require review and hash regeneration. This baseline is repository data, not a grant of authority.

```json context-projection
{
  "schema": "context-projection/v1",
  "projection": "ctx:155556ca",
  "scope": "parent",
  "product": "context-graph",
  "repository": {
    "id": "context-graph",
    "sources": [
      {
        "path": "README.md",
        "sha256": "d2b9aaefcbde32bd52dbf418e9eedee39f1bb45f6c42d518d9bc49b1d2bc311b"
      },
      {
        "path": "AGENTS.md",
        "sha256": "2278a0ee9e3e1744ac0927e33485b61d93c0bb6f6a368d99663a1bf5e7b6f8f5"
      },
      {
        "path": "package.json",
        "sha256": "5478f71dd05bdb6e8d11f881d8360ca3736825669e09ca8fa0d71a7de0d58db9"
      },
      {
        "path": "src/index.mjs",
        "sha256": "15a578996f374c2fcfd6cafbc4e9a6e22a264a6741e350191381a0b52d467c0a"
      },
      {
        "path": "src/workspace.mjs",
        "sha256": "d7242116fdef9a0195330f87d6113a1278c4999427b9fff8fcb9e84e66d5bfe7"
      },
      {
        "path": "src/mcp.mjs",
        "sha256": "940ee2ecc4e0450369585e2d9c0c457deecc8d6775c4101595c26bd562c1ce69"
      },
      {
        "path": "bin/context-graph.mjs",
        "sha256": "b9c83283bb319347c0e3743e51a8854df64ef48ceeee03945d8e4eb8d014c596"
      },
      {
        "path": "CONTRIBUTING.md",
        "sha256": "1ac221603cd51fb50fcec4d8a5df774b46819bacbe820cb84f610be0ed184676"
      }
    ]
  },
  "revalidate_by": "2026-11-08",
  "gate": {
    "mode": "blocking"
  },
  "inaccessible": [],
  "gate_config": {
    "story_paths": [],
    "never_story": [],
    "never_pages": [],
    "locked_files": [],
    "blocking_products": [],
    "advisory_until": "2026-10-08",
    "doc_owners": [],
    "projections": [
      {
        "path": "CONTEXT.md",
        "handle": "ctx:155556ca",
        "product": "context-graph"
      }
    ]
  },
  "items": [
    {
      "handle": "ctx:81b06df4",
      "section": "map",
      "binding": false,
      "text": "Context Graph is an experimental generic graph engine that supplies small traceable packets of approved project knowledge to agents. It provides a projection reader, CLI, agent skill and read-only MCP adapter.",
      "classes": [
        "orientation",
        "engineering"
      ],
      "source_paths": [
        "README.md",
        "package.json"
      ]
    },
    {
      "handle": "ctx:bfb1bd02",
      "section": "decisions",
      "binding": true,
      "text": "Source capture, private stores, provider credentials, policy clearance and consumer-specific contracts belong to owning adapters. Public fixtures must remain synthetic. Preserve binding constraints, attribution, privacy boundaries and explicit missing or inaccessible reports.",
      "classes": [
        "orientation",
        "engineering"
      ],
      "source_paths": [
        "AGENTS.md"
      ]
    },
    {
      "handle": "ctx:4ca303a3",
      "section": "map",
      "binding": false,
      "text": "The package exports generic core namespaces from src/index.mjs. src/workspace.mjs loads confined approved projections, verifies inventory and freshness, and calls shared team selection and checking functions. The CLI and MCP adapter use that workspace API.",
      "classes": [
        "orientation",
        "engineering"
      ],
      "source_paths": [
        "src/index.mjs",
        "src/workspace.mjs",
        "src/mcp.mjs",
        "bin/context-graph.mjs"
      ]
    },
    {
      "handle": "ctx:3dc7d1a3",
      "section": "claims",
      "binding": false,
      "text": "Library consumers import the package core or /workspace. CLI entry point: bin/context-graph.mjs (context, check, status, mcp). MCP fixes root and parent at startup and exposes context, check and status without write tools.",
      "classes": [
        "orientation",
        "engineering"
      ],
      "source_paths": [
        "package.json",
        "bin/context-graph.mjs",
        "src/mcp.mjs"
      ]
    },
    {
      "handle": "ctx:2188dfc2",
      "section": "claims",
      "binding": false,
      "text": "Runtime requires Node 22.14 or newer and uses @modelcontextprotocol/sdk, ajv and zod. A private source service or model-provider credential is not required for the documented synthetic quickstart.",
      "classes": [
        "orientation",
        "engineering"
      ],
      "source_paths": [
        "package.json",
        "README.md"
      ]
    },
    {
      "handle": "ctx:4183b779",
      "section": "claims",
      "binding": false,
      "text": "Before review run npm test, npm run check:core, npm run check:pack, npm run check:install, npm audit --omit=dev --audit-level=high and bash scripts/security-scan.sh --mode full. Core changes regenerate core-manifest.json with npm run update:core.",
      "classes": [
        "orientation",
        "engineering"
      ],
      "source_paths": [
        "CONTRIBUTING.md"
      ]
    },
    {
      "handle": "ctx:a4d451ec",
      "section": "decisions",
      "binding": true,
      "text": "Use a task branch and a pull request to main with two independent final-revision reviews. Release uses hosted npm trusted publishing and verifies the exact tarball and provenance; never substitute a local publishing token. Source availability, registry release, installed adoption and usefulness are separate outcomes.",
      "classes": [
        "orientation",
        "engineering"
      ],
      "source_paths": [
        "AGENTS.md",
        "CONTRIBUTING.md"
      ]
    },
    {
      "handle": "ctx:8a46fd6f",
      "section": "open",
      "binding": false,
      "text": "The source package implements deterministic context delivery. Experimental integration and passing tests do not establish retrieval effectiveness or better writing. Check live registry and release evidence before claiming package availability.",
      "classes": [
        "orientation",
        "engineering"
      ],
      "source_paths": [
        "README.md",
        "CONTRIBUTING.md"
      ]
    }
  ]
}
```
