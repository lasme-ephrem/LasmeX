/** Select only absent PyPI wheels after verifying every existing file by SHA-256. */

import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { isEntry } from './process.ts'

/** A locally built wheel and its immutable content digest. */
export interface LocalWheel {
  /** Wheel filename as published by PyPI. */
  readonly filename: string
  /** Lower-case hexadecimal SHA-256 digest. */
  readonly sha256: string
}

/** Registry answer for one project version. */
export interface PypiVersionState {
  /** PyPI HTTP status. */
  readonly status: number
  /** Parsed project-version JSON for an existing version. */
  readonly payload?: unknown
}

/** A resumable publication plan. */
export interface PypiPublishPlan {
  /** Wheels absent from PyPI and safe to upload. */
  readonly publish: readonly LocalWheel[]
  /** Wheels already present with identical content. */
  readonly skip: readonly LocalWheel[]
}

/** Read the published wheel digests from PyPI's project-version response. */
function publishedDigests(payload: unknown): ReadonlyMap<string, string> {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('PyPI project-version response must be an object')
  }
  const urls = (payload as Record<string, unknown>).urls
  if (!Array.isArray(urls)) throw new TypeError('PyPI project-version response must contain urls')
  const digests = new Map<string, string>()
  for (const entry of urls) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError('PyPI urls entries must be objects')
    }
    const fields = entry as Record<string, unknown>
    if (fields.packagetype !== 'bdist_wheel') continue
    const filename = fields.filename
    const digestFields = fields.digests
    if (typeof filename !== 'string'
      || digestFields === null
      || typeof digestFields !== 'object'
      || Array.isArray(digestFields)) {
      throw new TypeError('PyPI wheel entry must contain filename and digests')
    }
    const sha256 = (digestFields as Record<string, unknown>).sha256
    if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(sha256)) {
      throw new TypeError(`PyPI wheel ${filename} must contain a SHA-256 digest`)
    }
    if (digests.has(filename)) throw new Error(`PyPI returned duplicate file ${filename}`)
    digests.set(filename, sha256.toLowerCase())
  }
  return digests
}

/**
 * Select absent wheels and reject any immutable-version collision.
 * @param local - locally built wheels for one project version.
 * @param state - PyPI response for that project version.
 * @returns Wheels to publish and byte-identical wheels to skip.
 */
export function pypiPublishPlan(local: readonly LocalWheel[], state: PypiVersionState): PypiPublishPlan {
  if (local.length === 0) throw new Error('the local PyPI wheel set is empty')
  if (state.status === 404) return { publish: [...local], skip: [] }
  if (state.status !== 200) throw new Error(`PyPI returned HTTP ${String(state.status)}`)
  const remote = publishedDigests(state.payload)
  const publish: LocalWheel[] = []
  const skip: LocalWheel[] = []
  for (const wheel of local) {
    const digest = remote.get(wheel.filename)
    if (digest === undefined) {
      publish.push(wheel)
    } else if (digest === wheel.sha256.toLowerCase()) {
      skip.push(wheel)
    } else {
      throw new Error(
        `${wheel.filename} is already published with different content`
        + `\n  PyPI: ${digest}\n  built: ${wheel.sha256.toLowerCase()}`,
      )
    }
  }
  return { publish, skip }
}

/** Compute one local file's SHA-256 digest. */
function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Read the PyPI state for one project version. */
async function pypiVersionState(project: string, version: string): Promise<PypiVersionState> {
  const response = await fetch(
    `https://pypi.org/pypi/${encodeURIComponent(project)}/${encodeURIComponent(version)}/json`,
    { redirect: 'error', signal: AbortSignal.timeout(15_000) },
  )
  if (response.status === 404) return { status: 404 }
  if (response.status !== 200) return { status: response.status }
  return { status: 200, payload: await response.json() }
}

/** Prepare an upload directory that contains only absent, hash-verified wheels. */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      project: { type: 'string' },
      version: { type: 'string' },
      from: { type: 'string' },
      out: { type: 'string' },
    },
    allowPositionals: false,
  })
  if (values.project === undefined || values.version === undefined
    || values.from === undefined || values.out === undefined) {
    throw new Error(
      'usage: prepare-pypi-publish.ts --project <name> --version <version>'
      + ' --from <wheel directory> --out <upload directory>',
    )
  }
  if (values.project !== 'lasmex-sdk' && values.project !== 'lasmex-runtime-bin') {
    throw new Error(`unsupported PyPI project ${values.project}`)
  }
  const source = resolve(process.cwd(), values.from)
  const output = resolve(process.cwd(), values.out)
  const wheelPrefix = `${values.project.replaceAll('-', '_')}-${values.version}-`
  const local = readdirSync(source)
    .filter(filename => filename.startsWith(wheelPrefix) && filename.endsWith('.whl'))
    .sort()
    .map(filename => ({ filename, sha256: sha256(join(source, filename)) }))
  const plan = pypiPublishPlan(local, await pypiVersionState(values.project, values.version))
  mkdirSync(output)
  for (const wheel of plan.publish) copyFileSync(join(source, wheel.filename), join(output, basename(wheel.filename)))
  console.log(
    `PyPI resume: ${values.project}@${values.version}, `
    + `${String(plan.publish.length)} to publish, ${String(plan.skip.length)} already present with matching hashes`,
  )
}

if (isEntry(import.meta.url)) await main()
