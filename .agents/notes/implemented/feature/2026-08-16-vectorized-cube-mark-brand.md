# Agent Note: Vectorized cube-mark brand

Status: implemented

English | [中文](2026-08-16-vectorized-cube-mark-brand.zh.md)

## Problem

The LasmeX mark existed only as raster PNGs on a flat white canvas (`icon`, `full`, `text`). The favicon must stay sharp at every tab size, the PWA manifest wants an `any`-size icon, the desktop app ships an SVG icon, and dark surfaces (documentation-site navigation, dark UI) cannot carry a white background box. Scaling raster PNGs to each surface would duplicate heavy files and freeze the white canvas onto every dark context.

## Decision

The three PNGs are traced to vector form once: each image is keyed (white background and every near-white pixel, including enclosed letter counters and cube separations, becomes a unique magenta), traced with vtracer (stacked color clusters, spline mode, 16-color palette), and post-filtered so no background key survives. The canonical copies live in [`assets/lasmex-icon.svg`](../../../../assets/lasmex-icon.svg), [`assets/lasmex-full.svg`](../../../../assets/lasmex-full.svg), and [`assets/lasmex-text.svg`](../../../../assets/lasmex-text.svg); every surface copies from them.

Surfaces: the app favicon and the documentation-site favicon ship `lasmex-icon.svg` (`/favicon.svg`, SVG of size `any`), replacing the black LX monogram. The documentation-site navigation lockup inlines `lasmex-full.svg` at 44px instead of the black LX wordmark (`website/public/wordmark.svg` deleted; the LX mark survives only in `LasmexMark.tsx` for the app's hero and narrow rail). The desktop app ships the traced icon as `apps/desktop/assets/icon.svg`. The app's wide sidebar bundles the full logo (`lasmex-client-ui-primitives` `FullLogo`, asset `full-logo.svg`). `README.md`, `README.zh.md`, and `LASMEX.md` open with the full logo.

## Consequences

One scalable mark serves every surface; the traced palette (~35 KB per SVG, ~150 paths) renders identically on light and dark. The cube separations are now transparent gaps, so dark surfaces show the colored cubes directly. Regenerating a mark means re-running the trace from the source PNGs and re-copying every surface — the canonical `assets/lasmex-*.svg` copies are the deployment point.

## Alternatives considered

| Alternative | Contract mismatch |
|---|---|
| Ship the raster PNGs directly | White background boxes on dark surfaces, and a 512px PNG per surface with no sharp small sizes. |
| Hand-author an SVG of the cube mark | No exact fidelity to the designer's render. |
| Keep the black LX wordmark in the documentation navigation | The requested brand presents the full logo, bigger. |
| Keep enclosed white separations | White outlines on dark surfaces read as glitches, not separations. |
