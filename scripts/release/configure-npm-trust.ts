/** Configure npm trusted publishing after the one-time package bootstrap. */

import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { releaseFamily } from './families.ts'
import { isEntry } from './process.ts'

const REPOSITORY = 'lasme-ephrem/LasmeX'
const WORKFLOW = 'release.yml'
const ENVIRONMENT = 'npm-publish'
const MINIMUM_NPM_VERSION = [11, 15, 0] as const

/**
 * Build the npm CLI arguments for one LasmeX package trust relationship.
 * @param name - existing npm package name.
 * @returns Arguments that permit publishing only from the protected release workflow.
 */
export function npmTrustArguments(name: string): string[] {
  return [
    'trust',
    'github',
    name,
    '--file',
    WORKFLOW,
    '--repo',
    REPOSITORY,
    '--env',
    ENVIRONMENT,
    '--allow-publish',
    '--yes',
  ]
}

/** Build the npm CLI arguments that inspect one existing trust relationship. */
export function npmTrustListArguments(name: string): string[] {
  return ['trust', 'list', name, '--json']
}

/**
 * Classify the exact npm trust-list output expected by this release workflow.
 * @param output - standard output from `npm trust list --json`.
 * @returns `absent` when no trust exists, or `matching` for the one approved relationship.
 */
export function npmTrustState(output: string): 'absent' | 'matching' {
  const trimmed = output.trim()
  if (trimmed === '') return 'absent'
  let value: unknown
  try {
    value = JSON.parse(trimmed)
  } catch {
    throw new Error('npm trust list returned non-JSON output for an existing relationship')
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('npm trust list must return one relationship object')
  }
  const fields = value as Record<string, unknown>
  const keys = Object.keys(fields).sort()
  const expectedKeys = ['environment', 'file', 'id', 'permissions', 'repository', 'type']
  const permissions = fields.permissions
  const matches = JSON.stringify(keys) === JSON.stringify(expectedKeys)
    && typeof fields.id === 'string'
    && fields.id !== ''
    && fields.type === 'github'
    && fields.file === WORKFLOW
    && fields.repository === REPOSITORY
    && fields.environment === ENVIRONMENT
    && Array.isArray(permissions)
    && permissions.length === 1
    && permissions[0] === 'createPackage'
  if (!matches) {
    throw new Error(
      'npm trust relationship differs from the required GitHub publisher: '
      + JSON.stringify(value),
    )
  }
  return 'matching'
}

/** Refuse npm versions whose trust command predates the required read API. */
export function npmVersionIssue(version: string): string | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-|$)/.exec(version.trim())
  if (match === null) return `cannot parse npm version ${JSON.stringify(version)}`
  const actual = match.slice(1).map(Number)
  for (const [index, minimum] of MINIMUM_NPM_VERSION.entries()) {
    const part = actual[index] ?? 0
    if (part > minimum) return undefined
    if (part < minimum) return `npm >=11.15.0 is required, got ${version.trim()}`
  }
  return undefined
}

/** Quote one shell argument for the printed owner command. */
function quoted(value: string): string {
  return /^[A-Za-z0-9@/._-]+$/.test(value) ? value : JSON.stringify(value)
}

/** Run or print the post-bootstrap npm trust configuration. */
function main(): void {
  const { values } = parseArgs({
    options: { apply: { type: 'boolean', default: false } },
    allowPositionals: false,
  })
  const members = releaseFamily('lasmex').members(process.cwd())
  if (!values.apply) {
    console.log('Authenticate interactively with npm CLI >=11.15.0 and account-level 2FA, then run:')
    console.log('pnpm run release:configure-npm-trust -- --apply')
    console.log('The command will configure these relationships:')
    for (const member of members) {
      console.log(`npm ${npmTrustArguments(member.name).map(quoted).join(' ')}`)
    }
    return
  }

  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const versionResult = spawnSync(command, ['--version'], { encoding: 'utf8' })
  if (versionResult.error !== undefined) throw versionResult.error
  if (versionResult.status !== 0) throw new Error(`npm --version failed with ${String(versionResult.status)}`)
  const versionIssue = npmVersionIssue(versionResult.stdout)
  if (versionIssue !== undefined) throw new Error(versionIssue)
  let created = 0
  let skipped = 0
  for (const member of members) {
    const existing = spawnSync(command, npmTrustListArguments(member.name), { encoding: 'utf8' })
    if (existing.error !== undefined) throw existing.error
    if (existing.status !== 0) {
      throw new Error(
        `npm trust list failed for ${member.name} with exit status ${String(existing.status)}`
        + `\n${existing.stdout}${existing.stderr}`,
      )
    }
    if (npmTrustState(existing.stdout) === 'matching') {
      console.log(`npm trust: ${member.name} already has the exact required relationship, skipping`)
      skipped += 1
      continue
    }
    const result = spawnSync(command, npmTrustArguments(member.name), { stdio: 'inherit' })
    if (result.error !== undefined) throw result.error
    if (result.status !== 0) {
      throw new Error(`npm trust failed for ${member.name} with exit status ${String(result.status)}`)
    }
    created += 1
  }
  console.log(`npm trust: ${String(created)} configured, ${String(skipped)} exact relationship(s) already present`)
}

if (isEntry(import.meta.url)) main()
