/** Enforce immutable actions and least-privilege publication workflow policy. */

import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load as loadYaml } from 'js-yaml'
import { isEntry } from './process.ts'

/** An action reference and its location in a workflow value tree. */
export interface ActionReference {
  /** Dotted YAML location used in diagnostics. */
  readonly location: string
  /** `uses` value from the workflow. */
  readonly value: string
}

/**
 * Collect every action and reusable-workflow reference.
 * @param value - parsed workflow value.
 * @param location - current dotted YAML path.
 * @returns All nested `uses` references.
 */
export function actionReferences(value: unknown, location = ''): ActionReference[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => actionReferences(entry, `${location}[${String(index)}]`))
  }
  if (value === null || typeof value !== 'object') return []
  const references: ActionReference[] = []
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const child = location === '' ? key : `${location}.${key}`
    if (key === 'uses' && typeof entry === 'string') references.push({ location: child, value: entry })
    references.push(...actionReferences(entry, child))
  }
  return references
}

/**
 * Check whether an action reference is local, Docker-addressed, or immutable.
 * @param reference - `uses` value.
 * @returns An error when a third-party action does not use a commit SHA.
 */
export function actionPinIssue(reference: string): string | undefined {
  if (reference.startsWith('./')) return undefined
  if (/^docker:\/\/[^\s@]+@sha256:[0-9a-f]{64}$/.test(reference)) return undefined
  if (reference.startsWith('docker://')) return `Docker action must use an image digest: ${reference}`
  if (/^[^@\s]+@[0-9a-f]{40}$/.test(reference)) return undefined
  return `external action must use a full commit SHA: ${reference}`
}

/** Read a workflow as a JSON-like object. */
function workflow(path: string): Record<string, unknown> {
  const value: unknown = loadYaml(readFileSync(path, 'utf8'))
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must contain a workflow object`)
  }
  return value as Record<string, unknown>
}

/** Read one required workflow job. */
function job(value: Record<string, unknown>, name: string, path: string): Record<string, unknown> {
  const jobs = value.jobs
  if (jobs === null || typeof jobs !== 'object' || Array.isArray(jobs)) {
    throw new TypeError(`${path} must define jobs`)
  }
  const selected = (jobs as Record<string, unknown>)[name]
  if (selected === null || typeof selected !== 'object' || Array.isArray(selected)) {
    throw new TypeError(`${path} must define job ${name}`)
  }
  return selected as Record<string, unknown>
}

/** Return true when a job owns exactly the named permission level. */
function permission(selected: Record<string, unknown>, name: string, level: string): boolean {
  const permissions = selected.permissions
  return permissions !== null && typeof permissions === 'object' && !Array.isArray(permissions)
    && (permissions as Record<string, unknown>)[name] === level
}

/**
 * Verify every repository workflow and the security-critical release jobs.
 * @param root - repository root.
 * @returns Every policy violation.
 */
export function workflowSecurityIssues(root: string): string[] {
  const directory = resolve(root, '.github/workflows')
  const issues: string[] = []
  for (const filename of readdirSync(directory).filter(name => /\.ya?ml$/.test(name)).sort()) {
    const path = resolve(directory, filename)
    const parsed = workflow(path)
    for (const reference of actionReferences(parsed)) {
      const issue = actionPinIssue(reference.value)
      if (issue !== undefined) issues.push(`${filename}:${reference.location}: ${issue}`)
    }
    const text = readFileSync(path, 'utf8')
    if (/\bNPM_TOKEN\b/.test(text)) {
      issues.push(`${filename}: generic npm publication tokens are forbidden; keep bootstrap isolated`)
    }
    if (/attestations:\s*false/.test(text)) issues.push(`${filename}: PyPI attestations must stay enabled`)
    if (/\b(?:ubuntu|macos|windows)-latest\b/.test(text)) {
      issues.push(`${filename}: hosted runners must use an explicit operating-system label`)
    }
  }

  const releasePath = resolve(directory, 'release.yml')
  const release = workflow(releasePath)
  const npm = job(release, 'publish-npm', releasePath)
  const npmBootstrap = job(release, 'bootstrap-npm', releasePath)
  const runtime = job(release, 'publish-python-runtime', releasePath)
  const sdk = job(release, 'publish-python-sdk', releasePath)
  const draft = job(release, 'attest-and-draft', releasePath)
  const final = job(release, 'finalize', releasePath)
  for (const [name, selected, environment] of [
    ['publish-npm', npm, 'npm-publish'],
    ['publish-python-runtime', runtime, 'pypi-runtime'],
    ['publish-python-sdk', sdk, 'pypi'],
  ] as const) {
    if (selected.environment !== environment) issues.push(`release.yml:${name} must use ${environment}`)
    if (!permission(selected, 'contents', 'read') || !permission(selected, 'id-token', 'write')) {
      issues.push(`release.yml:${name} must grant only read contents plus OIDC`)
    }
  }
  if (draft.environment !== 'github-release'
    || !permission(draft, 'contents', 'write')
    || !permission(draft, 'id-token', 'write')
    || !permission(draft, 'attestations', 'write')) {
    issues.push('release.yml:attest-and-draft must own the protected draft and attestation permissions')
  }
  if (final.environment !== 'github-release' || !permission(final, 'contents', 'write')) {
    issues.push('release.yml:finalize must publish through the github-release environment')
  }
  if (npmBootstrap.environment !== 'npm-bootstrap'
    || !permission(npmBootstrap, 'contents', 'read')
    || !permission(npmBootstrap, 'id-token', 'write')) {
    issues.push('release.yml:bootstrap-npm must use npm-bootstrap with read-only repository access plus provenance OIDC')
  }
  const releaseText = readFileSync(releasePath, 'utf8')
  if (!releaseText.includes('LASMEX_NPM_BOOTSTRAP_TOKEN')
    || !releaseText.includes("inputs.npm_authentication == 'bootstrap'")
    || !releaseText.includes('release:configure-npm-trust -- --apply')
    || (releaseText.match(/release:publish --family lasmex --from dist --provenance/g)?.length ?? 0) !== 2) {
    issues.push('release.yml must keep the one-time npm bootstrap isolated from trusted publishing')
  }
  if ((releaseText.match(/prepare-pypi-publish\.ts/g)?.length ?? 0) !== 2
    || !releaseText.includes("if: steps.publish-plan.outputs.publish == 'true'")
    || releaseText.includes('skip-existing')) {
    issues.push('release.yml must resume both PyPI projects through exact remote hash verification')
  }
  if (!releaseText.includes('path: sbom-inputs')
    || !releaseText.includes('app.asar')
    || !releaseText.includes('syft-version: v1.50.0')
    || !releaseText.includes('verify-sbom.ts')
    || !releaseText.includes('upload-release-assets: false')) {
    issues.push('release.yml must extract and inventory npm, Python, desktop, and Electron SBOM inputs')
  }
  for (const subject of ['release-assets/**/RELEASES', 'release-assets/**/manifest-*.json', 'release-assets/**/SHA256SUMS']) {
    if (!releaseText.includes(subject)) issues.push(`release.yml attestation subjects must include ${subject}`)
  }
  const registryPreflightText = readFileSync(resolve(root, 'scripts/release/verify-registry-names.ts'), 'utf8')
  if (!registryPreflightText.includes('Public metadata does not prove maintainership')) {
    issues.push('registry preflight must state that public source metadata does not prove authority')
  }
  if (/\b0\.1\.0\b/.test(releaseText)) issues.push('release.yml must derive release versions from manifests')
  if (releaseText.includes('secrets: inherit')
    || (releaseText.match(/inputs\.publish && secrets\.LASMEX_/g)?.length ?? 0) !== 7) {
    issues.push('release.yml must pass only release-gated desktop signing secrets')
  }

  const desktopPath = resolve(directory, 'build-desktop.yml')
  const desktop = workflow(desktopPath)
  const releaseContext = job(desktop, 'release-context', desktopPath)
  const desktopText = readFileSync(desktopPath, 'utf8')
  const contextText = JSON.stringify(releaseContext)
  if (!contextText.includes('refs/tags/lasmex-v$version')
    || !contextText.includes('$GITHUB_SHA')
    || !contextText.includes('git rev-parse')) {
    issues.push('build-desktop.yml must authorize release signing against the exact version tag and commit SHA')
  }
  for (const name of ['windows-signed', 'macos-signed'] as const) {
    const selected = job(desktop, name, desktopPath)
    if (selected.environment !== 'desktop-signing'
      || selected.if !== '${{ inputs.release }}'
      || selected.needs !== 'release-context') {
      issues.push(`build-desktop.yml:${name} must be release-only behind the desktop-signing environment and ref gate`)
    }
  }
  for (const name of ['windows-unsigned', 'macos-unsigned'] as const) {
    const selected = job(desktop, name, desktopPath)
    const serialized = JSON.stringify(selected)
    if ('environment' in selected
      || selected.if !== '${{ !inputs.release }}'
      || serialized.includes('secrets.')
      || serialized.includes('LASMEX_DESKTOP_RELEASE')) {
      issues.push(`build-desktop.yml:${name} must not receive release environments, secrets, or release mode`)
    }
  }
  if (/\b0\.1\.0\b/.test(desktopText)) issues.push('build-desktop.yml must derive artifact versions from manifests')

  const pythonBuilderText = readFileSync(resolve(directory, 'build-exe-for-python-sdk.yml'), 'utf8')
  for (const image of ['manylinux_2_28_x86_64', 'manylinux_2_28_aarch64']) {
    const references = [...pythonBuilderText.matchAll(new RegExp(`quay\\.io/pypa/${image}[^ ;]*`, 'g'))]
      .map(match => match[0])
    if (references.length === 0 || references.some(reference => !/@sha256:[0-9a-f]{64}$/.test(reference))) {
      issues.push(`build-exe-for-python-sdk.yml must pin ${image} by digest`)
    }
  }

  const pagesPath = resolve(directory, 'docs-pages.yml')
  const pages = workflow(pagesPath)
  const deploy = job(pages, 'deploy', pagesPath)
  const pagesEnvironment = deploy.environment
  if (pagesEnvironment === null || typeof pagesEnvironment !== 'object' || Array.isArray(pagesEnvironment)
    || (pagesEnvironment as Record<string, unknown>).name !== 'github-pages'
    || !permission(deploy, 'pages', 'write')
    || !permission(deploy, 'id-token', 'write')) {
    issues.push('docs-pages.yml:deploy must use the github-pages environment with Pages OIDC permissions')
  }

  const ciText = readFileSync(resolve(directory, 'ci.yml'), 'utf8')
  if (/dsh-(?:ubuntu|windows)|self-hosted|DSH_CI_FAILOVER/.test(ciText)) {
    issues.push('ci.yml must not depend on upstream private runner labels or failover variables')
  }
  return issues
}

/** Run the workflow security gate. */
function main(): void {
  const issues = workflowSecurityIssues(process.cwd())
  if (issues.length > 0) throw new Error(`workflow security verification failed:\n${issues.join('\n')}`)
  console.log(
    'release workflows: pins, public runners, resumable registries, SBOM inventory, isolated signing, attestations, drafts, and Pages verified',
  )
}

if (isEntry(import.meta.url)) main()
