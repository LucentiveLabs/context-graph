# Synthetic context example

This fixture contains no private source records.

```json context-projection
{
  "schema": "context-projection/v1",
  "projection": "ctx:11111111",
  "scope": "parent",
  "product": "sample",
  "revalidate_by": "2099-01-01",
  "gate": {
    "mode": "blocking"
  },
  "inaccessible": [
    {
      "count": 1,
      "reason": "not cleared for this surface"
    }
  ],
  "gate_config": {
    "story_paths": [
      "docs/**"
    ],
    "never_story": [],
    "never_pages": [],
    "locked_files": [],
    "blocking_products": [
      "sample"
    ],
    "advisory_until": "2026-01-01",
    "doc_owners": [
      {
        "glob": "docs/**",
        "product": "sample"
      }
    ],
    "projections": [
      {
        "path": "CONTEXT.md",
        "handle": "ctx:11111111",
        "product": "sample"
      }
    ]
  },
  "items": [
    {
      "handle": "ctx:22222222",
      "section": "definitions",
      "text": "The sample product keeps project decisions with their source records.",
      "binding": true
    },
    {
      "handle": "ctx:33333333",
      "section": "terms",
      "text": "Use project record; old record is deprecated.",
      "binding": true,
      "preferred": [
        "project record"
      ],
      "deprecated": [
        {
          "text": "old record",
          "re": "\\bold record\\b"
        }
      ]
    },
    {
      "handle": "ctx:44444444",
      "section": "ideas",
      "text": "Optional inspiration for explaining project decisions from source records.",
      "binding": false
    }
  ]
}
```
