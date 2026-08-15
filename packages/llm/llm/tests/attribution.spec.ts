import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { APP_IDENTITY, attributionHeaders, userAgent } from 'lasmex-llm'
import type { AppIdentity } from 'lasmex-llm'

const manifest = createRequire(import.meta.url)('../package.json') as { version: string }

/** A white-label identity exercising every override hook. */
const forkIdentity: AppIdentity = {
  product: 'fork-agent',
  version: '9.9.9',
  url: 'https://example.com/fork-agent',
}

describe('APP_IDENTITY', () => {
  it('sources the version from the package manifest, never a hand-copied constant', () => {
    expect(APP_IDENTITY.version).toBe(manifest.version)
  })

  it('carries only static public product facts', () => {
    expect(APP_IDENTITY).toEqual({
      product: 'lasmex',
      version: manifest.version,
      url: 'https://github.com/lasme-ephrem/LasmeX',
    })
  })
})

describe('userAgent', () => {
  it('renders the LasmeX product, version, and official source home', () => {
    expect(userAgent()).toBe(`lasmex/${manifest.version} (+https://github.com/lasme-ephrem/LasmeX)`)
  })

  it('renders a custom identity', () => {
    expect(userAgent(forkIdentity)).toBe('fork-agent/9.9.9 (+https://example.com/fork-agent)')
  })

  it('omits the comment when a custom identity has no public home', () => {
    expect(userAgent({ product: 'private-agent', version: '1.0.0' })).toBe('private-agent/1.0.0')
  })
})

describe('attributionHeaders', () => {
  it('defaults to the provider-neutral baseline: User-Agent and nothing else', () => {
    expect(attributionHeaders()).toEqual({ 'user-agent': userAgent() })
  })

  it('maps a custom identity onto the User-Agent header only', () => {
    expect(attributionHeaders(forkIdentity)).toEqual({
      'user-agent': 'fork-agent/9.9.9 (+https://example.com/fork-agent)',
    })
  })
})
