# LasmeX Python SDK

English | [中文](README.zh.md)

Python subprocess SDK for driving LasmeX over JSON-RPC stdio. The runtime inherits provider variables such as `DEEPSEEK_BASE_URL` and `DEEPSEEK_API_KEY`, so callers can use real model endpoints directly or point those variables at a local proxy.

Install the `lasmex-sdk` distribution from PyPI; its import module is `lasmex`:

```sh
python -m pip install lasmex-sdk
```

Installing `lasmex-sdk` installs the exact same-version `lasmex-runtime-bin` platform wheel. The normal entry point therefore needs no executable argument:

```py
from lasmex import LasmeX

with LasmeX() as lasmex:
    result = lasmex.run("Say hi.")
```

`LasmeX` keeps its lazily started runtime subprocess for reuse across calls. Use it as a context manager, as above, or call `close()` explicitly when finished.

By default, the SDK launches the bundled single-file `lasmex-jsonrpc-agent` executable from the `lasmex-runtime-bin` package and injects that package's default configuration (the stdio JSON-RPC server, agent core, preloaded DeepSeek adapter, JSONL session persistence with an explicitly composed semantic checkpoint policy, local bash) via `LASMEX_CORDIS_CONFIG`. To run a plugin composition of your own, keep the `lasmex-sdk-jsonrpc-server` entry in the config and pass the Cordis config path.

```py
from lasmex import LasmeX

with LasmeX(
    provider="deepseek-official",
    model="deepseek-v4-flash",
    max_tokens=49_152,
    cordis="examples/jsonrpc-agent/cordis.yml",
) as lasmex:
    result = lasmex.run("Make the requested code change.")
```

`provider` selects a provider route registered by the chosen Cordis composition; `model` is the model id resolved by that adapter. `max_tokens` is an optional positive per-request output-token cap for the root agent and its in-process descendants; omission leaves the provider default in control. Compaction summaries keep the separate limit configured by their compaction plugin. The bundled default composition registers `deepseek-official`. A custom composition can mount `llm-pi-ai`, configure provider-specific credentials/endpoints there, and select any provider/model present in pi-ai's installed catalog.

The [Python SDK tutorial](../../docs/user/guide/python-sdk.md) provides an ordered installation and first-run path without the Web UI. The [`jsonrpc-agent` example](../../examples/jsonrpc-agent/README.md) owns the complete standalone Cordis file used there.

`Session.run()` owns an activity interval from its prompt's durable inbox receipt through the next whole-agent idle and returns `RunResult(session_id, final_response, finish_reason, events, notifications, session_root)`. `final_response` is the last committed root-session assistant text in the interval. `finish_reason` is the `kind` of the last root-session `turn/end` in the interval, such as `completed`, `max-tokens`, or `error`, and is `None` when no turn ended. A `turn/end` without a string `data.reason.kind` violates the runtime protocol and raises `SdkProtocolError`. Both result fields describe the owned interval rather than an output or ending causally assigned to the prompt. Steering, injected context, and other queued work may contribute before idle.

`LasmeXClient` retains discovered subagent ancestry for the lifetime of the runtime process. During each `Session.run()`, `RunResult.notifications` and `on_notification` receive the root session and all known descendant notifications in wire order, including nested subagent lifecycle and session events. `RunResult.events` contains root-session events only, so descendant messages cannot replace the root response. The low-level `session_prompt()` returns the queued `MessageId` immediately; callers that bypass `Session.run()` own any later activity boundary themselves.

The same behavior can be selected for the runtime subprocess with `LASMEX_CORDIS_CONFIG`. The injection lives in `LasmeXClient.start()`, so the low-level client's default launch gets it too: when the launch resolves to the bundled runtime and neither `cordis` nor a non-empty `LASMEX_CORDIS_CONFIG` is set (the runtime treats an empty value as absent, and so does the injection check), the bundled default configuration is used; an explicit `runtime_bin`, `bridge_bin`, or `launch_args_override` disables the injection entirely. See the [sdk-runtime README](../sdk-runtime/README.md) for the runtime carriers (production exe vs dev-only node closure) and how to obtain them.

`LASMEX_CORDIS_CONFIG`, `LASMEX_SESSION_ROOT`, `LASMEX_CWD`, and `LASMEX_RUNTIME_MODE` are runtime environment interfaces, not Python distribution or import names.

`cwd` and `runtime_cwd` are resolved to absolute paths before subprocess launch, environment injection, and the wire handshake. The public API exposes only applied options: deployment persona and persistence belong in `cordis.yml`, while `session_root` remains the high-level convenience that sets `LASMEX_SESSION_ROOT`.
