# lasmex-client-ui-mission

English | [中文](README.zh.md)

Browser-only consumer that registers the `mission` conversation view at order `5`. The dashboard combines the `goal`, `plan`, `permissions`, `todos`, `sessionStats`, `tokenUsage`, and `missionActivity` projections with live session and orchestration indicators. French, English, and Simplified Chinese dictionaries ship together; the current client locale selects the copy.

## Composition

Mount `lasmex-session-mission` on the Host with explicit validation-tool, command-pattern, and retention configuration, then mount this package in the Web client roster. The view waits for the `conversation.view` slot declaration and unregisters with its Cordis fiber.

Projection absence is shown as unavailable. A present empty goal, todo list, capability list, or validation list has its own neutral state. Counts are never synthesized from the paged conversation window. The history action uses the ordinary Session paging callback, while whole-log projection values remain stable as earlier pages load.

The orchestration card reads direct-child catalogs, session summaries, and background-job views already published by the Session list store. Healthy catalog children can be opened through their exact parent/child address. Summary-only children remain identifiable during catalog arrival but are not given a synthetic mode or navigation action. Empty, loading, error, diagnostic, activity, mode, and job lifecycle labels map only from states present in those client contracts.

## Privacy and accessibility

The component reads only projection values, the session's lifecycle, pending-count, queue-count, and paging fields, plus browser-safe child, session-summary, and background-job metadata. It does not read conversation nodes, messages, streaming chunks, reasoning, request headers, or tool results. Exact configured validation commands and background-job labels remain visible because their Host APIs explicitly publish those operational fields for human surfaces.

The dashboard uses sections with accessible headings, definition lists for paired labels and values, text labels alongside every colored state, a polite live status, and a keyboard-focusable history button. Styling consumes shared `--dsw-*` tokens only.

## Model Experience

### Request context and condition

#### What the model sees

Nothing. The `mission` view is a presentation consumer and contributes no prompt, message, tool schema, or session event.

#### Token effect

Zero direct or indirect model tokens.

#### KV Cache effect

No KV-cache effect.

## Known Limitations and Deferred Work

- A custom validation protocol needs a Host projection adapter before this view can display its result.
- The required product-behavior GIF is deferred until the assembled LasmeX Web server is stable enough for a real-flow recording.
