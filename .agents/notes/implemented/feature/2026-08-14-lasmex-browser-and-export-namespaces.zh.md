# Agent Note: LasmeX 浏览器与导出 namespace

Status: implemented

[English](2026-08-14-lasmex-browser-and-export-namespaces.md) | 中文

## 问题

产品更名后，活动 Session、逐 Session 聊天状态和 Workspace 视图状态仍存储在 `dsh.*` 浏览器 key 下，Session 归档也仍下载为 `lasmex-session-*.zip`。因此，在同一 origin 上并行运行 LasmeX 与上游 Harness 部署时可能混用浏览器状态，导出文件也保留了继承的产品身份。

## 决定

LasmeX 拥有浏览器 namespace `lasmex.sessions.current`、`lasmex.conversation.chat.<sessionId>` 和 `lasmex.workspace.view.v5`。Host 与浏览器导出控制器使用相同的 `lasmex-session-<safe-id>.zip` 文件名。

这项预发布变更不迁移或读取继承的 key。忽略它们可以隔离 LasmeX 状态，并遵循仓库在首个 tag 发布前不承诺兼容的方针。内部 loopback URL 和插件 manifest 标识不属于浏览器存储，不在本决定范围内。

## 影响

变更后的首次页面载入不会继承早期上游命名构建的活动 Session 或本地布局。持久 Session 日志、Workspace、settings 和凭据不受影响，因为其 Host 存储不使用这些浏览器 key。下载归档现在带有 LasmeX 名称，内部内容不变。

## 考虑过的替代方案

| 替代方案 | 拒绝原因 |
|---|---|
| 把旧 key 复制到新 namespace | 兼容迁移会故意混入本 fork 正在与之分离的产品状态。 |
| 把 `dsh.*` 保留为内部实现细节 | 浏览器 key 与下载文件名对用户可见，也会在不同产品之间发生碰撞。 |
| 只在浏览器中重命名 ZIP | 直接 Host 下载与预检元数据可能和客户端控制器不一致。 |
