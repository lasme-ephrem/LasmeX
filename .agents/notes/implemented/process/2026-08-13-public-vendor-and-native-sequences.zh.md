# Agent Note: 按发布序列区分 npm access

Status: implemented

[English](2026-08-13-public-vendor-and-native-sequences.md) | 中文

## Problem

[三条发布序列](2026-08-10-npm-release-sequences.md)必须组成可安装的公开发行版。LasmeX 使用非 scoped 名称，vendored 框架与 Landlock 包则保留 `@deepseek-ai` scope；因此 scope 本身无法表达或强制 access。

真正卡住公开消费者的是**受限的依赖**。每个 LasmeX 包都把 vendored 框架声明成 `peerDependency`，`lasmex-sandbox-local` 把 Landlock 入口声明成 `dependency`。因此，即便三条序列采用不同的 npm 命名形式，它们也必须一起保持公开。

## Decision

access 是每条发布序列的属性,不是整个 scope 的属性:

| 序列 | 成员 | `publishConfig.access` |
|---|---|---|
| vendored 框架 | `vendor/*` 九包 | `public` |
| native | `native/landlock-run/packages/*` 三包 | `public` |
| LasmeX | 非 scoped 的 `packages/*/*`、`apps/cli` 与 `apps/web`；排除私有 desktop | `public` |

`check-workspace-constraints.ts` 要求每个 release manifest 都是 `public`，从而阻止新增 scoped 依赖或非 scoped LasmeX 成员变得不可访问。私有 desktop app 不属于 npm 发布族。

**没有任何发布路径传 `--access`。** 一个选项无法服务级别互不相同的序列,而且选项会覆盖真正拥有这个事实的 manifest —— 所以 `publish.ts` 不传,native 的 workflow 也照旧不传,由各 packed manifest 决定。

harness 消费方引用 Landlock 入口改用 `workspace:^` 而非 `workspace:*`,于是发布出去的 harness 包接受该入口的 patch 与 minor 版本,而不是钉死一个精确版本。入口对它那两个平台包仍保持 `workspace:*` —— 那里二进制必须与入口版本完全一致。

access 是包的属性、不是版本的属性。每个新打包的发布成员都带着 npm 在发布时采用的公开声明。

## Alternatives considered

**依赖公开而 LasmeX 保持 restricted。** 不采用：这会在依赖图已经可安装之后，仍让组织外消费者无法取得产品发行版。

**全部保持受限,改为授予一个只读 team。** `npm access grant read-only <org:team> <包>` 是逐包的、没有 scope 通配,覆盖全集意味着每个包一次 grant,外加一个为后续新增包长期补齐的对账任务。它也只能覆盖组织成员,无法服务一个可安装的公开产物。

**在发布路径而不是 manifest 里指定公开。** 混合 scope 下不可能 —— 一个 `--access` 选项表达不了两种级别 —— 而且它会覆盖 workspace 约束正在校验的那个 manifest。

## Consequences

- **三条序列都全网可读，而且不能干净地回退。** 已经被下载或镜像的内容不再受发布方控制。
- **`lasmex` 及其版本与依赖发布后，无需组织凭据即可安装。** release 验证仍会在本地打包跨序列依赖，使一个 pull request 不依赖发布顺序。
- **每条序列的 payload 策略都更重要。** `vendor/cordis` 有意发布 `src`，因为其导出映射声明了 `./src/*`；Landlock 入口发布 `src/main.c` 作为审计面；LasmeX 则拒绝源码与声明映射 payload。
- **无凭据的 `npm view` 是可用的发布检查。** public access 能区分缺失版本与不可访问的私有包。
