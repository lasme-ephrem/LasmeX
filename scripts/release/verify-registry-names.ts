/** Refuse publication when registry source metadata points outside this repository. */

import { parseArgs } from 'node:util'
import { releaseFamily } from './families.ts'
import { isEntry } from './process.ts'

const REPOSITORY_URL = 'https://github.com/lasme-ephrem/LasmeX'
const PYPI_PROJECTS = ['lasmex-sdk', 'lasmex-runtime-bin'] as const

/** One registry response relevant to name availability and source metadata. */
export interface RegistryMetadata {
  /** HTTP status returned by the registry. */
  readonly status: number
  /** Parsed registry document when the name exists. */
  readonly payload?: unknown
}

/** Normalize repository URL spellings published by npm and PyPI. */
function normalizeRepositoryUrl(value: string): string {
  return value
    .replace(/^git\+/, '')
    .replace(/^git:\/\/github\.com\//, 'https://github.com/')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
}

/** Read an npm packument's source repository URL. */
function npmRepository(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const repository = (payload as Record<string, unknown>).repository
  if (typeof repository === 'string') return repository
  if (repository === null || typeof repository !== 'object' || Array.isArray(repository)) return undefined
  const url = (repository as Record<string, unknown>).url
  return typeof url === 'string' ? url : undefined
}

/** Read a PyPI project document's Repository project URL. */
function pypiRepository(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const info = (payload as Record<string, unknown>).info
  if (info === null || typeof info !== 'object' || Array.isArray(info)) return undefined
  const projectUrls = (info as Record<string, unknown>).project_urls
  if (projectUrls === null || typeof projectUrls !== 'object' || Array.isArray(projectUrls)) return undefined
  const repository = (projectUrls as Record<string, unknown>).Repository
  return typeof repository === 'string' ? repository : undefined
}

/**
 * Detect a public-name conflict from registry source metadata.
 * @param registry - registry whose response is being checked.
 * @param name - public distribution name.
 * @param metadata - HTTP status and parsed document.
 * @returns A source-metadata error, or undefined when the name is absent or points at LasmeX.
 */
export function registryMetadataIssue(
  registry: 'npm' | 'pypi',
  name: string,
  metadata: RegistryMetadata,
): string | undefined {
  if (metadata.status === 404) return undefined
  if (metadata.status !== 200) return `${registry} returned HTTP ${String(metadata.status)} for ${name}`
  const repository = registry === 'npm' ? npmRepository(metadata.payload) : pypiRepository(metadata.payload)
  if (repository === undefined) return `${registry} name ${name} exists without a Repository URL`
  if (normalizeRepositoryUrl(repository).toLowerCase() !== REPOSITORY_URL.toLowerCase()) {
    return `${registry} name ${name} points at ${repository}, not ${REPOSITORY_URL}`
  }
  return undefined
}

/** Fetch and parse one registry document. */
async function registryMetadata(registry: 'npm' | 'pypi', name: string): Promise<RegistryMetadata> {
  const url = registry === 'npm'
    ? `https://registry.npmjs.org/${encodeURIComponent(name)}`
    : `https://pypi.org/pypi/${encodeURIComponent(name)}/json`
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
  if (response.status === 404) return { status: 404 }
  if (response.status !== 200) return { status: response.status }
  return { status: 200, payload: await response.json() }
}

/** Verify every name in the selected public registry. */
async function verifyRegistry(registry: 'npm' | 'pypi'): Promise<void> {
  const names = registry === 'npm'
    ? releaseFamily('lasmex').members(process.cwd()).map(member => member.name)
    : [...PYPI_PROJECTS]
  const issues: string[] = []
  let index = 0
  const workers = Array.from({ length: Math.min(16, names.length) }, async () => {
    while (index < names.length) {
      const name = names[index]
      index += 1
      if (name === undefined) continue
      const issue = registryMetadataIssue(registry, name, await registryMetadata(registry, name))
      if (issue !== undefined) issues.push(issue)
    }
  })
  await Promise.all(workers)
  if (issues.length > 0) throw new Error(`registry source-metadata verification failed:\n${issues.sort().join('\n')}`)
  console.log(
    `release registry: ${String(names.length)} ${registry} name(s) are absent or point at ${REPOSITORY_URL}. `
    + 'Public metadata does not prove maintainership; registry authentication remains authoritative.',
  )
}

/** Run one selected registry gate, or both gates when no registry is selected. */
async function main(): Promise<void> {
  const { values } = parseArgs({ options: { registry: { type: 'string' } }, allowPositionals: false })
  if (values.registry !== undefined && values.registry !== 'npm' && values.registry !== 'pypi') {
    throw new Error('usage: verify-registry-names.ts --registry <npm|pypi>')
  }
  if (values.registry === undefined) {
    await verifyRegistry('npm')
    await verifyRegistry('pypi')
    return
  }
  await verifyRegistry(values.registry)
}

if (isEntry(import.meta.url)) await main()
