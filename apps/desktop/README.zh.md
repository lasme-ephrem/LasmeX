# LasmeX 桌面应用

[English](README.md) | 中文

LasmeX 桌面应用把 Web 界面与嵌入式 Host 打包在一起。它不启动 HTTP 服务器，也不开放公共端口：隔离的 renderer 加载 `lasmex://app`，Electron main process 再把该 scheme 转发到 Web 产品所用的同一套 client 模块图、`HostConnectionService.fetch`、API Proxy 以及 host/mux 流。桌面 overlay 只替换 Web startup、HMR 与目录选择；agent 组合仍归 `web` profile 所有。

## 本地使用

```powershell
pnpm install --frozen-lockfile
pnpm desktop:start
```

Renderer 启用 `contextIsolation`、Chromium sandbox 与 Web security，并关闭 Node integration 和 DevTools。专用 Electron session 会拒绝所有权限和远程请求；CSP 只允许打包资源、内存中的 `data:` 图片/字体，以及同源 `blob:` 图片/worker。Main frame 不得离开打包的入口文档，新窗口、webview、redirect 与外部 origin 均被拒绝。自定义 scheme 只提供 Vite 资源、组合后插件图中的精确 revision，以及同源 `/api` 请求。

## 分发构建

```powershell
pnpm desktop:package
pnpm desktop:make:windows
pnpm desktop:make:macos
pnpm desktop:make:linux
```

每个目标都必须在对应的原生操作系统上运行。`desktop:package` 会在 `apps/desktop/out/LasmeX-<platform>-<arch>` 创建未打包 bundle。Make 命令生成以下产物：

- Windows：`apps/desktop/out/make/squirrel.windows/<arch>/LasmeX-Setup-<version>-<arch>.exe`、更新 `.nupkg` 与 `RELEASES`。
- macOS：包含 `LasmeX.app` 的 `apps/desktop/out/make/LasmeX-<version>-darwin-<arch>.zip`。
- Linux：`apps/desktop/out/make/LasmeX-<version>-linux-<arch>.tar.gz`。

原生 bundle 由固定版本的 Electron distribution 与部署后的生产 ASAR 组装，路径中不使用 Electron Packager。打包会实体化 workspace 链接，拒绝缺失的必需 peer，把原生模块与其 DLL 和辅助程序保留在 `app.asar.unpacked`，并在返回前恢复冻结的开发依赖安装。每个 make 都会写入 `out/make/manifest-<platform>-<arch>.json`，其中包含产品/版本元数据、签名状态、大小与 SHA-256 hash。

规范的 LasmeX 标记以 SVG、PNG、ICO 和 ICNS 形式保存。Windows 应用与安装程序资源、macOS bundle 以及 Linux 窗口/bundle 都使用这些资源。应用元数据从共享发行 manifest 读取版本，并标识 `LasmeX contributors`；该描述性 publisher 字段不等同于数字签名。

## 签名发行与更新

默认生成未签名构建。其 ASAR 中的 release 元数据会在任何网络请求前禁用更新，manifest 包含 `"signed": false`。

只能在受控的 release job 中设置 `LASMEX_DESKTOP_RELEASE=1`。Windows 与 macOS release 构建还必须提供 `LASMEX_DESKTOP_UPDATE_BASE_URL`；该 URL 必须使用 HTTPS，且不得包含凭据、query 或 fragment。URL 会被规范化并封装进 ASAR。Main process 只会在已安装、已打包的 release 中把 Electron `autoUpdater` 指向 `<base>/<platform>/<version>`。Windows endpoint 必须提供 Squirrel `RELEASES` payload；macOS endpoint 必须实现 Squirrel.Mac response。Electron 没有内置 Linux updater，因此 Linux 使用发行渠道的软件包/更新机制。

Windows release 签名需要：

- `WINDOWS_CERTIFICATE_FILE`：Authenticode PFX 路径。
- `WINDOWS_CERTIFICATE_PASSWORD`：PFX 密码。

macOS release 签名与 notarization 需要 `LASMEX_MACOS_SIGN_IDENTITY`，以及且仅能选择一种 notarization 方法：

- `LASMEX_MACOS_NOTARY_PROFILE`；或
- `APPLE_API_KEY`、`APPLE_API_KEY_ID` 与 `APPLE_API_ISSUER`。

缺失、不完整、混用、非 HTTPS 或不受支持的配置都会在 staging 或网络访问前失败。macOS lane 使用 Electron 维护的 signer 完成签名并验证 bundle，再通过 `xcrun notarytool` 提交，staple 并验证票据，最后创建 ZIP。本仓库不包含任何证书、Apple 凭据、更新 origin、签名或 notarization 结果。

## 验证

```powershell
pnpm --filter lasmex-desktop test
pnpm --filter lasmex-desktop run build
pnpm --filter lasmex-desktop run smoke:artifact
```

Windows 产物 smoke 会拒绝已经安装 LasmeX 的机器。它会安装生成的 Setup，检查版本元数据与 Squirrel runtime，启动已安装应用，等待 `LasmeX` 窗口和 renderer process，然后卸载测试副本。桌面 user data 与 `$LASMEX_HOME` 会重定向到已忽略的 `apps/desktop/out/smoke-windows` 目录。

## 模型体验

桌面应用只改变载体与窗口生命周期。模型请求、工具、提示词、session 事件和插件组合仍由选中的 LasmeX profile 决定。

#### KV Cache 影响

无。桌面载体不改变提供方请求或提示词顺序。

## 已知限制

- 没有外部 Authenticode 与 Apple 凭据以及真实 HTTPS 更新服务时，仓库中的配置无法生成受信任的公开发行版。
- 应用沿用 profile 现有的凭据引用 provider 与 `$LASMEX_HOME/.credentials.yaml`。它不会复制、显示现有密钥，也不会声称用 Electron `safeStorage` 加密了现有密钥；迁移需要明确的凭据存储设计，且必须保留引用并绝不暴露明文。
- 关闭唯一窗口会关闭嵌入式 profile。尚未实现多窗口及后台 Host 生命周期。

## 产品组装后的 GUI 录制

仅在组装后的产品与模型配置可用后录制真实打包流程：安装并启动 LasmeX，从法语首页创建 session，提交提示词，等待真实流式响应，打开 trajectory 视图，然后关闭窗口并确认进程退出。录制必须使用打包应用及其真实 Host/模型路径，不能使用 fixture。
