# lasmex-memory

English | [中文](README.zh.md)

Service Definition for LasmeX long-term memory. `ctx.memory` exposes project-scoped reads, bounded list and literal search, explicit save and forget mutations, and provider limits that Consumers validate before activation.

## Project ownership

`projectMemoryScope(cwd)` accepts only an absolute working directory and applies the current platform's path normalization. Every operation requires that branded scope. The service has no global scope, no fallback to `process.cwd()`, and no cross-project read by id.

`MemoryId` and `ProjectMemoryScope` are branded strings. Providers create ids; Consumers derive project scopes from the Agent Session header rather than model input.

## Service API

- `read({ project, id })` returns one complete immutable record or `undefined`.
- `list({ project, limit })` returns recent content-free summaries.
- `listPinned({ project, limit })` returns recent complete pinned records for bounded request assembly.
- `search({ project, query, limit })` returns literal matches with bounded previews.
- `save(request)` creates or replaces one complete record.
- `forget({ project, id })` deletes a record only when it belongs to the addressed project.

`MemoryService.limits` publishes the active record, query, result, preview, and per-project capacity caps. Providers reject requests beyond these caps rather than clamping them silently.

## Model Experience

### Provider-independent memory state

#### What the model sees

Nothing directly. This package registers no prompt, context, or tool. A Consumer may expose selected `ctx.memory` records through its own documented model surface.

#### Token effect

Zero from this package alone. Record content costs tokens only when a Consumer renders it.

#### KV Cache effect

Independent. Service operations do not modify a model request; a rendering Consumer owns any cache effect.

## Known Limitations and Deferred Work

- **Path identity follows the current host platform** — normalization does not resolve symlinks or canonicalize filesystem case. Deployments that move the same project between path spellings must choose a higher-level workspace identity before replacing this scope rule.
- **Mutation authorization belongs to Consumers** — the Service Definition cannot infer whether a caller is model-driven, interactive, or trusted. `lasmex-tool-memory` owns the mandatory model-mutation policy.
