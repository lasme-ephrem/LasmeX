# LasmeX

[Français](LASMEX.md) | [English](README.md) | 中文

LasmeX 是由 [lasme-ephrem/LasmeX](https://github.com/lasme-ephrem/LasmeX) 维护、以法语为先的开源 agent harness（智能体框架）。它是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的独立分支，并保留 Cordis 的「一切皆插件」架构。

## 产品

LasmeX Code 是默认开发 agent。Web 与桌面应用包含 Mission 仪表盘，展示目标、步骤、权限、验证命令、审批、活动、token 用量和编排的子级，不暴露私有推理。持久项目记忆受限、显式、按工作区隔离，并在交互式 profile 中受审批保护。会话可从本地持久化恢复，后台任务与 subagent 始终可观察、可控制。

启动器、npm 包系列、TypeScript SDK、Python SDK、浏览器身份、文档站和桌面应用均使用 LasmeX 身份。用户数据默认位于 `~/.lasmex`，启动器会禁用从上游项目继承的遥测。

## 从源码运行

<a id="run"></a>

安装 Node.js 22.19 或更高版本以及 pnpm，然后在本 checkout 中运行：

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm lasmex web
```

Web UI 默认在 `http://127.0.0.1:3080` 提供服务。设置 `LASMEX_HOME` 可使用其他用户数据目录。供应商凭据始终保留在本地，不得提交到仓库。

## 桌面应用

使用 `pnpm desktop:package` 为当前操作系统构建便携式应用。原生发行命令可生成 Windows Squirrel 安装程序、在已配置 Apple 凭据时生成已签名且已公证的 macOS 应用 ZIP，或生成 Linux 便携式 tarball：

```sh
pnpm desktop:make:windows
pnpm desktop:make:macos
pnpm desktop:make:linux
```

每个原生产物都必须在其目标操作系统上构建。本地未签名构建会禁用自动更新；已签名发行构建需要 HTTPS 更新源和平台签名凭据。

## 文档与开发

请先阅读[法语产品指南](LASMEX.md)、[用户指南](docs/user/guide/index.fr.md)、[开发指南](docs/development.md)和[架构文档](docs/architecture.md)。贡献者必须遵循 [AGENTS.md](AGENTS.md) 和 [CONTRIBUTING.md](CONTRIBUTING.md)。

名为 `origin` 的 Git remote 指向 LasmeX 仓库。名为 `upstream` 的 remote 跟踪 DeepSeek Harness，用于归属说明和明确的上游同步。产品变更应与上游同步工作分开。

## 许可证

[MIT](LICENSE)。第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
