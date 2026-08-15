# Agent Note: French-first command line

Status: implemented

English | [中文](2026-08-14-french-first-command-line.zh.md)

## Problem

LasmeX is a French-first product, but its launcher, Web server, and headless entry point still exposed Commander headings, usage examples, validation errors, and the headless persona in English. Translating only the top-level description would leave normal startup failures and subcommand help in a mixed language.

## Decision

The shared command-line package owns `configureFrenchCommand()`, which configures Commander headings and its error prefix without changing stable command names or option flags. The LasmeX launcher and the Web and headless entry points provide their user-facing descriptions, examples, and validation messages in French.

The headless bundle also uses a French-first LasmeX persona and prefixes fatal runtime diagnostics with `LasmeX`. Provider identifiers, environment-variable names, subprocess output, and diagnostics owned by external tools remain unchanged because translating them would alter interfaces or hide their source.

## Consequences

French help and first-party startup errors are consistent across source and built launch paths. New first-party commands must apply the shared configuration and own French descriptions at their parsing boundary. Tests assert the localized errors and built-binary help so source-only behavior cannot mask a packaging regression.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Translate only the root `lasmex --help` output | Web and headless usage, subcommand errors, and direct bundle execution would remain English. |
| Rename command names and option flags into French | It would make scripts harder to share and turn localization into an unstable command interface. |
| Translate every downstream diagnostic | Provider and external-tool errors need to remain searchable and attributable to their actual owner. |
