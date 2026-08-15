# Contributing

English | [中文](CONTRIBUTING.zh.md)

Thank you for helping improve LasmeX. Bug reports, focused pull requests, documentation, plugins, and user feedback are welcome in the public [LasmeX repository](https://github.com/lasme-ephrem/LasmeX).

## Before changing code

- Search existing Issues and Discussions before opening a duplicate.
- Use an Issue or Discussion for a large feature, security-sensitive change, or architectural change before investing in an implementation.
- Report vulnerabilities privately through GitHub’s security advisory form; do not publish exploit details in an Issue.

## Develop and validate

1. Fork the repository and create a focused branch from `master`.
2. Install Node.js 22.19 or newer and pnpm, then run `pnpm install --frozen-lockfile`.
3. Follow [AGENTS.md](AGENTS.md), the package-level instructions, and the documented plugin architecture.
4. Add or update tests and documentation for every behavior you change. Non-trivial changes also require an Agent Note.
5. Run the smallest relevant checks described in [docs/testing.md](docs/testing.md). Run `pnpm run doc-sync` for documentation changes.
6. Open a pull request that explains the user-visible outcome, validation performed, limitations, and security impact.

## Pull request expectations

- Keep unrelated changes in separate pull requests and preserve upstream attribution.
- Never commit API keys, signing certificates, tokens, user sessions, build staging directories, or generated release artifacts.
- Keep English and Chinese documentation pairs synchronized. French website sources are reviewed independently under the repository translation policy.
- Product-visible GUI changes include a GIF recorded from the real assembled application flow.
- Review feedback and continuous-integration failures are resolved before merge. The repository uses squash merges and deletes merged branches automatically.

## Community extensions

LasmeX is designed for independent plugins and complete capability seams. Add the `lasmex-plugin` topic to a public plugin repository so users can discover it, and document the permissions, model-visible inputs, persistent data, and failure behavior the plugin owns.

By contributing, you agree that your work is provided under the repository’s [MIT license](LICENSE).
