# lasmex-memory

[English](README.md) | 中文

LasmeX 长期记忆的 Service Definition。`ctx.memory` 提供项目作用域读取、受限列表与字面搜索、显式保存和遗忘变更，以及供 Consumer 激活前校验的 provider 限额。

## 项目归属

`projectMemoryScope(cwd)` 只接受绝对工作目录，并应用当前平台的路径规范化。每个操作都必须携带这一品牌化作用域。该服务没有全局作用域，不会回退到 `process.cwd()`，也不能按 id 跨项目读取。

`MemoryId` 和 `ProjectMemoryScope` 都是品牌化字符串。Provider 创建 id；Consumer 从 Agent Session 标头派生项目作用域，而不是采用模型输入。

## 服务 API

- `read({ project, id })` 返回一条完整的不可变记录，缺失时返回 `undefined`。
- `list({ project, limit })` 返回按最近时间排序且不含正文的摘要。
- `listPinned({ project, limit })` 返回最近的完整置顶记录，用于受限请求组装。
- `search({ project, query, limit })` 返回字面匹配及受限预览。
- `save(request)` 创建或替换一条完整记录。
- `forget({ project, id })` 仅在记录属于目标项目时删除它。

`MemoryService.limits` 公布当前记录、查询、结果、预览和逐项目容量上限。Provider 会拒绝超限请求，而不会静默截断调用方意图。

## 模型体验

### 与 provider 无关的记忆状态

#### 模型看到的内容

没有直接内容。该包不注册提示词、上下文或工具。Consumer 可以通过自身有文档说明的模型接口公开选定的 `ctx.memory` 记录。

#### Token 影响

单独使用该包时为零。只有 Consumer 渲染记录内容时才会产生 token 成本。

#### KV Cache 影响

相互独立。服务操作不会修改模型请求；任何缓存影响都由渲染内容的 Consumer 负责。

## 已知限制与暂缓事项

- **路径身份遵循当前主机平台**：规范化不会解析符号链接，也不会统一文件系统大小写。同一项目在不同路径拼写之间移动时，部署方应先选择更高层的工作区身份，再替换此作用域规则。
- **变更授权属于 Consumer**：Service Definition 无法推断调用方由模型驱动、是否可交互或是否可信。`lasmex-tool-memory` 负责模型变更的强制策略。
