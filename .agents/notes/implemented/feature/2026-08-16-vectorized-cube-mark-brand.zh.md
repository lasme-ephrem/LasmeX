# Agent Note: 矢量化的方块标记品牌

Status: implemented

[English](2026-08-16-vectorized-cube-mark-brand.md) | 中文

## 问题

LasmeX 标记此前只以白底平面画布上的光栅 PNG 存在（`icon`、`full`、`text`）。favicon 必须在任何标签页尺寸下保持清晰，PWA manifest 需要 `any` 尺寸的图标，桌面应用发布 SVG 图标，而深色表面（文档站导航、深色 UI）无法承载白色背景框。为每个表面缩放光栅 PNG 会重复大文件，并把白底冻结进每一处深色环境。

## 决策

三张 PNG 一次性转为矢量：先将每张图打标（白色背景及所有近白像素——包括封闭的字母中空与立方体分隔——替换为唯一品红），用 vtracer 描摹（stacked 颜色聚类、spline 模式、16 色调色板），再后处理过滤掉所有背景色。规范副本位于 [`assets/lasmex-icon.svg`](../../../../assets/lasmex-icon.svg)、[`assets/lasmex-full.svg`](../../../../assets/lasmex-full.svg) 与 [`assets/lasmex-text.svg`](../../../../assets/lasmex-text.svg)；每个表面都从它们复制。

各表面：应用 favicon 与文档站 favicon 发布 `lasmex-icon.svg`（`/favicon.svg`，尺寸 `any` 的 SVG），取代黑色 LX 字标。文档站导航锁式标志内联 `lasmex-full.svg`（44px），取代黑色 LX 字标（`website/public/wordmark.svg` 已删除；LX 标记仅保留在产品 hero 与窄栏的 `LasmexMark.tsx` 中）。桌面应用发布描摹图标 `apps/desktop/assets/icon.svg`。应用的宽侧栏打包完整 logo（`lasmex-client-ui-primitives` 的 `FullLogo`，资源 `full-logo.svg`）。`README.md`、`README.zh.md` 与 `LASMEX.md` 以完整 logo 开头。

## 后果

同一可缩放标记服务于所有表面；描摹调色板（每份 SVG 约 35 KB、约 150 条路径）在深浅背景上渲染一致。立方体分隔现在是透明间隙，深色表面直接呈现彩色立方体。重新生成标记意味着从源 PNG 重新描摹并重新复制每个表面——规范的 `assets/lasmex-*.svg` 副本是部署点。

## 备选方案

| 备选 | 不匹配之处 |
|---|---|
| 直接发布光栅 PNG | 深色表面出现白色背景框，每个表面一份 512px PNG 且小尺寸不清晰。 |
| 手绘立方体标记 SVG | 无法精确复现设计师的渲染。 |
| 文档站导航保留黑色 LX 字标 | 要求的品牌呈现是更大尺寸的完整 logo。 |
| 保留封闭的白色分隔 | 深色背景上的白色描边读作故障而非分隔。 |
