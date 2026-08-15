# Agent Note: LasmeX 产品基础

Status: implemented

[English](2026-08-14-lasmex-product-foundation.md) | 中文

## 问题

独立 fork 需要不会与已安装 DeepSeek Harness checkout 冲突的产品身份和本地状态。只修改浏览器文案，会让继承的命令、包 namespace、主目录、遥测路径、模型可见身份和启动信号继续附着于上游产品。独立发行因此要求产品界面与完整 harness 包系列一起迁移。

## 决定

LasmeX 是公开产品身份。启动器只公开 `lasmex`；浏览器标题、安装 manifest、启动信号、紧凑标记、wordmark、模型身份、源码定位提示词和提供方中立的 `User-Agent` 都使用 LasmeX。npm 发布系列以无 scope 的 `lasmex` 作为入口包，以 `lasmex-*` 作为配套包；桌面包保持 private，因为其发行物是便携应用或安装程序，而不是 npm runtime。提供方请求发送 `lasmex/<version> (+https://github.com/lasme-ephrem/LasmeX)`，标识 LasmeX 官方公开 fork，而不是 DeepSeek Harness 上游。

启动器在解析 profile 前准备进程环境。显式 `LASMEX_HOME` 继续支持现有开发自动化；否则由 `LASMEX_HOME` 选择状态目录，默认值为 `~/.lasmex`。启动器始终设置 `LASMEX_TELEMETRY_DISABLED=1`，因此通过 LasmeX 启动时无法启用继承的 DeepSeek 遥测。

Harness 包名与 import 原子迁移到 `lasmex` 和 `lasmex-*`。TypeScript SDK 与 [Python SDK 公开身份](../architecture/2026-08-14-lasmex-python-sdk-public-identity.md)统一使用 LasmeX 发行包、模块、公开高层类、可执行文件名、provider 名称和服务器身份。公开 TypeScript 入口使用 `LasmexInvocation`、`parseLasmexArgs`、`LasmexEnvironment`、`LasmexEnvironmentKey` 和 `LasmexWindow`；公开运行时控制使用 `LASMEX_*` 命名空间。不保留 `Dsh*` 别名或公开的 `DSH_*` 兼容变量。

保留的 `DSH_*` 名称是内部机制标识，不是受支持的产品配置。构建与门禁协调拥有 `DSH_BUILD_FACE`、`DSH_RUNTIME_PLATFORM_TAG`、`DSH_DOC_TYPECHECK_USE_BUILD_OUTPUT`、`DSH_NODE_COMPAT_SKIP_TYPECHECK`、`DSH_REQUIRE_BUILT_CLI_SMOKE`、`DSH_GATE_*`、`DSH_COVERAGE_*`、`DSH_OXLINT_THREADS`、`DSH_PUBLINT_CONCURRENCY`、`DSH_ARCHIVE_BASE_REF`、`DSH_LEFTHOOK_ALLOW_HOOKS_PATH_OVERRIDE` 与 CI 故障转移值。测试基础设施拥有 `DSH_SNAPSHOT*`、`DSH_EXAMPLE_MODE`、`DSH_TEST_*`、`DSH_E2E_MAX_WORKERS`、提供方 e2e 覆盖、Wine 控制与 Web 压测控制。私有进程和浏览器握手拥有 `__DSH_BOOT__`、`__DSH_MODULES__`、`DSH_CLAUDE_CODE_EXECUTABLE`、`DSH_DIALOG_TITLE`、持久 bash framing 标记与翻译占位 token。私有 origin、symbol、元数据键、临时目录前缀、`dsh-translation-pairing` 合并驱动标识与仓库 skill 标识也可保留小写 `dsh` 名称。这些标识可在不提供产品兼容承诺的情况下变更，且不得作为用户控制或产品身份展示。

system-prompt 插件接受 `harnessIdentity` 部署配置。LasmeX 是默认值，其他发行版无需修改插件即可提供自己的 −100 顺序身份。

名为 `upstream` 的 Git remote 跟踪 `deepseek-ai/deepseek-harness`；LasmeX 分支承载产品工作。fork 保留上游 MIT 许可证与第三方声明。

## 影响

LasmeX 与 DeepSeek Harness 可以在同一台机器上运行，而不共享默认状态。显式设置 `LASMEX_HOME` 的现有测试和脚本仍保持隔离。界面不再显示 DeepSeek 鲸鱼或 wordmark，模型提供方会收到 LasmeX 应用归属，npm 消费者也不再依赖 DeepSeek 的包 namespace。在指代上游项目、provider 或 API、vendored 或 native 包、provider 特定 wire 字段或保留的法律署名时仍会出现 DeepSeek。

法语 locale 是独立验收单元。每个类型化客户端 namespace 都具备完整法语字典，且法语是产品回退语言；这样可以避免名义上的法语界面回落到中文或英文字符串。

## 考虑过的替代方案

| 替代方案 | 约定不匹配之处 |
|---|---|
| 保留继承的 npm 名称或公开 `dsh` 二进制别名 | 完整系列已经能够原子迁移后，LasmeX 仍需依赖上游 namespace 或宣传两套产品命令。 |
| 保留 `~/.dsh` 默认值 | LasmeX 与 DeepSeek Harness 会修改相同的 profile、凭据、设置和会话。 |
| 让遥测保持可配置 | LasmeX 启动仍可能在没有 LasmeX 同意界面的情况下，把继承的产品遥测发送到 DeepSeek 端点。 |
| 把 DeepSeek Harness 上游宣传为 LasmeX 产品 URL | 提供方日志会把 LasmeX 身份链接到错误产品。LasmeX 官方 fork 是产品 URL；DeepSeek 仓库保留为显式上游归属。 |
| 把不完整法语加入可用 locale | 类型化 locale 注册表会拒绝缺失字典，或产品会暴露混合语言界面。 |
