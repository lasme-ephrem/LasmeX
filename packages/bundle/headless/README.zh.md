# lasmex-headless

[English](README.md) | 中文

LasmeX 一次性任务组合包。[`cordis.patch.yml`](cordis.patch.yml) 直接叠加在 [`lasmex-base`](../base/README.md) 之上：提供法语优先的 LasmeX 编码 persona 和工具模式、禁用 HMR（热模块替换）、将 Code Mode 的 worker 作为核心执行能力挂载、以显式 `allow` 变更准入公开项目记忆工具，并插入本包的 `headless-runner` 插件（配置为 `{task}`，从注入的 `headlessStartup` 提供方解析）。它不挂载任何 Host、HTTP server、Web runtime 或浏览器插件。

Loader 结算后，runner 读取共享的 [`ctx.agentDefaultModel`](../../core/agent-default-model/README.md)，通过 `ctx.agents` 创建一个全新的持久化 Agent（智能体），将任务作为普通用户消息提交，并等待完全停稳。它对 Session 执行 flush 后再汇总自身持有的持久化事件区间，将最后一条非空 assistant 文本写入 stdout，再经启动器提供的 `ctx.appExit` 宿主钩子（[`lasmex-cmdline`](../../boot/cmdline/README.md)）请求退出（最终 `turn/end` 完成 → 0，否则为 1）。最终结束原因为 `error` 时，还会将 code 与 message 写入 stderr；成功运行时 stderr 保持为空。进程不会打开监听端口。任务文本就是这个应用的命令行：普通 `headless-startup` 提供方（[`src/startup.ts`](src/startup.ts)）注入 `ctx.cmdlineArgs`（[`lasmex-cmdline`](../../boot/cmdline/README.md)），读取 `lasmex --profile headless "task"` 的位置参数、打印应用自己的 `--help`，并提供 `headlessStartup`；runner 注入该服务，再从惰性配置中读取任务。缺失或只有空白的任务会在 runner 激活前被拒绝。

## 模型体验

无，因为该组合包只组合由各自定义包持有并记录的模型可见 surface。

#### KV Cache 影响

组合包配置不变时，记忆 schema 保持前缀稳定。置顶记录增加受限请求后缀，不会改变先前已持久化的消息。

## 已知限制与暂缓事项

- **只提交一个任务**：runner 没有用于交互式后续输入的 surface；它会等待 Agent 在返回 idle 前完成的所有工作，并打印该区间内最后一条非空 assistant 消息。
- **`ctx.appExit` 由启动器持有**：在 LasmeX 启动器之外启动 headless profile 会在激活时明确报错，直到宿主提供该退出请求。
