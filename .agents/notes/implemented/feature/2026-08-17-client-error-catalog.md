# Agent Note: Client error catalog — every wire error speaks the active locale

Status: implemented

English | [中文](2026-08-17-client-error-catalog.zh.md)

## Problem
Runtime failures reached the UI as raw English strings: each renderer hand-rolled `${error.message} (${error.code})`, so toasts, goal alerts, and command-failure surfaces mixed English provider messages with the localized interface. Adding a new `RpcError` code had no single place that says "this code needs a catalog entry".

## Decision

Own a client error catalog in `lasmex-client-locale`:

- `error-keys.ts` maps every `RpcError` code to an `error.*` catalog key, exhaustive by construction (`satisfies Record<RpcError['code'], string>`), so a new host code fails the client typecheck until it gets a key and a dictionary entry.
- `describeError(error, t)` is the single presenter: catalog lookup with details and the host message as interpolation params, plus two fallbacks. An unknown wire code, or a rendering namespace whose typed union predates a key, shows the raw `${message} (${code})` — the previous format — instead of echoing a catalog key.
- The 43 codes live in the shared `common` vocabulary (44 `error.*` keys per dictionary), reachable from every rendering namespace through the common lookup chain.
- The `LocaleRuntime` service exposes `describeError(error)` over its `common` bind; `InputBar` and `GoalBar` receive it through their slot injects (the client bundle purity gate forbids cross-plugin value imports, so the catalog is consumed as a service method, never imported).
- Tool-call surfaces keep `name: code` identifiers technical — stable identifiers, not prose.

## Alternatives considered

- **Per-component dictionaries** — each package carries its own error strings, but 43 shared codes would duplicate 44 keys per package and drift between them.
- **Translate the provider `message` verbatim** — provider prose is not stable enough to key on, and details interpolation would break.
- **Host-side localization** — the host would need a locale context per connection; the error travels once and renders in every client, so the client is the right side.
- **Localize the tool-call `name: code` labels** — they are identifiers the model consumes, so translating them would break matching; kept technical.
- **Reverse the `ui-plan` English error-surface policy in this change** — out of scope; the documented policy survives unchanged and may be revisited separately.

## Consequences

- A new `RpcError` code is a two-file change (host error map plus `error-keys.ts`) before it compiles, then one line per dictionary — the catalog cannot silently fall behind.
- Unknown wire codes degrade to the old raw format instead of breaking the render.
- Non-technical error prose now comes from the dictionaries; the locale suite covers every code against the French dictionary, and the `input-bar` and `goalbar` suites assert the rendered copy.
- `ui-plan` failure strings remain English under the existing error-surface policy.
