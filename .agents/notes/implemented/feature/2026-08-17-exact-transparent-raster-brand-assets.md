# Agent Note: Exact-transparent raster brand assets

Status: implemented

English | [中文](2026-08-17-exact-transparent-raster-brand-assets.zh.md)

## Problem

The LasmeX mark exists only as raster PNGs on a flat white canvas (`icon`, `full`, `text`). The favicon must stay sharp at every tab size, dark surfaces (documentation-site navigation, dark UI) cannot carry a white background box, and the client demands pixel-exact fidelity to the designer's render. A first attempt traced the PNGs to vector paths (vtracer, spline, 16-color palette): the client rejected it as pixelated — automatic tracers reproduce fine gradients as stacked flat-color regions, which bands visibly at any zoom. Only a pixel-exact raster satisfies the fidelity requirement.

## Decision

The validated "exact transparent" approach: each PNG is detoured (every near-white pixel, including enclosed letter counters and cube separations, is removed; alpha is binarized; the canvas is tightly cropped) and embedded as `<image href="data:image/png;base64,…">` inside a sized SVG — the SVG2 `<image>` element, supported in favicons, `<img>`, and React rendering. The canonical copies live in [`assets/lasmex-icon.svg`](../../../../assets/lasmex-icon.svg), [`assets/lasmex-full.svg`](../../../../assets/lasmex-full.svg), and [`assets/lasmex-text.svg`](../../../../assets/lasmex-text.svg); every surface copies from them.

Surfaces: the app favicon and the documentation-site favicon ship `lasmex-icon.svg` (`/favicon.svg`, SVG of size `any`), replacing the black LX monogram. The documentation-site navigation lockup inlines `lasmex-full.svg` at 44px. The app's hero and narrow rail mount the embedded cube mark (`CubeMark`) and the wide sidebar renders the full logo (`FullLogo`); both render the PNG as a data URL from generated data modules (`cubeMarkImage.ts`, `fullLogoImage.ts`), because tsdown cannot bundle `.svg` asset imports from source. The desktop app ships the icon as `apps/desktop/assets/icon.svg` plus `icon.png` and regenerated `icon.ico`/`icon.icns`.

GitHub serves repository SVGs through `raw.githubusercontent.com` with `Content-Security-Policy: default-src 'none'`, which blocks `data:` images inside an SVG rendered as an image: an embedded-raster SVG would appear blank in the repository README. The GitHub-facing surfaces therefore reference plain PNG files — [`assets/lasmex-full.png`](../../../../assets/lasmex-full.png) (and the sibling icon/text PNGs), the same detoured rasters — so `README.md`, `README.zh.md`, and `LASMEX.md` open with the full logo.

## Consequences

Pixel-exact rendering at native size on light and dark backgrounds, with real transparency. There is no scalability gain beyond the native raster size (the PNG is embedded, not vectorized), and the files are heavy (icon ~920 KB, full ~720 KB after base64). Regenerating a mark means re-running the detour and re-copying every surface — the canonical `assets/lasmex-*.svg` copies are the deployment point, and the GitHub-facing `assets/lasmex-*.png` copies ride alongside them.

## Alternatives considered

| Alternative | Contract mismatch |
|---|---|
| Traced vectorization (vtracer, shipped first, then reverted) | Gradient banding reads as pixelation; no automatic tracer reproduces fine gradients exactly. |
| Vectorizer.AI cloud tracing | External paid service, 24-hour retention, no local reproducibility. |
| Ship the raster PNGs directly | White background boxes on dark surfaces. |
| Hand-author the mark with real `linearGradient`s | Full fidelity only by a manual redraw; not attempted in this change. |
