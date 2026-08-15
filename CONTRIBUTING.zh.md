# 贡献

[English](CONTRIBUTING.md) | 中文

感谢你帮助改进 LasmeX。公开的 [LasmeX 仓库](https://github.com/lasme-ephrem/LasmeX) 欢迎 bug 报告、聚焦的 Pull Request、文档、插件和用户反馈。

## 修改代码之前

- 在新建内容前搜索现有 Issues 和 Discussions，避免重复。
- 对大型功能、安全敏感变更或架构变更，请先通过 Issue 或 Discussion 讨论，再投入实现。
- 请通过 GitHub 安全公告表单私下报告漏洞；不要在 Issue 中公开利用细节。

## 开发与验证

1. Fork 仓库，并从 `master` 创建聚焦的分支。
2. 安装 Node.js 22.19 或更高版本以及 pnpm，然后运行 `pnpm install --frozen-lockfile`。
3. 遵循 [AGENTS.md](AGENTS.md)、package 级说明和已记录的插件架构。
4. 为每个行为变更添加或更新测试与文档。非局部变更还必须包含 Agent Note。
5. 运行 [docs/testing.md](docs/testing.md) 中说明的最小相关检查。文档变更需运行 `pnpm run doc-sync`。
6. 打开 Pull Request，说明面向用户的结果、已执行的验证、局限和安全影响。

## Pull Request 要求

- 将无关变更放在不同的 Pull Request 中，并保留上游归属说明。
- 绝不提交 API 密钥、签名证书、token、用户会话、构建暂存目录或生成的发行产物。
- 保持英文和中文文档对同步。法语站点源文档按仓库翻译策略独立审核。
- 面向产品的 GUI 变更需包含从真实组装应用流程录制的 GIF。
- 合并前需解决审查反馈和持续集成失败。仓库使用 squash merge，并会自动删除已合并分支。

## 社区扩展

LasmeX 面向独立插件和完整能力接口设计。请为公开插件仓库添加 `lasmex-plugin` topic，以便用户发现；同时说明该插件拥有的权限、模型可见输入、持久数据和失败行为。

贡献即表示你同意将作品按本仓库的 [MIT 许可证](LICENSE) 提供。
