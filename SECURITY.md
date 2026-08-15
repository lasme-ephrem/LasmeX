# LasmeX security policy

English | [中文](SECURITY.zh.md)

## Supported versions

Security fixes are provided for the latest stable `0.1.x` release and the `master` branch until a later stable series is published. Prereleases, older stable series, forks, and locally modified builds are not supported unless a maintainer states otherwise in a security advisory.

## Report a vulnerability privately

Use [GitHub Private Vulnerability Reporting](https://github.com/lasme-ephrem/LasmeX/security/advisories/new). Do not open a public issue, discussion, or pull request for an unpatched vulnerability, leaked credential, signing-key concern, or suspected zero-day.

Include the affected version or commit, the component and platform, reproducible steps or a minimal proof of concept, the expected security property, the observed impact, and any known mitigations. Remove credentials and personal data from the report. Reports may be submitted in English or French.

Maintainers aim to acknowledge a report within three business days, complete initial triage within seven business days, and provide an update at least every fourteen days while remediation is active. These are response targets, not disclosure or fix deadlines. Severity, exploitability, release coordination, and upstream dependencies determine the remediation schedule.

Please allow coordinated remediation and publication before disclosure. The maintainers will credit reporters who request attribution and may ask for verification of a candidate fix.

## Scope

This policy covers LasmeX source, official npm and PyPI distributions, desktop release artifacts, release automation, and the documentation site published from `lasme-ephrem/LasmeX`. Report a vendored Cordis or native-launcher issue here when it affects a LasmeX distribution; maintainers will coordinate with the upstream project when appropriate. Vulnerabilities in the DeepSeek API or another external provider belong to that provider unless LasmeX integration creates or amplifies the issue.

Public bug reports that do not disclose an exploitable security weakness remain welcome in the repository issue tracker.
