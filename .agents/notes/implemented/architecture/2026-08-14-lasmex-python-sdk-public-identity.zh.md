# Agent Note: LasmeX Python SDK 公开身份

Status: implemented

[English](2026-08-14-lasmex-python-sdk-public-identity.md) | 中文

## 问题

LasmeX 产品基础仍让公开 Python 分发包、导入模块、高层 SDK 类、打包可执行文件和 JSON-RPC 服务器身份使用 LasmeX 名称。只迁移其中一部分，会使安装、导入、诊断、wheel 内容和共享 TypeScript 客户端对所驱动产品的认知互相矛盾。预发布别名会在没有外部兼容义务的情况下保留两套公开名称。

## 决定

Python 分发系列只使用一套 LasmeX 名称，不提供兼容别名：

| 接口 | 名称 |
|---|---|
| 客户端分发包 | `lasmex-sdk` |
| 运行时分发包 | `lasmex-runtime-bin` |
| 客户端模块 | `lasmex` |
| 运行时模块 | `lasmex_runtime` |
| Python 高层 API | `LasmeX`、`LasmeXConfig`、`Session`、`RunResult` |
| Python 底层 API | `LasmeXClient`、`LasmeXClientConfig`、`LasmeXError` 及其现有子类 |
| 可运行 bin | `lasmex-jsonrpc-agent` |
| 部署根与原生产物 | `lasmex-jsonrpc-agent-pkg`、`lasmex-jsonrpc-agent-pkg-<platform>-<arch>` |
| JSON-RPC 服务器身份 | `lasmex-sdk-runtime` |
| TypeScript 高层 API | `LasmeX`、`LasmeXOptions` |
| Subagent 提供方包 | `lasmex-subagent-lasmex-sdk` |
| Subagent 提供方 id | `lasmex-sdk` |

源码路径、wheel 元数据、同版本依赖固定、构建钩子、发布工作流、运行时 manifest、fixture、测试、快照与当前文档一起使用这些名称。npm 导入说明符使用已迁移的 `lasmex-*` 包系列；subagent 包的 LasmeX 专用后缀与提供方 id 不会保留已移除的 `dsh-sdk` 产品身份。

Python 包元数据把作者标为 `LasmeX contributors`。`Homepage`、`Repository`、`Issues` 和 `Source` 指向位于 `https://github.com/lasme-ephrem/LasmeX` 的官方公开 fork；只有 `Upstream` 指向 `https://github.com/deepseek-ai/deepseek-harness`。

`LASMEX_CORDIS_CONFIG`、`LASMEX_SESSION_ROOT`、`LASMEX_CWD` 和 `LASMEX_RUNTIME_MODE` 是公开运行时控制。`DSH_RUNTIME_PLATFORM_TAG` 仍是构建期包选择握手，不是受支持的用户控制。其他保留的 `DSH_*` 名称也仅限于构建、测试或私有 wire 协调，不属于 Python SDK 配置界面。

本决定细化 [LasmeX 产品基础](../feature/2026-08-14-lasmex-product-foundation.md)。它部分取代[仓库命名决定](2026-08-11-repository-naming-contract-and-rename-ledger.md)保留的公开 Python 名称、可执行文件谱系、TypeScript 高层类、`serverInfo.name`、subagent 包后缀与 subagent 提供方 id。其他 npm SDK 包名、JSON-RPC 方法与载荷字段、运行时打包机制、发布控制和必需的原生 CI 仍由既有决定负责。

## 影响

Python 使用方安装 `lasmex-sdk`、导入 `lasmex` 并使用 LasmeX 类系列；已移除的上游分发包、模块、类和可执行文件名称会直接失败，而不会选择别名。发布自动化发布两个 LasmeX 分发包并打包 LasmeX 可执行文件谱系，平台原生运行时产物仍由 Linux 与 macOS CI 负责。TypeScript 使用方使用 `LasmeX` 与 `LasmeXOptions`；subagent 组合挂载 `lasmex-subagent-lasmex-sdk` 并选择 `lasmex-sdk`。未来的内部构建或 wire 前缀迁移必须原子更新其完整系列。

## 测试

Python 单元套件只导入 `lasmex` 与 `lasmex_runtime`，测试改名后的公开类，暂存两个新分发包，并验证原生载荷名称。发布测试构建并检查纯 SDK wheel 与一个平台运行时 wheel。TypeScript 包测试和无密钥 JSON-RPC 示例覆盖 `LasmeX`、可执行文件引用、`serverInfo.name = lasmex-sdk-runtime`，以及通过已改名包提供的 `lasmex-sdk` subagent 提供方。文档配对和当前 Note 检查会拒绝双语参考与决定记录发生漂移。

## 考虑过的替代方案

**保留一个版本的导入别名。** LasmeX 尚无已打标签的 Python 发行版或外部兼容承诺。别名会要求重复导出、安装说明、测试和删除政策，并允许新代码继续使用上游身份。

**只重命名 Python 分发包与模块。** 可执行文件、服务器握手、TypeScript 包装器、诊断与 wheel 会为同一运行时暴露多种产品名。

**让公开运行时控制继续使用 `DSH_*`。** 这会在普通 LasmeX 配置中暴露上游产品命名空间。因此公开控制使用 `LASMEX_*`；只有非用户可见的构建、测试与 wire 标识在所属机制原子迁移前保留原名。

**把 DeepSeek Harness 上游用作 LasmeX 主页。** 该 URL 标识上游产品。LasmeX 官方 fork 拥有产品元数据链接，而 `Upstream` 保留明确的源码归属。
