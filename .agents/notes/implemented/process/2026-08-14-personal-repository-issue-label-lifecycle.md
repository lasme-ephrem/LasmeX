# Agent Note: Repository-label Issue lifecycle

Status: implemented

English | [中文](2026-08-14-personal-repository-issue-label-lifecycle.zh.md)

## Problem

LasmeX is hosted by a personal GitHub account. The inherited Issue policy depended on organization-only native Issue Types, an organization ProjectV2, the experimental Issue field-values endpoint, and a separately installed GitHub App. The repository had none of those resources, so the lifecycle workflow was disabled and the pull-request policy would fail when it inspected a referenced Issue.

The repository still needs one queryable type, one lifecycle status, and an optional priority for every Issue. Those values must also drive pull-request reference checks and review handoffs without a second service or repository secret.

## Decision

Repository labels own Issue metadata. Exactly one `type/*` label selects `idea`, `feature`, `bug`, `research`, or `task`. Exactly one `status/*` label selects `inbox`, `backlog`, `ready`, `in-progress`, `in-review`, `done`, or `no-action`. At most one `p0`–`p3` label records priority. Pull requests keep the independent `kind/*`, `area/*`, and optional priority taxonomy; Issue-only labels are rejected on pull requests.

Issue templates apply their type label. The lifecycle workflow uses the repository `GITHUB_TOKEN` with `issues: write`: opening or reopening an Issue applies `status/inbox`, closing applies `status/done` or `status/no-action` according to the native close reason, and pull-request events update resolving Issues. A review request targets `status/in-review`; implementation events advance earlier active states to `status/in-progress`; a changes-requested review returns `status/in-review` to `status/in-progress`. Terminal states do not move.

Write-capable pull-request actions use `pull_request_target` and execute only the policy checked out from the default branch. They never check out, import, install, or execute pull-request code. Ordinary implementation actions run only for same-repository branches; a fork can trigger only the review-requested handoff, so untrusted metadata cannot advance arbitrary Issues on open, edit, synchronize, label, or reopen. GitHub grants only a read-only token to `pull_request_review` events from public forks and treats Dependabot pull requests the same way, so the workflow skips Dependabot and runs the changes-requested transition automatically only for same-repository branches. A fork review is skipped instead of failing or receiving elevated credentials. This follows GitHub's [trusted `pull_request_target` guidance](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target).

Status updates add the target label before removing other `status/*` labels. This preserves unrelated labels and avoids an intentionally empty status interval. The workflow's per-object concurrency group serializes events for one Issue or pull request, while validation detects duplicate or unknown metadata labels if concurrent resolving pull requests race on the same Issue.

The policy uses REST Issue and label endpoints only. It does not query Issue fields, GraphQL Projects, organization resources, status actors, or an installation token. The French audit comment is maintained by the built-in Actions bot and removed after the Issue becomes valid.

This decision supersedes only the native-Issue-Type clause in [unified GitHub label taxonomy](2026-08-08-unified-github-label-taxonomy.md) and the ProjectV2/status-actor storage in [event-directed PR review status commands](2026-08-10-event-directed-pr-review-status.md). Their pull-request taxonomy, reference parsing, event-command mapping, and terminal-state rules remain current.

## Verification

[Issue-management tests](../../../../.github/issue-management/policy.test.mjs) cover exact metadata cardinality, unknown labels, priorities, close-reason alignment, pull-request label separation, reference parsing, every lifecycle transition, and the exact REST label calls against a local HTTP server. [Workflow tests](../../../../scripts/ci-workflow.spec.ts) require `pull_request_target`, the built-in token, repository write permission, the same-repository review guard, and absence of GitHub App credentials. The repository workflow verifier also parses both workflow files and enforces pinned external actions.

## Alternatives considered

**Create an organization solely for ProjectV2 and Issue Types.** That would restore the upstream design but would make basic contribution policy depend on a new owner, migration, Project configuration, and App installation. The personal repository is the product's chosen public origin.

**Give fork review workflows a write token or repository secret.** GitHub deliberately withholds both from public forks. Elevating untrusted review code would create a supply-chain path; `pull_request_target` is limited to the trusted PR action subset, while fork review submissions remain read-only.

**Keep the workflow disabled until those resources exist.** Disabled policy is not a product capability. Pull-request validation would still call an endpoint unavailable to this repository.

**Store lifecycle state in comments or a checked-in file.** Either duplicates GitHub's queryable metadata and introduces parsing or write-conflict state. Labels already provide filtering, automation events, and repository-native editing.

**Preserve status-actor ownership.** ProjectV2 exposed the last status actor, but labels do not provide an atomic actor-guarded mutation. Event audit history could approximate it at additional request and race cost. This repository instead treats explicit review handoffs as authoritative workflow commands and protects only terminal states.

## Consequences

Issue policy works immediately on the personal repository with no custom App, organization Project, or policy secret. Contributors can filter and edit all metadata from the standard label interface, and the same values feed pull-request priority checks.

Type and status labels must exist before templates or automation can apply them. Repository bootstrap therefore creates the complete closed sets and keeps their descriptions aligned with this note. A fork PR enters automated lifecycle only when review is requested. Its later implementation and changes-requested events do not change the Issue label automatically; a maintainer may change it manually or request review again. A future move to organization-owned native fields requires one atomic migration of labels, policy, templates, workflows, tests, and this authority; both representations must never remain active together.
