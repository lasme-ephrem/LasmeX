/** npm publication argument tests. */

import { describe, expect, it } from 'vitest'
import { npmPublishArguments } from './publish.ts'

describe('npm publication arguments', () => {
  it('requests provenance without changing a stable dist-tag', () => {
    expect(npmPublishArguments('/release/lasmex-agent-0.2.0.tgz', '0.2.0', true)).toEqual([
      'publish',
      '/release/lasmex-agent-0.2.0.tgz',
      '--provenance',
    ])
  })

  it('keeps prereleases off latest and permits non-release callers to omit provenance', () => {
    expect(npmPublishArguments('/release/lasmex-agent-0.2.0-rc.1.tgz', '0.2.0-rc.1', false)).toEqual([
      'publish',
      '/release/lasmex-agent-0.2.0-rc.1.tgz',
      '--tag',
      'next',
    ])
  })
})
