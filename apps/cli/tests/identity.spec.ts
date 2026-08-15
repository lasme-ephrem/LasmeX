import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { prepareLasmexEnvironment } from '../src/identity.ts'

describe('prepareLasmexEnvironment', () => {
  it('uses an isolated LasmeX home by default', () => {
    const environment: Record<string, string | undefined> = {}
    prepareLasmexEnvironment(environment, '/users/test')
    expect(environment).toEqual({
      LASMEX_HOME: join('/users/test', '.lasmex'),
      LASMEX_TELEMETRY_DISABLED: '1',
    })
  })

  it('accepts an explicit LASMEX_HOME', () => {
    const lasmex: Record<string, string | undefined> = { LASMEX_HOME: 'D:\\LasmexData' }
    prepareLasmexEnvironment(lasmex, 'unused')
    expect(lasmex.LASMEX_HOME).toBe('D:\\LasmexData')
  })

  it('treats blank home overrides as absent and always disables telemetry', () => {
    const environment: Record<string, string | undefined> = {
      LASMEX_HOME: '\t',
      LASMEX_TELEMETRY_DISABLED: '0',
    }
    prepareLasmexEnvironment(environment, '/users/test')
    expect(environment.LASMEX_HOME).toBe(join('/users/test', '.lasmex'))
    expect(environment.LASMEX_TELEMETRY_DISABLED).toBe('1')
  })
})
