/** PyPI hash-strict resume tests. */

import { describe, expect, it } from 'vitest'
import { pypiPublishPlan } from './prepare-pypi-publish.ts'

const digestA = 'a'.repeat(64)
const digestB = 'b'.repeat(64)
const local = [
  { filename: 'lasmex_runtime_bin-0.2.0-py3-none-manylinux_x86_64.whl', sha256: digestA },
  { filename: 'lasmex_runtime_bin-0.2.0-py3-none-manylinux_aarch64.whl', sha256: digestB },
]

describe('PyPI publication resume', () => {
  it('publishes every wheel when the version is absent', () => {
    expect(pypiPublishPlan(local, { status: 404 })).toEqual({ publish: local, skip: [] })
  })

  it('selects only missing wheels after matching existing hashes', () => {
    expect(pypiPublishPlan(local, {
      status: 200,
      payload: {
        urls: [{
          packagetype: 'bdist_wheel',
          filename: local[0]?.filename,
          digests: { sha256: digestA.toUpperCase() },
        }],
      },
    })).toEqual({ publish: [local[1]], skip: [local[0]] })
  })

  it('rejects an existing filename whose content differs', () => {
    expect(() => pypiPublishPlan(local, {
      status: 200,
      payload: {
        urls: [{
          packagetype: 'bdist_wheel',
          filename: local[0]?.filename,
          digests: { sha256: digestB },
        }],
      },
    })).toThrow(/already published with different content/)
  })

  it('rejects registry errors and malformed digest metadata', () => {
    expect(() => pypiPublishPlan(local, { status: 503 })).toThrow(/HTTP 503/)
    expect(() => pypiPublishPlan(local, {
      status: 200,
      payload: { urls: [{ packagetype: 'bdist_wheel', filename: local[0]?.filename, digests: {} }] },
    })).toThrow(/SHA-256/)
  })
})
