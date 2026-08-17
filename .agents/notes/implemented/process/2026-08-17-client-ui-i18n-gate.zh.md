# Agent Note: 客户端 UI 国际化门禁

Status: implemented

[English](2026-08-17-client-ui-i18n-gate.md) | 中文

## 问题

客户端以目录驱动的方式提供本地化文案（默认 `fr`），每个命名空间在编译期保证键集合一致，但没有任何机制阻止开发者在组件里直接写用户可见文本。首次扫描在 96 个文件中发现 13 处硬编码：手动压缩行标题 `compact`、重试延迟单位 `ms`、两个示例占位符（`acme-gateway`、`https://gateway.example/v1`），以及十处 `tok` 单位标签。「法语优先」的承诺因此依赖纪律而非门禁。

## 决策

新增已执行的门禁 `verify-client-i18n`（`scripts/verify-client-i18n.ts`）：遍历每个 `packages/client/**/src/client/**/*.tsx` 源码的 TypeScript AST，标记含字母的 JSX 文本节点、字面量的 `aria-label` / `aria-description` / `placeholder` / `title` / `alt` 属性，以及直接位于 JSX 表达式中的字符串字面量（`{'text'}`）。纯标点或纯数字的字面量放行。该门禁接入 `doc-sync`（位于「法语文档一致性」旁的 `client-i18n` 条目），并由一个 spec 证明它能拒绝每种非法情形、接受目录驱动的 UI。

13 处违规通过目录化修复：`usage.tokenCount`/`usage.tokenRate`（轨迹 token 单位）、`message.retry.delayValue`（重试延迟）、`customRoutePlaceholder`/`baseUrlPlaceholder`（示例值，各语言相同字符串），压缩行标题改用已有的 `message.compaction` 键（法语 `Contexte compacté`）。描述硬编码字符串的测试改述目录化后的字符串。

## 后果

每个交付的客户端 `.tsx` 文件都必须经目录路由用户可见文本，否则 `doc-sync` 失败。扫描器的盲区已在文件头注明：嵌套在 JSX 表达式代码内的字符串（三元分支、调用参数）、普通 `.ts` 模块，以及运行时错误消息（`promptError.error.message`、`block.error.name`）尚未覆盖——错误消息的目录化是下一个工作包。

## 备选方案

| 备选 | 不匹配之处 |
|---|---|
| 用现成的硬编码字符串 lint 规则 | 没有现有规则匹配 JSX 文本语义；自研 AST 门禁保持精确且可测试。 |
| 也扫描 `.ts` 文件 | 代码中的字符串字面量大多不是 UI；全部标记会淹没信号。 |
| 豁免单位与占位符 | 单位与示例值仍属用户可见；目录化只花一个键，且保持门禁完备。 |
