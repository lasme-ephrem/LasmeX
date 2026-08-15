# lasmex-memory-storage-domain

[English](README.md) | 中文

基于 `lasmex-storage-domain` 的 `ctx.memory` 持久 provider。它在带版本的 `project_memory` 领域中按 `MemoryId` 存储不可变记录，并通过 storage-domain 具有最终决定权的内存视图提供同步读取。

## 配置

每个字段都为必填项；部署变更必须是明确决策。

| key | 含义 |
| --- | --- |
| `maxRecordBytes` | 完整序列化记录（包括元数据）的最大 UTF-8 字节数。 |
| `maxQueryBytes` | 单个去除首尾空白的字面查询的最大 UTF-8 字节数。 |
| `maxResults` | 列表、置顶列表或搜索返回的最大记录数。 |
| `previewBytes` | 单个搜索正文预览的最大 UTF-8 字节数。 |
| `maxEntriesPerProject` | 一个规范化项目作用域可拥有的最大持久记录数。 |

领域打开时，provider 会用当前记录与项目容量上限检查已存数据。部署不能在更严格且矛盾的限额下静默重新打开数据。

## 语义

读取绝不会跨越 `record.project`。列表、置顶列表和搜索按 `updatedAt` 降序排列，并以 `MemoryId` 作为确定性并列规则。搜索在标题、正文和标签上执行不区分大小写的字面子串匹配。UTF-8 预览只在完整 Unicode 码点处停止。

创建和替换会存储完整的目标记录。正文必须含有非空白字符；标题会去除首尾空白，且结果不能为空；标签会去除首尾空白并去重。逐项目变更链包围容量检查和持久写入，因此单进程中的并发创建不会超过配置上限。

## 模型体验

### 持久 provider 记录

#### 模型看到的内容

没有直接内容。此 provider 不注册提示词、上下文或工具。它向 `ctx.memory` Consumer 返回不可变记录；任何模型可见投影都由 Consumer 负责。

#### Token 影响

单独使用该包时为零。只有 Consumer 渲染已存字节时，它们才会成为模型 token。

#### KV Cache 影响

相互独立。持久读写不会改变请求前缀。

## 已知限制与暂缓事项

- **变更只在单进程内串行化**：storage-domain 为每个打开的领域提供一条写入链，此 provider 还增加逐项目准入。它不在共享外部介质的多个 LasmeX 进程之间提供 compare-and-swap。
- **线性内存搜索**：首个 provider 有意提供确定性的字面匹配，不包含二级索引、排名、向量嵌入或语义检索。
- **发布前不提供迁移**：领域格式版本为 `0`；不兼容的已存记录会在打开时失败。
