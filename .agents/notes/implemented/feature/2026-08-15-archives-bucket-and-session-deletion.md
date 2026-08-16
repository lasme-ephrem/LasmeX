# Agent Note: Archives bucket and durable session deletion

Status: implemented

English | [中文](2026-08-15-archives-bucket-and-session-deletion.zh.md)

## Problem

Archiving a session hides it from every grouping surface, but no surface shows the archived sessions afterwards, so an archived conversation is invisible and unrecoverable through the UI. Nothing in the product deletes a session: the durable session log exists until the filesystem removes it by hand. The workspace browser therefore cannot offer the natural archive workflow — archive now, review or permanently delete later.

## Decision

The workspace browser derives an Archives bucket that appears only while the registry-global archive set is non-empty. Its rows keep the Host archive order and offer two menu actions: restore and delete. Deleting is the one destructive path for a session and opens a browser-owned confirmation dialog before committing.

An archived session opens in read-only form: the workspaces projection flags the current session's composer frozen (a `Session`-snapshot `archived` bit, mirrored from the `removed` freeze) and unarchiving unfreezes the same open composer in place. This replaces the earlier clear-on-archive sweep — archived rows are clickable now. The Host refuses conversation writes (`session.prompt`, `session.updateQueue`) on archived sessions with `session-archived`; rename/fork stay available. Archiving a still-running session is refused with `session-running` so a live agent can never append behind the frozen view; the browser surfaces that refusal in an explanatory dialog.

Restoration is `unarchiveSession`: the registry removes the archive entry only — the workspace account was never touched, so the row returns to its stored position.

Deletion is a complete capability seam. `SessionPersistence` gains an abstract `delete(id)` (idempotent: an absent session resolves). The JSONL backend removes the per-session directory; the SQLite backend deletes the `sessions` row with `ON DELETE CASCADE` for events. Before deleting, the gateway closes the session's agent: a still-running agent is refused with `session-running`, and an idle live agent — resumed through the resolver, created by `session.create`, or created by `session.fork`, whose handles the gateway retains — is disposed, so opening, creating, or forking a session never blocks its deletion. `WorkspaceRegistry.deleteSession(sessionId)` rejects a remaining live session with `WorkspaceLiveSessionError` and an unknown id with `WorkspaceUnknownSessionError`, drops the header index, deletes the stored log, detaches every workspace account (read from the durable record, not the header-filtered getter), removes the archive entry, and emits the new `workspace/session-removed` Cordis event. The API proxy maps that event to the existing `host/session-removed` frame, which already retires sessions from client lists.

The wire seam is `workspace.deleteSession` (`{ sessionId }` → `{ archivedSessionIds }`), with business errors `session-not-found` and the new `session-live` code. `workspace.unarchiveSession` shares the archive payload shape. The runtime installs the returned archive set from the unary echo, like archive.

Archiving stays non-destructive and keeps its accounting slot; only explicit deletion destroys a log. Ungrouped and Archives buckets are not workspaces: their headers carry no workspace menu and no create action. The Archives key joins the browser's account-key retain sweep, so the cleanup that follows a deletion cannot collapse the expanded bucket.

## Consequences

Archived sessions are visible under Archives in grouped mode; flat-list mode and search still hide them, and the bucket spawns or disappears with the archive set. Clicking an archived session opens its conversation frozen (composer disabled with its own placeholder); restoring it from the row menu returns the row to its workspace and unfreezes an open composer in place. Archiving a running session shows the explanatory refusal instead of silently succeeding. Conversation writes from any client are refused while archived. Deleting an archived session removes its durable log — even when the session was opened read-only first (its resumed agent closes first) — so the action is guarded by a confirmation dialog and marked as a dangerous menu row. A still-running session cannot be deleted; the Host rejects with `session-running` and the dialog surfaces the message. Unknown sessions keep failing with `session-not-found`.

The archive workflow becomes reviewable, restorable, and terminable from the UI, and durable session deletion exists as a seam every backend implements.

## Alternatives considered

| Alternative | Contract mismatch |
|---|---|
| Delete from any group's row menu | The unguarded delete verb would reach ordinary rows; the requested workflow is archive-then-delete, and Archives keeps the destructive action in one reviewed place. |
| Auto-delete on archive | Archiving promises retention (log and accounting slot), and silent data loss contradicts that promise. |
| Keep archived sessions unopenable | The row is visible and clickable, so a dead click would read as a bug; read-only opening makes the archive consultable. |
| Keep the clear-on-archive sweep | A frozen-in-place view serves both the local archive and a remote tab's frame with one rule, and restoration can then unfreeze without a reload. |
| Allow archiving a running session | A live agent would keep appending to the log behind the frozen read-only view; the Host refuses with `session-running` and the UI explains. |
| Block rename/fork on archived sessions | Those are harmless metadata writes; only conversation writes (prompt/queue) are refused. |
| Registry deletes through the header-filtered `entity.sessionIds` | After dropping the header index the getter no longer reports the id, so the durable record would keep a ghost entry until the next bootstrap; reading the record detaches it immediately. |
| Reuse an existing error code for live sessions | `session-not-found` names a miss, not a live refusal; a dedicated `session-live` code lets the UI say "close it first". |
