/** npm trust bootstrap command tests. */

import { describe, expect, it } from 'vitest'
import {
  npmTrustArguments,
  npmTrustListArguments,
  npmTrustState,
  npmVersionIssue,
} from './configure-npm-trust.ts'

describe('npm trusted-publisher bootstrap', () => {
  it('pins one package to the protected LasmeX publication workflow', () => {
    expect(npmTrustArguments('lasmex-agent')).toEqual([
      'trust',
      'github',
      'lasmex-agent',
      '--file',
      'release.yml',
      '--repo',
      'lasme-ephrem/LasmeX',
      '--env',
      'npm-publish',
      '--allow-publish',
      '--yes',
    ])
    expect(npmTrustListArguments('lasmex-agent')).toEqual(['trust', 'list', 'lasmex-agent', '--json'])
  })

  it('resumes only when the existing relationship is exactly equal', () => {
    expect(npmTrustState('')).toBe('absent')
    expect(npmTrustState(JSON.stringify({
      id: 'publisher-id',
      type: 'github',
      file: 'release.yml',
      repository: 'lasme-ephrem/LasmeX',
      environment: 'npm-publish',
      permissions: ['createPackage'],
    }))).toBe('matching')
    expect(() => npmTrustState(JSON.stringify({
      id: 'publisher-id',
      type: 'github',
      file: 'release.yml',
      repository: 'lasme-ephrem/LasmeX',
      environment: 'npm-publish',
      permissions: ['createPackage', 'createStagedPackage'],
    }))).toThrow(/differs/)
  })

  it('requires a trust-capable npm CLI version', () => {
    expect(npmVersionIssue('11.15.0')).toBeUndefined()
    expect(npmVersionIssue('12.0.0')).toBeUndefined()
    expect(npmVersionIssue('11.14.9')).toMatch(/11\.15\.0/)
    expect(npmVersionIssue('latest')).toMatch(/cannot parse/)
  })
})
