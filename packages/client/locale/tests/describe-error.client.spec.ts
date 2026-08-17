// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from 'lasmex-client-locale/client'
import type { RpcError } from 'lasmex-api-remotes/client'
import type { SessionId } from 'lasmex-client-runtime/client'
import { COMMON_NS } from '../src/client/index.ts'
import { describeError } from '../src/client/describe-error.ts'
import { ERROR_KEYS } from '../src/client/error-keys.ts'
import { fr } from '../src/locales/fr.ts'
import { en } from '../src/locales/en.ts'
import { zh } from '../src/locales/zh.ts'

function makeService(): { svc: LocaleRuntime; t: (key: string, params?: Record<string, unknown>) => string } {
  const svc = new LocaleRuntime(new Context())
  svc.register(COMMON_NS, { fr, en, zh })
  return { svc, t: svc.bind('bench.ns') }
}

describe('describeError', () => {
  it('covers every RpcError code with a real French common entry', () => {
    for (const [code, key] of Object.entries(ERROR_KEYS)) {
      const value = fr[key as keyof typeof fr]
      expect(value, code).toBeDefined()
      expect(value, code).not.toBe(key)
    }
  })

  it('describes a known error through the active locale', () => {
    const { svc, t } = makeService()
    svc.setLocale('fr')
    const error: RpcError = { code: 'cancelled', message: 'raw english', details: {} }
    expect(describeError(error, t)).toBe('Annulé.')
    svc.setLocale('en')
    expect(describeError(error, t)).toBe('Cancelled.')
  })

  it('falls back to the raw host message for an unmapped code', () => {
    const { t } = makeService()
    const error = { code: 'nonexistent-code', message: 'raw english', details: {} } as unknown as RpcError
    expect(describeError(error, t)).toBe('raw english (nonexistent-code)')
  })

  it('service face describes through the common vocabulary without a bound namespace', () => {
    const { svc } = makeService()
    svc.setLocale('fr')
    const error: RpcError = {
      code: 'session-not-found',
      message: 'raw english',
      details: { sessionId: 's1' as SessionId },
    }
    expect(svc.describeError(error)).toBe(fr['error.session-not-found'])
    svc.setLocale('zh')
    expect(svc.describeError(error)).toBe(zh['error.session-not-found'])
  })
})
