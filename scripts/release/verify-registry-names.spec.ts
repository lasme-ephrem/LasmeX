/** Public registry identity preflight tests. */

import { describe, expect, it } from 'vitest'
import { registryMetadataIssue } from './verify-registry-names.ts'

describe('public registry source metadata', () => {
  it('accepts an unclaimed name and repository URL variants for this fork', () => {
    expect(registryMetadataIssue('npm', 'lasmex-agent', { status: 404 })).toBeUndefined()
    expect(registryMetadataIssue('npm', 'lasmex-agent', {
      status: 200,
      payload: { repository: { url: 'git+https://github.com/lasme-ephrem/LasmeX.git' } },
    })).toBeUndefined()
    expect(registryMetadataIssue('pypi', 'lasmex-sdk', {
      status: 200,
      payload: { info: { project_urls: { Repository: 'https://github.com/lasme-ephrem/LasmeX/' } } },
    })).toBeUndefined()
  })

  it('blocks an existing name with another source or missing source metadata', () => {
    expect(registryMetadataIssue('npm', 'lasmex-agent', {
      status: 200,
      payload: { repository: 'https://github.com/example/other' },
    })).toMatch(/points at/)
    expect(registryMetadataIssue('pypi', 'lasmex-sdk', { status: 200, payload: { info: {} } }))
      .toMatch(/without a Repository URL/)
    expect(registryMetadataIssue('npm', 'lasmex-agent', { status: 503 })).toMatch(/HTTP 503/)
  })
})
