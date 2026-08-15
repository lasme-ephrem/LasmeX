# Agent Note: French-first client locale

Status: implemented

English | [中文](2026-08-14-french-first-client-locale.zh.md)

## Problem

LasmeX identifies as a French-first product, but declaring French before every browser namespace has a complete dictionary would expose a mixed interface. Making French unconditional would also ignore an explicit English or Chinese browser preference and break the existing language-selection behavior.

## Decision

The client ships `fr`, `en`, and `zh` as one typed locale set. Every typed namespace registration provides all three dictionaries, and dynamic namespaces register a French seat alongside their English and Chinese seats. The registry continues to reject an incomplete typed registration at compile time.

A fresh browser selects its first supported primary language subtag. French browsers therefore open in French, English and Chinese browsers retain their requested language, and French is the product fallback when the browser requests no shipped language. An explicit `locale.preference` remains authoritative after the Host settings document loads.

French is the lookup fallback for missing active-locale keys. This makes French the LasmeX product baseline while preserving intentional language selection. The Web document declares `lang="fr"` for its static shell, and `LocaleRuntime` synchronizes that attribute with every browser or stored selection so assistive technology observes the active catalog. The welcome notice has an owned French copy rather than assembling translated fragments.

## Consequences

Adding a locale now requires a complete dictionary for every typed namespace before the client builds. French copy covers the main conversation, models, settings, permissions, workspaces, workflows, subagents, Cordis, directory browsing, session export, and the complete trajectory timeline, ledger, inspector, status, error, tooltip, JSON-copy action, and accessibility surfaces. Reasoning disclosures, skill rows, plan-mode failures, authentication failures, shipped permission names and impact descriptions, accessible footnote headings, Cordis inspection actions, tool-row titles, input/output gutters, inspection buttons, and the structured diff, read, search, and web cards also resolve through their owning dictionaries instead of retaining inline English or Chinese labels. Stable wire names such as `grep`, `glob`, and `pwsh` remain technical identifiers. English and Chinese remain selectable and their existing browser scenarios remain valid.

Inline strings outside the locale registry can still exist. They must move into their owning namespace when that surface is localized; the registry cannot detect text that was never declared as translatable.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Force French regardless of browser language | It would make explicit English and Chinese browser preferences ineffective before settings load. |
| Add only the most visible French strings | Missing states, errors, and accessible labels would produce a mixed-language product. |
| Use English or Chinese as the missing-key fallback | LasmeX would cease to be French-first exactly when a translation defect occurs. |
