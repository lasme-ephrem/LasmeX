/** Release SBOM inventory tests. */

import { describe, expect, it } from 'vitest'
import { sbomInventoryIssues } from './verify-sbom.ts'

const expected = [
  { name: 'lasmex-agent', version: '0.2.0' },
  { name: 'lasmex-runtime-bin', version: '0.2.0' },
  { name: 'electron', version: '43.4.0' },
]

describe('release SBOM inventory', () => {
  it('accepts exact npm, normalized Python, and Electron components', () => {
    expect(sbomInventoryIssues({
      packages: [
        { name: 'lasmex-agent', versionInfo: '0.2.0' },
        { name: 'lasmex_runtime_bin', versionInfo: '0.2.0' },
        { name: 'electron', versionInfo: '43.4.0' },
      ],
    }, expected)).toEqual([])
  })

  it('reports missing or wrong-version components', () => {
    expect(sbomInventoryIssues({
      packages: [
        { name: 'lasmex-agent', versionInfo: '0.2.0' },
        { name: 'lasmex-runtime-bin', versionInfo: '0.1.0' },
      ],
    }, expected)).toEqual([
      'SBOM is missing lasmex-runtime-bin@0.2.0',
      'SBOM is missing electron@43.4.0',
    ])
  })

  it('rejects malformed SPDX documents', () => {
    expect(sbomInventoryIssues([], expected)).toEqual(['SBOM must be an SPDX JSON object'])
    expect(sbomInventoryIssues({}, expected)).toEqual(['SBOM must contain a packages array'])
  })
})
