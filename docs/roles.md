# Roles: who decides what is true

Context is only useful when everyone agrees whose word counts. This page names the four roles a workspace fills and the order in which their words win. The roles are generic: a workspace assigns its own people, teams and applications to them, and the package knows no names.

**Status:** a description of the role model the next version builds on. Today the consuming application supplies these decisions through its adapters and projections (see [How it works](architecture.md#ownership-at-a-glance)). Nothing on this page adds an authorization service.

## The four roles

| Role | Holds | Decides | Never does |
|---|---|---|---|
| Authority | a person, a group or a team | the binding words of the workspace: decisions, terms, definitions, acceptance | edit a product's pages for its owner |
| Owner | one member or team per product | the product's facts, claims, voice and look, inside the authority's words | override the authority |
| Checker | a check pipeline and its signing key | whether a page is well formed, fresh, consistent with the authority's words and signed | decide content |
| Reader | any application, capability pack or agent | nothing about the source; it uses the served version | change a page; it may send the owner a proposal |

## The truth order

```text
authority  >  owner  >  checker  >  readers
```

1. The authority's words win every conflict. They change only through a new capture of those words, never through a stored assertion.
2. Inside them, the owner decides a product's context.
3. The checker validates, versions and serves. A claim that speaks for the whole workspace, rather than one product, goes back to the authority before it counts.
4. A reader names the version it used in its receipt.

## Product context pages

The pages a product owner keeps, in the product's own repository, next to its code:

| Kind | Holds |
|---|---|
| `product` | what it is, for whom, requirements, acceptance, current state |
| `marketing` | positioning, audiences, claims with evidence, forbidden claims, offers, measures |
| `social` | channels, voice, approved claims, calls to action |
| `design` | look, type, marks and tokens |

Each page opens with the same front matter (`schema`, `product`, `kind`, `owner`, `status`, `last_reviewed`, `review_by`, `sources`). Each claim names a path and a verbatim marker that must still appear there. The schema file is planned; it is not in `schemas/` yet.

## A synthetic workspace

```yaml
roles:
  authority: [member:ada]
  checker: {pipeline: workspace-checks, key: workspace-door-key}
  readers: [app:newsletter, app:planner, agent:*]
products:
  - id: sample
    owner: team:sample-core
    context: {product: PRODUCT.md, marketing: MARKETING.md}
```

A second workspace can name a different authority, other owners and other readers with the same code. The planned `roles` block is not read by this version.

## Names that still carry one deployment's shape

The engine grew inside one organization, and a few identifiers still say so. They keep working; the generic names below are planned for a later minor version, with the current names accepted as aliases for at least one minor version and called out in the changelog.

| Current identifier | Where | Planned generic name |
|---|---|---|
| record kind `FounderAnchor` | `src/core/records.mjs`, `src/core/validate.mjs` | an authority anchor |
| visibility `founder-private` | `schemas/common.schema.json` | `authority-private` |
| review family `founder` | `schemas/common.schema.json` | `authority` |
| capture class `founder-note` | `schemas/common.schema.json`, `src/core/validate.mjs` | `authority-note` |
| gate keys `pillar_products`, `pillar_paths`, `pillar_story`, `pillar_entries`, `pillar_landing` | `src/core/project.mjs` | `group_*`: a product group served from a shared application |

Wire formats such as `origin-graph/v1` keep their identifiers; see [How it works](architecture.md#trust-and-freshness).
