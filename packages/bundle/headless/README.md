# lasmex-headless

English | [中文](README.zh.md)

The LasmeX one-shot bundle. [`cordis.patch.yml`](cordis.patch.yml) rides directly over [`lasmex-base`](../base/README.md): it supplies the French-first LasmeX coding persona and tool mode, disables HMR, mounts Code Mode's worker as a core execution capability, exposes project-memory tools with explicit `allow` mutation admission, and inserts this package's `headless-runner` plugin (config `{task}`, resolved from the injected `headlessStartup` provider). It mounts no Host, HTTP server, Web runtime, or browser plugin.

After the Loader settles, the runner reads the shared [`ctx.agentDefaultModel`](../../core/agent-default-model/README.md), creates one fresh persisted Agent through `ctx.agents`, submits the task as an ordinary user message, and waits for quiescence. It flushes the Session before folding the owned durable event interval, writes the last non-empty assistant text to stdout, and requests exit through the launcher-provided `ctx.appExit` host hook ([`lasmex-cmdline`](../../boot/cmdline/README.md)) (final `turn/end` completed → 0, otherwise 1). A terminal `error` reason also writes its code and message to stderr; successful runs keep stderr empty. The process opens no listening port. The task text is this app's command line: the ordinary `headless-startup` provider ([`src/startup.ts`](src/startup.ts)) injects `ctx.cmdlineArgs` ([`lasmex-cmdline`](../../boot/cmdline/README.md)), reads the positional argument of `lasmex --profile headless "task"`, prints the app's `--help`, and provides `headlessStartup`; the runner injects that service and reads its task from lazy config. A missing or whitespace-only task is rejected before the runner activates.

## Model Experience

None, as the bundle only composes model-facing surfaces owned and documented by their defining packages.

#### KV Cache effect

The memory schemas are prefix-stable while the bundle configuration is unchanged. Pinned records add a bounded request suffix and do not alter prior persisted messages.

## Known Limitations and Deferred Work

- **One submitted task only** — the runner has no interactive follow-up surface; it waits through any work the Agent completes before returning to idle and prints the last non-empty assistant message in that interval.
- **`ctx.appExit` is launcher-owned** — booting the headless profile outside the LasmeX launcher fails loud at activation until the host provides the exit request.
