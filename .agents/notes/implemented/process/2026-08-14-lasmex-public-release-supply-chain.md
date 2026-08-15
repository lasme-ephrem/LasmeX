# Agent Note: LasmeX public release supply chain

Status: implemented

English | [中文](2026-08-14-lasmex-public-release-supply-chain.zh.md)

## Problem

LasmeX publishes one product version through npm, two PyPI projects, and native desktop artifacts. Independent manual uploads can expose a partial version, mutable GitHub Action tags can change the build without a repository change, registry tokens outlive one run, and the inherited CI depends on private runners unavailable to the public fork. The unscoped npm names also remain vulnerable to capture until their first publication.

The vendored Cordis and Landlock packages retain the upstream `@deepseek-ai` scope. Public access remains required by the [npm access decision](2026-08-13-public-vendor-and-native-sequences.md), but this fork has no authority to publish into that scope.

## Decision

The repository version, all LasmeX npm manifests, both Python project manifests, the runtime deploy root, and the private desktop manifest carry one stable version. `verify-distribution.ts` rejects prerelease spelling, disagreement, missing platform commands, a Python runtime dependency that does not pin the same version, or public npm descriptions that use the retired `dsh-*` package identity or treat LasmeX as a common noun. Release commands derive the version from these manifests, and publication requires the exact `lasmex-v<version>` tag. Creating the first tag remains a separate owner action after the pre-release format policy is retired.

`release.yml` is the only public product publication workflow. It builds npm tarballs, four Python wheels, and Windows, macOS, and Linux desktop distributions from the tagged commit. Syft scans extracted npm tarballs, wheel contents, desktop archives, expanded Electron ASAR files, and the exact Electron runtime manifest. An inventory gate requires every LasmeX npm package, both Python distributions, the desktop app, and Electron at their exact versions. The release bundle contains the resulting SPDX JSON SBOM and hashes. GitHub artifact attestations cover the distributable subjects, Squirrel `RELEASES`, desktop manifests, `SHA256SUMS`, and the SBOM. A protected `github-release` job creates or refreshes a draft and uploads every asset before a registry write. The draft becomes public only after npm, `lasmex-runtime-bin`, and `lasmex-sdk` succeed. A failed registry job leaves a recoverable draft. npm reruns compare registry integrity with the packed tarball, while PyPI reruns compare each remote filename's SHA-256 with the local wheel and upload only absent files; a same-version content difference stops publication.

npm and PyPI publication use GitHub OIDC trusted publishing from protected environments. npm cannot configure a trusted publisher before a package exists, so `npm_authentication=bootstrap` is a distinct one-time path protected by the `npm-bootstrap` environment. It accepts only `LASMEX_NPM_BOOTSTRAP_TOKEN`, creates the absent npm packages with explicit npm provenance backed by GitHub's OIDC token, and leaves the GitHub release as a draft without publishing PyPI. An owner then runs `pnpm run release:configure-npm-trust -- --apply` from npm CLI 11.15 or newer with account-level 2FA. Before each write, the command reads the current relationship and skips only an exact GitHub repository, workflow, environment, and publish-permission match; any different or malformed relationship fails, so an interrupted run resumes safely. The bootstrap token is revoked before the workflow is rerun with `npm_authentication=oidc`. Normal npm and all PyPI publication accept no long-lived token. PyPI attestations remain enabled, and publication jobs receive only `contents: read` plus `id-token: write`. The GitHub draft and finalization jobs alone receive `contents: write`; the attestation job alone also receives `attestations: write`. Before the draft, an unauthenticated registry preflight rejects an existing name whose source metadata is missing or points outside `https://github.com/lasme-ephrem/LasmeX`. Repository URLs are self-declared metadata, not proof of maintainership; npm or PyPI authentication remains the authoritative ownership check.

Every external GitHub Action reference is pinned to a full commit SHA, Syft is pinned to an exact version, and manylinux containers are pinned by digest. Workflows use explicit GitHub-hosted operating-system labels rather than `-latest`. GitHub updates the image behind an explicit hosted label and does not expose an immutable image digest to ordinary hosted jobs, so the job log's image release remains the reproducibility record for that unavoidable layer. `verify-workflows.ts` rejects floating action or Docker references, mutable hosted aliases, token-based normal npm publication, disabled PyPI attestations, private upstream runner labels, and missing protected-environment permissions. Required CI runs on GitHub-hosted Linux, macOS, and native Windows, with the Wine Windows check retained as an independent compatibility signal. CodeQL analyzes JavaScript and TypeScript, dependency review rejects newly introduced high-severity advisories, and the product release runs `pnpm audit --prod --audit-level high`. Same-major workspace overrides establish patched floors for vulnerable transitive paths.

The desktop release uses Electron build output plus a staged ASAR rather than Electron Packager. Windows invokes MakerSquirrel directly on the staged bundle; macOS produces a signed and notarized ZIP; Linux produces a portable tarball. Release-mode Windows and macOS builds require an HTTPS update base URL embedded in the sealed ASAR. Signed jobs can run only when `GITHUB_REF` is the manifest-derived `lasmex-v<version>` tag and that tag resolves to `GITHUB_SHA`; only those jobs enter `desktop-signing` and receive signing secrets. Separate unsigned jobs receive no signing environment, signing secret, update URL, or release mode. Unsigned validation builds record `signed: false`; release publication requires signing on Windows and macOS, while Linux records that its portable archive is unsigned and has no integrated updater.

The vendor and Landlock workflows build, pack, and validate their upstream-scoped artifacts but contain no publication job. Publishing those names remains the upstream scope owner's responsibility. The fork preserves their source attribution and uses their local tarballs only to prove that LasmeX installs before the registry has matching dependencies.

Documentation deploys from `master` through GitHub Pages with the repository base path supplied by Pages configuration, a protected `github-pages` environment, and only `pages: write` plus OIDC on the deploy job. No custom domain is assumed.

## Alternatives considered

**Publish each ecosystem independently.** Rejected: users could see a GitHub release or SDK version whose required npm, runtime, or desktop artifacts never completed.

**Keep registry automation tokens as a fallback.** Rejected: a fallback silently bypasses the short-lived OIDC identity and keeps a reusable credential in repository state.

**Publish vendored and native packages from the fork.** Rejected: package readability does not grant authority over the upstream npm scope.

**Reference action major tags.** Rejected: Dependabot can propose reviewed SHA updates, while a moving tag can replace executed code without changing this repository.

## Consequences

- The first stable release requires the protected npm bootstrap, interactive trust configuration for every newly created package, token revocation, and an OIDC rerun. Later releases start directly with OIDC.
- The stable release cannot complete until repository environments, npm and PyPI trusted publishers, desktop signing material, and the Pages source are configured externally.
- The GitHub release is atomic from the user's perspective, but npm and PyPI are immutable registries rather than one transaction. A failed run resumes from the draft and skips byte-identical versions already accepted; a digest mismatch requires a version bump or an investigation.
- Package-name availability and source metadata are checked immediately before publication but cannot reserve an absent name or prove registry ownership. The first authenticated publication remains a time-sensitive owner operation.
- Action updates require a reviewed SHA change. Production dependency advisories at high or critical severity block the release.
- Private vulnerability reports use GitHub's repository-native reporting channel; no email address or third-party intake service is invented.
