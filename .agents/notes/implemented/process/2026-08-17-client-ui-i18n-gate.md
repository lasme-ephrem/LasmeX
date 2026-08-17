# Agent Note: Client UI i18n gate

Status: implemented

English | [中文](2026-08-17-client-ui-i18n-gate.zh.md)

## Problem

The client ships catalog-driven locales (`fr` default) with a compile-time key balance per namespace, but nothing prevented a developer from writing user-visible text directly in a component. A first scan found 13 hardcoded texts across 96 files: the manual-compaction row title `compact`, the retry delay unit `ms`, two example placeholders (`acme-gateway`, `https://gateway.example/v1`), and ten `tok` unit labels. The French-first promise therefore depended on discipline, not on a gate.

## Decision

A new executed gate, `verify-client-i18n` (`scripts/verify-client-i18n.ts`), walks the TypeScript AST of every `packages/client/**/src/client/**/*.tsx` source and flags: JSX text nodes with letters, literal `aria-label` / `aria-description` / `placeholder` / `title` / `alt` attributes, and string literals directly inside JSX expressions (`{'text'}`). Punctuation- and digit-only literals pass. The gate is wired into `doc-sync` (the `client-i18n` entry beside French documentation parity) and proven by a spec that rejects each invalid case and accepts catalog-driven UI.

The 13 violations were fixed by cataloging: `usage.tokenCount`/`usage.tokenRate` (trajectory token units), `message.retry.delayValue` (retry delay), `customRoutePlaceholder`/`baseUrlPlaceholder` (example values, same string in every locale), and the compaction row title now uses the existing `message.compaction` key (French `Contexte compacté`). Tests that described the hardcoded strings now describe the cataloged ones.

## Consequences

Every shipped client `.tsx` file must route user-visible text through its catalog; `doc-sync` fails otherwise. The scanner's blind spots are documented in its header: strings nested inside JSX expression code (ternary branches, call arguments), plain `.ts` modules, and runtime error messages (`promptError.error.message`, `block.error.name`) are not covered yet — the error-message cataloging is the next volet.

## Alternatives considered

| Alternative | Contract mismatch |
|---|---|
| Lint rule for hardcoded strings | No existing rule matches JSX text semantics; a bespoke AST gate stays exact and stays testable. |
| Scan `.ts` files too | String literals in code are mostly non-UI; flagging them would drown the signal. |
| Exempt units and placeholders | Units and example values are still user-visible; cataloging them costs one key and keeps the gate total. |
