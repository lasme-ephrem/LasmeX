# Agent Note：LasmeX 公开发布供应链

Status: implemented

[English](2026-08-14-lasmex-public-release-supply-chain.md) | 中文

## Problem

LasmeX 通过 npm、两个 PyPI 项目和原生桌面产物发布同一个产品版本。彼此独立的手工上传可能暴露不完整版本；可变的 GitHub Action tag 可以在仓库没有变更时改变构建；registry token 的寿命长于单次运行；继承的 CI 还依赖公开 fork 无法使用的私有 runner。在首次发布之前，非 scoped 的 npm 名称也仍可能被他人占用。

Vendored Cordis 与 Landlock 包保留上游 `@deepseek-ai` scope。[npm access 决策](2026-08-13-public-vendor-and-native-sequences.md)仍要求它们公开可读，但本 fork 无权向该 scope 发布。

## Decision

仓库版本、全部 LasmeX npm manifest、两个 Python 项目 manifest、runtime deploy root 和私有 desktop manifest 使用同一个稳定版本。`verify-distribution.ts` 会拒绝预发布拼写、版本不一致、平台命令缺失、没有固定到同一版本的 Python runtime 依赖，以及继续使用已退役 `dsh-*` package identity 或把 LasmeX 当作普通名词的公开 npm description。发布命令从这些 manifest 推导版本，并要求精确的 `lasmex-v<version>` tag。在预发布格式策略退役后，仓库所有者仍需单独创建首个 tag。

`release.yml` 是唯一的公开产品发布 workflow。它从带 tag 的 commit 构建 npm tarball、四个 Python wheel，以及 Windows、macOS、Linux 桌面发行包。Syft 扫描解压后的 npm tarball、wheel 内容、desktop archive、展开后的 Electron ASAR 和精确的 Electron runtime manifest。inventory gate 要求 SBOM 包含全部 LasmeX npm package、两个 Python distribution、desktop app 和 Electron 的精确版本。发布 bundle 包含 SPDX JSON SBOM 与 hash；GitHub artifact attestation 覆盖可发行文件、Squirrel `RELEASES`、desktop manifest、`SHA256SUMS` 与 SBOM。受保护的 `github-release` job 会先创建或刷新 draft 并上传全部资产，之后才写 registry。只有 npm、`lasmex-runtime-bin` 与 `lasmex-sdk` 全部成功后，draft 才会公开。registry job 失败时会留下可恢复的 draft。npm 重跑会比较 registry integrity 与打包 tarball；PyPI 重跑会逐个比较远端文件名的 SHA-256 与本地 wheel，只上传缺失文件，同版本内容不同会中止发布。

npm 与 PyPI 通过受保护 environment 使用 GitHub OIDC trusted publishing。npm 无法在 package 存在之前配置 trusted publisher，因此 `npm_authentication=bootstrap` 是一个独立的一次性路径，并由 `npm-bootstrap` environment 保护。该路径只接受 `LASMEX_NPM_BOOTSTRAP_TOKEN`，并借助 GitHub OIDC token 为首次 npm 发布显式生成 provenance；它保持 GitHub release 为 draft，且不发布 PyPI。随后，所有者需要用 npm CLI 11.15 或更高版本，在启用了账户级 2FA 的会话中运行 `pnpm run release:configure-npm-trust -- --apply`。每次写入前，命令都会读取当前 relationship，且仅当 GitHub repository、workflow、environment 与 publish permission 完全一致时才跳过；不同或无法解析的 relationship 会失败，因此中断后可安全重跑。在以 `npm_authentication=oidc` 重跑 workflow 前，必须撤销 bootstrap token。正常 npm 发布和全部 PyPI 发布都不接受长期 token。PyPI attestation 保持启用；发布 job 只获得 `contents: read` 与 `id-token: write`。只有 GitHub draft 与 finalize job 获得 `contents: write`，只有 attestation job 额外获得 `attestations: write`。创建 draft 前，无凭据的 registry preflight 会拒绝缺少 source metadata 或 source metadata 不指向 `https://github.com/lasme-ephrem/LasmeX` 的已有名称。Repository URL 是自行声明的 metadata，不能证明 maintainer 身份；npm 或 PyPI authentication 仍是权威 ownership 检查。

所有外部 GitHub Action 都固定到完整 commit SHA，Syft 固定到精确版本，manylinux container 固定到 digest。Workflow 使用明确的 GitHub-hosted OS label，而不是 `-latest`。GitHub 会更新明确 label 背后的 image，普通 hosted job 无法取得可固定的 image digest，因此 job log 中记录的 image release 是这一不可避免层的可复现性记录。`verify-workflows.ts` 会拒绝浮动 action 或 Docker 引用、可变 hosted alias、正常发布中的 token 型 npm authentication、被禁用的 PyPI attestation、上游私有 runner label，以及缺少受保护 environment 权限的发布 job。必需 CI 在 GitHub 托管的 Linux、macOS 与原生 Windows 上运行，同时保留 Wine Windows 检查作为独立兼容性信号。CodeQL 分析 JavaScript 与 TypeScript，dependency review 拒绝新引入的 high 严重性公告，产品发布运行 `pnpm audit --prod --audit-level high`。同 major workspace override 为有漏洞的传递依赖路径设置已修复版本下限。

桌面发布使用 Electron 构建输出和 staged ASAR，而不使用 Electron Packager。Windows 直接对 staged bundle 调用 MakerSquirrel；macOS 生成已签名和公证的 ZIP；Linux 生成可移植 tarball。Windows 与 macOS 的 release 模式要求把 HTTPS update base URL 写入 sealed ASAR。只有当 `GITHUB_REF` 等于从 manifest 推导的 `lasmex-v<version>` tag，且该 tag 解析到 `GITHUB_SHA` 时，签名 job 才能运行；只有这些 job 会进入 `desktop-signing` 并接收签名 secret。独立的 unsigned job 不接收签名 environment、签名 secret、update URL 或 release mode。未签名验证构建记录 `signed: false`；正式发布要求 Windows 和 macOS 签名，Linux 则明确记录其可移植 archive 未签名且没有集成 updater。

Vendor 与 Landlock workflow 会构建、打包和验证上游 scoped 产物，但不包含发布 job。发布这些名称仍是上游 scope 所有者的责任。fork 保留其源码归属，只使用本地 tarball 来证明 LasmeX 可以在 registry 尚无匹配依赖时完成安装。

文档从 `master` 通过 GitHub Pages 部署；仓库 base path 由 Pages 配置提供，deploy 使用受保护的 `github-pages` environment，且只获得 `pages: write` 和 OIDC。流程不假设自定义域名。

## Alternatives considered

**分别发布每个生态。** 不采用：用户可能看到一个 GitHub release 或 SDK 版本，但它需要的 npm、runtime 或 desktop 产物并未全部完成。

**保留 registry automation token 作为 fallback。** 不采用：fallback 会静默绕过短期 OIDC 身份，并在仓库状态中保留可复用凭据。

**从 fork 发布 vendored 与 native 包。** 不采用：包可公开读取不代表 fork 拥有上游 npm scope 的发布权限。

**引用 action major tag。** 不采用：Dependabot 可以提交经审查的 SHA 更新，而移动 tag 可以在本仓库无变更时替换实际执行的代码。

## Consequences

- 首次稳定发布需要受保护的 npm bootstrap、为每个新建 package 交互式配置 trust、撤销 token，并用 OIDC 重跑。后续发布直接从 OIDC 开始。
- 在外部配置 repository environment、npm 与 PyPI trusted publisher、桌面签名材料和 Pages source 之前，稳定发布无法完成。
- 从用户视角看，GitHub release 是原子的；但 npm 与 PyPI 是不可变 registry，并不组成单一事务。失败运行会从 draft 恢复，并跳过已接受且字节一致的版本；digest 不一致时必须提升版本或调查原因。
- 包名可用性与 source metadata 会在发布前立即检查，但不能预留尚不存在的名称，也不能证明 registry ownership。首次 authenticated publication 仍是时间敏感的所有者操作。
- Action 更新必须提交经审查的 SHA 变更。生产依赖出现 high 或 critical 严重性公告时会阻止发布。
- 私密漏洞报告使用 GitHub 仓库原生渠道；不会虚构邮箱或第三方接收服务。
