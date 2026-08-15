/** Release workflow security gate tests. */

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { actionPinIssue, actionReferences, workflowSecurityIssues } from './verify-workflows.ts'

describe('release workflow security', () => {
  it('accepts the repository workflow inventory', () => {
    expect(workflowSecurityIssues(resolve(import.meta.dirname, '../..'))).toEqual([])
  })

  it('finds nested references and rejects floating external tags', () => {
    expect(actionReferences({ jobs: { build: { steps: [{ uses: 'actions/checkout@v6' }] } } }))
      .toEqual([{ location: 'jobs.build.steps[0].uses', value: 'actions/checkout@v6' }])
    expect(actionPinIssue('./.github/workflows/local.yml')).toBeUndefined()
    expect(actionPinIssue('actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803')).toBeUndefined()
    expect(actionPinIssue(`docker://alpine@sha256:${'a'.repeat(64)}`)).toBeUndefined()
    expect(actionPinIssue('docker://alpine:3.22')).toMatch(/image digest/)
    expect(actionPinIssue('actions/checkout@v6')).toMatch(/full commit SHA/)
  })
})
