# Agent Note: 精确透明光栅品牌资产

Status: implemented

[English](2026-08-17-exact-transparent-raster-brand-assets.md) | 中文

## 问题

LasmeX 标记只以白底平面画布上的光栅 PNG 存在（`icon`、`full`、`text`）。favicon 必须在任何标签页尺寸下保持清晰，深色表面（文档站导航、深色 UI）无法承载白色背景框，而客户端要求对设计师渲染的像素级精确保真。首次尝试将 PNG 描摹为矢量路径（vtracer，spline，16 色调色板）：客户端以「像素化」为由拒绝——自动描摹器把细腻渐变再现为堆叠的纯色区域，任何缩放下都会出现可见色带。只有像素级精确的光栅才能满足保真要求。

## 决策

已验证的「精确透明」方案：每张 PNG 先做去底（所有近白像素——包括封闭的字母中空与立方体分隔——被移除；alpha 二值化；画布紧密裁剪），再以 `<image href="data:image/png;base64,…">` 嵌入到带尺寸的 SVG 中——SVG2 的 `<image>` 元素，favicon、`<img>`、GitHub README 与 React 渲染均支持。规范副本位于 [`assets/lasmex-icon.svg`](../../../../assets/lasmex-icon.svg)、[`assets/lasmex-full.svg`](../../../../assets/lasmex-full.svg) 与 [`assets/lasmex-text.svg`](../../../../assets/lasmex-text.svg)；每个表面都从它们复制。

各表面：应用 favicon 与文档站 favicon 发布 `lasmex-icon.svg`（`/favicon.svg`，尺寸 `any` 的 SVG），取代黑色 LX 字标。文档站导航锁式标志内联 `lasmex-full.svg`（44px）。应用的 hero 与窄栏挂载嵌入的方块标记（`CubeMark`），宽侧栏渲染完整 logo（`FullLogo`）；二者都从生成的数据模块（`cubeMarkImage.ts`、`fullLogoImage.ts`）以 data URL 渲染 PNG，因为 tsdown 无法从源码打包 `.svg` 资源导入。桌面应用发布 `apps/desktop/assets/icon.svg` 以及 `icon.png` 与重新生成的 `icon.ico`/`icon.icns`。`README.md`、`README.zh.md` 与 `LASMEX.md` 以完整 logo 开头。

## 后果

在原生尺寸下于浅色与深色背景上像素级精确渲染，且具有真实透明度。超出原生光栅尺寸后没有任何缩放增益（嵌入的是 PNG，并非矢量化），文件较重（base64 后 icon 约 920 KB、full 约 720 KB）。重新生成标记意味着重新执行去底并重新复制每个表面——规范的 `assets/lasmex-*.svg` 副本是部署点。

## 备选方案

| 备选 | 不匹配之处 |
|---|---|
| 矢量描摹（vtracer，先发布后回退） | 渐变色带读作像素化；没有自动描摹器能精确再现细腻渐变。 |
| Vectorizer.AI 云端描摹 | 外部付费服务，24 小时留存，无可本地复现性。 |
| 直接发布光栅 PNG | 深色表面上出现白色背景框。 |
| 用真实 `linearGradient` 手工重绘标记 | 只有手工重绘才能完全保真；本次未尝试。 |
