/** Verify that every public LasmeX distribution projects one stable version. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { releaseFamily } from './families.ts'
import { isEntry } from './process.ts'

/** Values whose equality makes one tag safe for every public distribution. */
export interface DistributionVersions {
  /** Workspace root and npm family version. */
  readonly repository: string
  /** Private desktop distribution manifest version. */
  readonly desktop: string
  /** Python SDK project version. */
  readonly pythonSdk: string
  /** Python runtime project version. */
  readonly pythonRuntime: string
  /** Runtime deploy-root manifest version. */
  readonly runtimeClosure: string
  /** SDK dependency pinned to the matching runtime wheel. */
  readonly pythonRuntimeRequirement: string
}

/**
 * Report public npm description identity defects.
 * @param name - package name for diagnostics.
 * @param description - manifest description value.
 * @returns Public metadata violations.
 */
export function packageDescriptionIssues(name: string, description: unknown): string[] {
  if (typeof description !== 'string' || description.trim() === '') {
    return [`${name} must declare a non-empty public description`]
  }
  const issues: string[] = []
  if (/\bthe LasmeX\b/i.test(description)) issues.push(`${name} description must use LasmeX as a proper name`)
  if (/\bdsh-[a-z0-9-]+\b/i.test(description)) issues.push(`${name} description exposes a retired dsh package name`)
  return issues
}

/**
 * Report version inconsistencies without hiding more than one bad manifest.
 * @param versions - versions read from public distribution manifests.
 * @returns Human-readable violations; an empty list means the release versions agree.
 */
export function distributionVersionIssues(versions: DistributionVersions): string[] {
  const issues: string[] = []
  if (!/^\d+\.\d+\.\d+$/.test(versions.repository)) {
    issues.push(`repository version ${versions.repository} is not stable semver`)
  }
  for (const [label, version] of Object.entries(versions)) {
    if (version !== versions.repository) {
      issues.push(`${label} version ${version} does not match repository ${versions.repository}`)
    }
  }
  return issues
}

/** Read a JSON object from a release manifest. */
function jsonObject(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must contain a JSON object`)
  }
  return value as Record<string, unknown>
}

/** Read a required JSON string version field. */
function jsonVersion(path: string): string {
  const version = jsonObject(path).version
  if (typeof version !== 'string') throw new TypeError(`${path} must declare a string version`)
  return version
}

/** Read one Python project's name, version, and dependency list. */
function pythonProject(path: string): { name: string; version: string; dependencies: readonly string[] } {
  const value: unknown = parseToml(readFileSync(path, 'utf8'))
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must contain a TOML object`)
  }
  const project = (value as Record<string, unknown>).project
  if (project === null || typeof project !== 'object' || Array.isArray(project)) {
    throw new TypeError(`${path} must declare [project]`)
  }
  const fields = project as Record<string, unknown>
  if (typeof fields.name !== 'string' || typeof fields.version !== 'string') {
    throw new TypeError(`${path} [project] must declare string name and version fields`)
  }
  const dependencies = fields.dependencies
  if (dependencies !== undefined && (!Array.isArray(dependencies)
    || dependencies.some(dependency => typeof dependency !== 'string'))) {
    throw new TypeError(`${path} project.dependencies must contain strings`)
  }
  return { name: fields.name, version: fields.version, dependencies: dependencies as string[] | undefined ?? [] }
}

/**
 * Verify npm, Python, and desktop release metadata in one checkout.
 * @param root - repository root.
 * @returns Every version or naming violation.
 */
export function distributionIssues(root: string): string[] {
  const rootManifest = jsonObject(resolve(root, 'package.json'))
  const repository = rootManifest.version
  if (typeof repository !== 'string') throw new TypeError('package.json must declare a string version')
  const desktopManifest = jsonObject(resolve(root, 'apps/desktop/package.json'))
  const desktop = desktopManifest.version
  if (typeof desktop !== 'string') throw new TypeError('apps/desktop/package.json must declare a string version')
  const runtimeClosure = jsonVersion(resolve(root, 'python/sdk-runtime/package.json'))
  const sdk = pythonProject(resolve(root, 'python/sdk/pyproject.toml'))
  const runtime = pythonProject(resolve(root, 'python/sdk-runtime/pyproject.toml'))
  const issues = distributionVersionIssues({
    repository,
    desktop,
    pythonSdk: sdk.version,
    pythonRuntime: runtime.version,
    runtimeClosure,
    pythonRuntimeRequirement: sdk.dependencies
      .find(dependency => dependency.startsWith('lasmex-runtime-bin=='))
      ?.slice('lasmex-runtime-bin=='.length) ?? '(missing)',
  })

  if (sdk.name !== 'lasmex-sdk') issues.push(`Python SDK project must be named lasmex-sdk, got ${sdk.name}`)
  if (runtime.name !== 'lasmex-runtime-bin') {
    issues.push(`Python runtime project must be named lasmex-runtime-bin, got ${runtime.name}`)
  }
  const rootScripts = rootManifest.scripts
  const desktopScripts = desktopManifest.scripts
  if (rootScripts === null || typeof rootScripts !== 'object' || Array.isArray(rootScripts)
    || desktopScripts === null || typeof desktopScripts !== 'object' || Array.isArray(desktopScripts)) {
    issues.push('root and desktop manifests must declare script objects')
  } else {
    for (const platform of ['windows', 'macos', 'linux'] as const) {
      const rootCommand = (rootScripts as Record<string, unknown>)[`desktop:make:${platform}`]
      const desktopCommand = (desktopScripts as Record<string, unknown>)[`make:${platform}`]
      if (rootCommand !== `pnpm --filter lasmex-desktop run make:${platform}`) {
        issues.push(`root manifest must expose desktop:make:${platform}`)
      }
      if (typeof desktopCommand !== 'string') issues.push(`desktop manifest must expose make:${platform}`)
    }
  }
  const family = releaseFamily('lasmex')
  const members = family.members(root)
  try {
    family.verifyVersions(members)
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error))
  }
  for (const member of members) {
    if (member.version !== repository) {
      issues.push(`${member.directory} version ${member.version} does not match repository ${repository}`)
    }
    issues.push(...packageDescriptionIssues(member.name, member.manifest.description))
  }
  return issues
}

/** Run the repository distribution gate. */
function main(): void {
  const issues = distributionIssues(process.cwd())
  if (issues.length > 0) throw new Error(`distribution verification failed:\n${issues.join('\n')}`)
  const version = jsonVersion(resolve(process.cwd(), 'package.json'))
  console.log(`release distribution: npm, Python, and desktop metadata agree on stable version ${version}`)
}

if (isEntry(import.meta.url)) main()
