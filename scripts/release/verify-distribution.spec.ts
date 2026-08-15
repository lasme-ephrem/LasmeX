/** Distribution version gate tests. */

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  distributionIssues,
  distributionVersionIssues,
  packageDescriptionIssues,
} from './verify-distribution.ts'

describe('stable distribution versions', () => {
  it('accepts the repository release metadata as one stable version', () => {
    expect(distributionIssues(resolve(import.meta.dirname, '../..'))).toEqual([])
  })

  it('reports every mismatched or prerelease projection', () => {
    expect(distributionVersionIssues({
      repository: '0.1.0-rc.5',
      desktop: '0.1.0',
      pythonSdk: '0.1.0rc5',
      pythonRuntime: '0.1.0rc5',
      runtimeClosure: '0.1.0-rc.5',
      pythonRuntimeRequirement: '0.1.0rc5',
    })).toEqual([
      'repository version 0.1.0-rc.5 is not stable semver',
      'desktop version 0.1.0 does not match repository 0.1.0-rc.5',
      'pythonSdk version 0.1.0rc5 does not match repository 0.1.0-rc.5',
      'pythonRuntime version 0.1.0rc5 does not match repository 0.1.0-rc.5',
      'pythonRuntimeRequirement version 0.1.0rc5 does not match repository 0.1.0-rc.5',
    ])
  })

  it('accepts later stable versions without changing the gate', () => {
    expect(distributionVersionIssues({
      repository: '2.7.13',
      desktop: '2.7.13',
      pythonSdk: '2.7.13',
      pythonRuntime: '2.7.13',
      runtimeClosure: '2.7.13',
      pythonRuntimeRequirement: '2.7.13',
    })).toEqual([])
  })

  it('rejects awkward or retired product names in public descriptions', () => {
    expect(packageDescriptionIssues('lasmex-session', 'Session store for LasmeX')).toEqual([])
    expect(packageDescriptionIssues('lasmex-session', 'Session store for the LasmeX and dsh-session')).toEqual([
      'lasmex-session description must use LasmeX as a proper name',
      'lasmex-session description exposes a retired dsh package name',
    ])
  })
})
