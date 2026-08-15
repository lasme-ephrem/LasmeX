# Memory packages

English | [中文](README.zh.md)

Project-scoped long-term memory is one capability seam:

| Package | Role | Cordis surface |
| --- | --- | --- |
| [`memory`](memory/README.md) | Service Definition and branded project-memory types | `ctx.memory` |
| [`memory-storage-domain`](memory-storage-domain/README.md) | Durable provider over `ctx.storageDomain` | provides `ctx.memory` |
| [`tool-memory`](tool-memory/README.md) | Model-facing list, search, read, save, forget, and pinned context Consumer | reads `ctx.memory`; contributes to `ctx.tools` and `ctx.systemPrompt` |

The provider owns record and query bounds. The Consumer owns mutation admission and derives every project from the calling Session `cwd`; there is no implicit global scope or automatic conversation extraction. See the [subsystem reference](../../docs/subsystems/memory.md).
