# Agent Note: Documentation-site navigation and repository chrome

Status: implemented

English | [中文](2026-08-12-documentation-site-navigation-and-chrome.zh.md)

## Problem

The reference sidebar rendered its 43 subsystem pages first, ahead of every other group: `sectionOrder` in the VitePress config listed no position for the subsystem groups, nor for the group holding the Python SDK page, so `indexOf` returned `-1` and sorted them ahead of the ordered sections. Clicking the `参考` navigation item landed on the architecture page whose own sidebar entry was link 44 of 62, 1549px down a 2478px sidebar — outside the viewport. Four subsystem pages carried `order` values already taken by other pages in the same section, resolved only by `Array.prototype.sort` stability and the order the manifest's arrays happened to be concatenated.

The navigation bar named `/guide/` while the manifest published the guide's first page at `guide/quickstart.md`, so that item served a 404: written-down navigation targets drift from the routes the manifest publishes.

Separately, every canonical page carries lines written for its GitHub reader — a language switcher under the heading, and for some, a repository badge — which the site projected verbatim even though its navigation bar already offers locale and repository navigation.

## Decision

[website/docs.ts](../../../../website/docs.ts) owns section placement. `sections` declares the groups per locale, and `sectionSpec(locale, label)` returns a group's position and collapse behavior, throwing when a locale declares no placement for a label. A group absent from the declaration fails the build instead of sorting silently to the top. Placement is per locale because the French, English, and Chinese sidebars name their groups independently, and a shared label such as `SDK` cannot hold one rank against three different group sequences.

The root route is French, `/en/` is English, and `/zh/` is Chinese. `pairedPages()` projects each English/Chinese source pair into all three route trees: French routes carry reviewed French navigation and use reviewed French prose when it exists, English routes use the English source, and Chinese routes use the Chinese sibling. A French route backed by English prose renders a visible French notice that identifies the page as technical English content and points readers to the French interface and user guides. The root home maps the reviewed French [LASMEX.md](../../../../LASMEX.md) source directly. This keeps canonical Markdown in its owning repository tier without copying fallback content.

The reviewed French allowlist also defines the input to `verify-french-docs`, an executed `doc-sync` gate. It rejects an unpublished `.fr.md` file, a missing English source, and any divergence in heading, list, table, link, fenced-code, or inline-code order. Editorial review remains responsible for meaning and natural French; the gate protects the technical frame that translation must not change.

Subsystem pages are grouped by concern — overview, core and scopes, sessions and persistence, model and context, execution and tools, policy and interaction, platform and access — and the six topical groups render collapsed until one holds the page being read. The groups sort last within the reference sidebar: expanded, they outnumber every other group combined, so anything placed after them is reachable only by scrolling past the whole list. Page `order` derives from array position rather than a hand-written number.

`landingLink(locale, collection)` derives each navigation item's target from `orderedPages`, the same ordering the sidebar renders, so an item always opens its collection's first published page.

`projectedPageContent` in [scripts/project-doc-site.ts](../../../../scripts/project-doc-site.ts) drops the language-switcher line and the repository badge. The switcher match is confined to the first eight lines so a tutorial that shows the convention still renders its example. Source-level English/Chinese counterpart links route to `/en/` and `/zh/`; VitePress owns navigation into the French root.

The navigation-bar title is the LasmeX wordmark inlined into `siteTitle`, which VitePress renders as HTML. Inlining lets the mark's `currentColor` fills follow the active theme; `themeConfig.logo` renders an `<img>`, which freezes the mark at the colors its file declares and would need one asset per theme. The sidebar scrollbar rests invisible and appears while scrolling, marked by a `data-` attribute rather than a class because Vue rewrites `class` wholesale when it patches the element.

The site links to the LasmeX repository only as an explicitly labeled upstream. Edit links stay disabled until a real LasmeX fork origin exists, so readers are not directed to edit the upstream under the LasmeX identity.

## Alternatives considered

**A search tokenizer for Chinese queries.** Built and reverted. The premise — that MiniSearch leaves Chinese prose as untokenizable whole sentences — was tested against a term (`子代理`) that appears nowhere in the corpus; the Chinese pages write `Subagent` and `子 agent`. Measured against the unmodified index, `插件配置` returns 120 hits, `会话持久化` 85, `工作流` 28, `沙箱` 12, each ranking its own page first: `prefix: true` already reaches Chinese terms through the short tokens punctuation produces. Adjacent-character pairs grew the Chinese index from 1.23MB to 2.12MB for no gain. The attempt also surfaced a trap worth keeping: VitePress ships search-option functions to the browser through `Function.prototype.toString` and rebuilds them with `new Function`, so any such function that closes over a module-level constant throws in an empty scope and silently returns no results.

**Placing the subsystem groups directly after `概念`.** Rejected: it restores the architecture page to the top but leaves generated reference, the Cordis API, and the cookbook below 43 rows.

**Rewriting filename link text during projection.** The subsystem index table writes `[core.md](core.md)`, which reads as a repository file index on the site. `scripts/project-doc-site.spec.ts` asserts that exact row format, so the filenames are a deliberate convention rather than an oversight; changing what the site displays means changing the convention and its gate together, not working around them in the projector.

## Consequences

The Chinese reference sidebar measures 1452px with every subsystem group collapsed, against 2478px before, and the architecture page is its first entry. Section placement and collapse are declared in one manifest instead of split between the manifest and the config. `scripts/project-doc-site.spec.ts` pins route parity across three locales, source-language selection, navigation targets, section placement, and unique `order` values within each section. `verify-french-docs` prevents a reviewed French route from silently translating commands, identifiers, or links while the remaining root routes continue to declare their English content explicitly.

Canonical Markdown is unchanged by the chrome stripping — the switcher and badge still serve GitHub readers. The cost is that the projector now knows two presentation conventions of the source corpus, which a page written with a different switcher wording would not match.

The documentation-site lockup renders the exact-transparent cube logo (`website/public/full.svg`), referenced as an image rather than inlined: the ~1 MB embedded raster must not be duplicated into every rendered page (inlining it crashed the documentation build with a V8 abort). The app's wide sidebar renders the same embedded logo (`FullLogo`) and the hero and rail mount the embedded cube mark (`CubeMark`), while the favicon ships the embedded cube mark (`apps/web/public/favicon.svg`). A change to the product mark reaches the documentation site only by updating this copy.
