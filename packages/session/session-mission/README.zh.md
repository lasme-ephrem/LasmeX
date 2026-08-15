# lasmex-session-mission

[English](README.md) | 中文

`missionActivity` 全日志会话投影的仅宿主贡献方。它汇总实际能力使用、最近配置的验证命令、审批结果、最新待办事项快照和最新已知非成功轮次结果，同时不添加会话事件，也不更改 agent loop（智能体循环）。[任务投影决策](../../../.agents/notes/implemented/feature/2026-08-14-session-mission-activity-projection.md)记录了该视图复用现有持久事实的原因。

## 配置

所有字段都是必填的部署选择；插件没有隐藏的运行默认值。

| 字段 | 含义 |
|---|---|
| `maxRecentValidations` | 限制完整 `validations` 数组的正整数。 |
| `validationCommandTools` | 对其字符串 `command` 参数和渲染后 shell 状态进行解释的精确工具名称。条目必须非空且唯一；空数组禁用命令感知分类。 |
| `validationCommandPatterns` | 与完整命令进行不区分大小写匹配的、唯一且非空的 JavaScript 正则表达式源。任一模式匹配时，该命令即为验证；空数组不记录验证。无效正则表达式会使插件加载失败。 |

## 投影语义

### 能力和验证

原生调用从 `tool/call` 和 `tool/result` 折叠。Code Mode 排除外层 `run_code` 传输，并从 `tool/code-dispatch-start` 和 `tool/code-dispatch` 折叠其实际子调用，因此一项操作绝不会被重复计数。能力按工具名称排序，并报告开始数、结算数、失败数、运行中调用数和最新开始时间。

配置的命令工具还会解码 lasmex shell 的退出、信号、超时和沙箱标记。匹配的命令以 `running` 状态进入 `validations`，随后以持久时间戳和墙钟时间变为 `passed` 或 `failed`。在 `turn/end` 时仍处于打开状态的调用会以失败结算，其仍保留的验证会变为 `interrupted`。超过配置上限后，较旧验证行会从完整数组中移除。

### 审批、清单和结果

`approval/asked` 和 `approval/decided` 生成全会话审计总数，但不保留提问原因。最新 `todo/write` 快照在后续轮次中仍然可见。`turn/end` 记录内置的阻塞、错误、token 上限、中断和取消结果；完成的轮次或扩展定义的原因会清除先前的内置结果。

## 模型体验

### 请求上下文和条件

#### 模型看到的内容

无。`missionActivity` 是宿主读取投影，绝不会进入派生消息历史、系统提示词或工具 schema。

#### Token 影响

直接和间接模型 token 均为零。

#### KV Cache 影响

无。折叠和提供该投影不会更改任何模型请求前缀或独立模型调用。

## 已知限制与延后工作

- **仅限配置的命令协议** — 验证状态要求配置的工具具有字符串 `command` 参数和 lasmex shell 渲染的结果标记；使用其他参数或结果协议的自定义验证工具在添加显式适配器之前只会出现在能力总数中。
