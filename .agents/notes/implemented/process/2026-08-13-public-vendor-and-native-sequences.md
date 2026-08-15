# Agent Note: npm access per release sequence

Status: implemented

English | [中文](2026-08-13-public-vendor-and-native-sequences.zh.md)

## Problem

The [three release sequences](2026-08-10-npm-release-sequences.md) must produce an installable public distribution. LasmeX is unscoped, while the vendored framework and Landlock packages retain the `@deepseek-ai` scope; scope alone therefore cannot express or enforce access.

A restricted dependency blocks a public consumer. Every LasmeX package declares the vendored framework as a `peerDependency`, and `lasmex-sandbox-local` declares the Landlock entry as a `dependency`. The three sequences must therefore remain public together even though they use different npm naming forms.

## Decision

Access is a property of each release sequence, not of the scope:

| Sequence | Members | `publishConfig.access` |
|---|---|---|
| vendored framework | the nine `vendor/*` packages | `public` |
| native | the three `native/landlock-run/packages/*` packages | `public` |
| LasmeX | unscoped `packages/*/*`, `apps/cli`, and `apps/web`; private desktop excluded | `public` |

`check-workspace-constraints.ts` holds every release manifest to `public`, which stops either a new scoped dependency or an unscoped LasmeX member from becoming inaccessible. The private desktop app is outside the npm release family.

**No publish path passes `--access`.** A single flag cannot serve sequences that disagree, and a flag overrides the manifest that owns the fact — so `publish.ts` passes none, and the native workflow continues to pass none. Each packed manifest decides.

Harness consumers reference the Landlock entry as `workspace:^` rather than `workspace:*`, so a published harness package accepts the entry's patch and minor releases instead of pinning one exact version. The entry keeps `workspace:*` for its two platform packages, where the binary must match the entry version exactly.

Access is a property of the package, not of a version. Every newly packed release member carries the public declaration that npm applies at publication.

## Alternatives considered

**Keep LasmeX restricted while its dependencies are public.** Rejected: it would leave the product distribution unavailable to outside consumers after its dependency graph had already become installable.

**Keep everything restricted and grant a read-only team instead.** `npm access grant read-only <org:team> <package>` is per-package with no scope wildcard, so covering the set means one grant per package plus a standing reconciliation job for every package added afterwards. It also only reaches organization members, which does not serve an installable public artifact.

**Publish public from the publish path instead of the manifests.** Impossible for a mixed scope — one `--access` flag cannot express two levels — and it would override the manifest that the workspace constraint already checks.

## Consequences

- **All three sequences are world-readable and not cleanly reversible.** Anything already downloaded or mirrored remains outside the publisher's control.
- **`lasmex` is installable without organization credentials once its version and dependencies have been published.** The release verification still packs cross-sequence dependencies locally so one pull request does not depend on publication order.
- **Payload policy carries more weight for every sequence.** `vendor/cordis` publishes `src` deliberately because its export map declares `./src/*`; the Landlock entry publishes `src/main.c` as a documented audit surface; LasmeX rejects source and declaration-map payloads.
- **An unauthenticated `npm view` is a usable publication check.** Public access distinguishes an absent version from an inaccessible private package.
