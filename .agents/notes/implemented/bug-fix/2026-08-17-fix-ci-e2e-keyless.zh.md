# Agent Note：首次带密钥 e2e 运行揭示的无密钥 e2e 夹具漂移

Status: implemented

[English](2026-08-17-fix-ci-e2e-keyless.md) | 中文

## Problem

`E2E (real DeepSeek API)` 作业在缺少 `DEEPSEEK_API_KEY` 时会在 preflight 阶段失败，因此 `pnpm run test:e2e` 中包含的无密钥 e2e 测试实际上从未在 CI 中运行过。配置密钥后的首次运行暴露了四处预期早于当前产品行为的夹具，以及一个匹配了错误通知的 shell 测试谓词。

## Decision

在不触碰产品代码的前提下修正预期与夹具：

- `examples/jsonrpc-agent/tests/keyless-smoke.e2e.ts` 按当前语言环境期待加载器的失败即响消息：`échec du chargement de l'arbre de plugins`（英文 `plugin tree failed to load` 已不存在）。
- `packages/goal/goal/tests/goal.e2e.ts` 固定 `CLI_MOCK_TOOL=bash`——脚本模型默认调用 `memory_list`，而 goal-domain 组合并未挂载它（它提供的是 `bash`）。
- 两个 `mock-delegating-llm.ts` 子代理夹具只在最后一个消息里查找工具结果，但 agent loop 会在工具结果之后追加插件续接通知；它们现在改为向后扫描消息查找工具结果，与 headless `cli-mock-llm.ts` 已采用的模式一致。
- `packages/subagent/subagent-acp/tests/loader-composition.e2e.ts` 增加 `processTimeoutMs: 120_000`（两个 harness runtime 依次启动），与其 SDK 双胞胎保持一致。
- `packages/shell/tool-bash/tests/integration.spec.ts` 将后台任务通知谓词收窄为 `tool-jobs` 完成通知；loop 自身的 `agent-loop` 续接通知并非该测试等待的信号。

## Alternatives considered

- **在单独作业中运行无密钥测试**——否决：它们属于现有 e2e 套件，第二个作业会重复 runner 与 Loader smoke 搭建。
- **禁用这些漂移测试**——否决：它们覆盖真实的跨运行时 cwd 继承与失败即响的加载器行为。
- **回退产品以满足过时预期**——否决：产品行为（法语启动消息、续接通知、仅 bash 的 goal 域）是有意为之。

## Consequences

- 无密钥测试现在能在带密钥的 e2e 作业中通过，并继续守护其覆盖范围。
- shell 后台任务测试得以区分 loop 续接通知与真实的完成通知，消除了 macOS `darwin parity` 与 Linux coverage 的偶发失败。
