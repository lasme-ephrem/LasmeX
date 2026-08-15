# Agent Note：仓库标签驱动的 Issue 生命周期

状态：已实现

[English](2026-08-14-personal-repository-issue-label-lifecycle.md) | 中文

## 问题

LasmeX 托管在个人 GitHub 账号下。继承的 Issue 策略依赖仅组织可用的原生 Issue Type、组织 ProjectV2、实验性的 Issue field-values 端点，以及单独安装的 GitHub App。仓库并没有这些资源，因此生命周期工作流处于禁用状态，而拉取请求策略在检查关联 Issue 时也会失败。

仓库仍需为每个 Issue 提供一个可查询的类型、一个生命周期状态和一个可选优先级。这些值还必须驱动拉取请求引用检查与评审交接，且不能引入第二项服务或仓库密钥。

## 决策

Issue 元数据由仓库标签负责。必须且只能有一个 `type/*` 标签，取值为 `idea`、`feature`、`bug`、`research` 或 `task`。必须且只能有一个 `status/*` 标签，取值为 `inbox`、`backlog`、`ready`、`in-progress`、`in-review`、`done` 或 `no-action`。优先级最多有一个 `p0`–`p3` 标签。拉取请求继续使用独立的 `kind/*`、`area/*` 和可选优先级分类；Issue 专用标签在拉取请求上会被拒绝。

Issue 模板应用对应的类型标签。生命周期工作流使用具备 `issues: write` 权限的仓库 `GITHUB_TOKEN`：新建或重新打开 Issue 时应用 `status/inbox`，关闭时根据原生关闭原因应用 `status/done` 或 `status/no-action`，拉取请求事件则更新其解决型引用的 Issue。请求评审时目标为 `status/in-review`；实现事件将较早的活动状态推进到 `status/in-progress`；请求修改的评审把 `status/in-review` 返回到 `status/in-progress`。终态不会移动。

可写的拉取请求动作使用 `pull_request_target`，并且只执行从默认分支检出的策略。它们绝不检出、导入、安装或执行拉取请求代码。普通实现动作只对同仓库分支运行；fork 只能触发请求评审的交接，因此不可信元数据无法通过新建、编辑、同步、加标签或重新打开任意推进 Issue。GitHub 只向公共 fork 的 `pull_request_review` 事件提供只读令牌，并以同样方式限制 Dependabot 拉取请求，因此工作流跳过 Dependabot，请求修改的转换也只对同仓库分支自动运行。fork 评审会被跳过，而不会失败或获得提升的凭据。此做法遵循 GitHub 的[可信 `pull_request_target` 指南](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target)。

状态更新先添加目标标签，再移除其他 `status/*` 标签。这样既保留无关标签，也避免故意产生无状态区间。工作流按单个对象设置并发组，串行处理同一 Issue 或拉取请求的事件；如果多个解决同一 Issue 的拉取请求发生竞态，验证会发现重复或未知的元数据标签。

策略只使用 REST Issue 和标签端点。它不查询 Issue fields、GraphQL Projects、组织资源、状态操作者或安装令牌。法语审计评论由内置 Actions 机器人维护，并在 Issue 合法后删除。

本决策只取代 [统一 GitHub 标签分类](2026-08-08-unified-github-label-taxonomy.md) 中原生 Issue Type 的条款，以及 [事件驱动的 PR 评审状态命令](2026-08-10-event-directed-pr-review-status.md) 中 ProjectV2 与状态操作者的存储方式。两份记录中的拉取请求分类、引用解析、事件命令映射与终态规则仍然有效。

## 验证

[Issue 管理测试](../../../../.github/issue-management/policy.test.mjs) 覆盖元数据数量、未知标签、优先级、关闭原因一致性、拉取请求标签分离、引用解析、全部生命周期转换，以及针对本地 HTTP 服务器的精确 REST 标签调用。[工作流测试](../../../../scripts/ci-workflow.spec.ts) 要求使用 `pull_request_target`、内置令牌、仓库写权限和同仓库评审保护，并确保不存在 GitHub App 凭据。仓库工作流验证器还会解析两份工作流并强制外部 action 使用固定提交。

## 考虑过的替代方案

**只为 ProjectV2 与 Issue Type 创建组织。** 这可以恢复上游设计，但会让基本贡献策略依赖新的所有者、迁移、Project 配置和 App 安装。个人仓库是产品选定的公开源。

**向 fork 评审工作流提供写令牌或仓库密钥。** GitHub 会有意对公共 fork 隐藏这两者。提升不可信评审代码的权限会形成供应链攻击路径；`pull_request_target` 仅用于可信的 PR 动作子集，而 fork 的评审提交保持只读。

**保持工作流禁用，等待资源出现。** 禁用的策略不是产品能力。拉取请求验证仍会调用该仓库不可用的端点。

**把生命周期状态保存在评论或纳入版本控制的文件中。** 两者都会复制 GitHub 可查询元数据，并引入解析或写冲突状态。标签已经提供筛选、自动化事件和仓库原生编辑。

**保留状态操作者所有权。** ProjectV2 可以暴露最近的状态操作者，但标签无法提供原子且受操作者保护的变更。事件审计历史只能通过额外请求和竞态近似实现。本仓库改为把明确的评审交接视为权威工作流命令，并只保护终态。

## 后果

Issue 策略现在无需自定义 App、组织 Project 或策略密钥，即可直接在个人仓库工作。贡献者可通过标准标签界面筛选和编辑全部元数据，同一组值也会用于拉取请求优先级检查。

模板或自动化应用类型与状态标签前，这些标签必须已经存在。因此仓库引导过程会创建完整的封闭集合，并使描述与本记录保持一致。fork PR 只有在请求评审时才进入自动生命周期；其后续实现与请求修改事件不会自动变更 Issue 标签。维护者可以手动变更或再次请求评审。未来若迁移到组织拥有的原生字段，必须同时迁移标签、策略、模板、工作流、测试与本权威记录；两种表示不得同时保持启用。
