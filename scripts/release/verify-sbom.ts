/** Verify that the release SBOM inventories every npm, Python, and Electron product component. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { releaseFamily } from './families.ts'
import { isEntry } from './process.ts'

/** One component that the assembled SPDX document must contain. */
export interface SbomComponent {
  /** Registry or application package name. */
  readonly name: string
  /** Exact release or runtime version. */
  readonly version: string
}

/** Normalize Python distribution separators without weakening package identity. */
function normalizedName(name: string): string {
  return name.toLowerCase().replaceAll('_', '-')
}

/**
 * Report missing exact components in an SPDX JSON document.
 * @param document - parsed SPDX JSON emitted by Syft.
 * @param expected - required release inventory.
 * @returns Missing or malformed inventory violations.
 */
export function sbomInventoryIssues(document: unknown, expected: readonly SbomComponent[]): string[] {
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    return ['SBOM must be an SPDX JSON object']
  }
  const packages = (document as Record<string, unknown>).packages
  if (!Array.isArray(packages)) return ['SBOM must contain a packages array']
  const actual = new Set<string>()
  for (const entry of packages) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
    const fields = entry as Record<string, unknown>
    if (typeof fields.name === 'string' && typeof fields.versionInfo === 'string') {
      actual.add(`${normalizedName(fields.name)}@${fields.versionInfo}`)
    }
  }
  return expected
    .filter(component => !actual.has(`${normalizedName(component.name)}@${component.version}`))
    .map(component => `SBOM is missing ${component.name}@${component.version}`)
}

/** Read a JSON object. */
function jsonObject(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must contain a JSON object`)
  }
  return value as Record<string, unknown>
}

/** Build the inventory required for one product release. */
function expectedInventory(root: string, version: string): SbomComponent[] {
  const desktop = jsonObject(resolve(root, 'apps/desktop/package.json'))
  const devDependencies = desktop.devDependencies
  if (devDependencies === null || typeof devDependencies !== 'object' || Array.isArray(devDependencies)) {
    throw new TypeError('apps/desktop/package.json must declare devDependencies')
  }
  const electron = (devDependencies as Record<string, unknown>).electron
  if (typeof electron !== 'string' || !/^\d+\.\d+\.\d+$/.test(electron)) {
    throw new TypeError('apps/desktop/package.json must pin an exact Electron version')
  }
  return [
    ...releaseFamily('lasmex').members(root).map(member => ({ name: member.name, version })),
    { name: 'lasmex-sdk', version },
    { name: 'lasmex-runtime-bin', version },
    { name: 'lasmex-desktop', version },
    { name: 'electron', version: electron },
  ]
}

/** Verify one Syft SPDX JSON release inventory. */
function main(): void {
  const { values } = parseArgs({
    options: { file: { type: 'string' }, version: { type: 'string' } },
    allowPositionals: false,
  })
  if (values.file === undefined || values.version === undefined) {
    throw new Error('usage: verify-sbom.ts --file <SBOM.spdx.json> --version <release version>')
  }
  const rootVersion = jsonObject(resolve(process.cwd(), 'package.json')).version
  if (rootVersion !== values.version) {
    throw new Error(`SBOM version ${values.version} does not match repository ${String(rootVersion)}`)
  }
  const document: unknown = JSON.parse(readFileSync(resolve(process.cwd(), values.file), 'utf8'))
  const expected = expectedInventory(process.cwd(), values.version)
  const issues = sbomInventoryIssues(document, expected)
  if (issues.length > 0) throw new Error(`SBOM inventory verification failed:\n${issues.join('\n')}`)
  console.log(`release SBOM: ${String(expected.length)} required npm, Python, desktop, and Electron components verified`)
}

if (isEntry(import.meta.url)) main()
