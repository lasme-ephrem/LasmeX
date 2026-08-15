/**
 * Enforce the MIT license declaration for repository-owned LasmeX npm packages.
 * @module scripts/verify-lasmex-package-licenses
 */

import { globSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const LASMEX_PACKAGE_NAME = /^lasmex(?:-|$)/

/** Result of checking every publishable LasmeX package reachable through the root workspace list. */
export interface LasmeXPackageLicenseReport {
  /** Number of LasmeX package manifests checked. */
  packageCount: number
  /** Repository-relative diagnostics for non-MIT declarations. */
  failures: string[]
}

function readManifest(root: string, file: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(resolve(root, file), 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`verify-lasmex-package-licenses: ${file} must contain a JSON object.`)
  }
  return parsed as Record<string, unknown>
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === 'string')
}

function workspaceManifestPaths(root: string): string[] {
  const rootManifest = readManifest(root, 'package.json')
  const workspaces = rootManifest.workspaces
  if (!isStringArray(workspaces)) {
    throw new Error('verify-lasmex-package-licenses: package.json workspaces must be a string array.')
  }

  const files = new Set(['package.json'])
  for (const pattern of workspaces) {
    for (const file of globSync(`${pattern}/package.json`, { cwd: root })) {
      files.add(file)
    }
  }
  return [...files].sort()
}

function printable(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value)
}

/**
 * Check every publishable LasmeX npm package declared by the repository workspace.
 * @param root - absolute repository root containing the workspace package.json.
 * @returns The checked package count and every non-MIT declaration.
 */
export function inspectLasmeXPackageLicenses(root: string): LasmeXPackageLicenseReport {
  let packageCount = 0
  const failures: string[] = []

  for (const file of workspaceManifestPaths(root)) {
    const manifest = readManifest(root, file)
    const name = manifest.name
    if (typeof name !== 'string' || !LASMEX_PACKAGE_NAME.test(name) || manifest.private === true) continue

    packageCount++
    if (manifest.license !== 'MIT') {
      const normalizedFile = file.split(sep).join('/')
      failures.push(
        `${normalizedFile}: ${name} must declare "license": "MIT"; found ${printable(manifest.license)}.`,
      )
    }
  }

  return { packageCount, failures }
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const report = inspectLasmeXPackageLicenses(ROOT)
  if (report.failures.length > 0) {
    process.stderr.write('verify-lasmex-package-licenses: non-MIT LasmeX package declarations found:\n')
    for (const failure of report.failures) process.stderr.write(`  ${failure}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(
      `verify-lasmex-package-licenses: ${String(report.packageCount)} LasmeX package(s) checked; all declare MIT.\n`,
    )
  }
}
