import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { WebBootGraph } from 'lasmex-client-modules'
import { createDesktopProtocolHandler } from '../src/protocol.ts'
import { DESKTOP_ORIGIN } from '../src/security.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function trustedRequest(path: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers)
  headers.set('origin', DESKTOP_ORIGIN)
  headers.set('sec-fetch-site', 'same-origin')
  return new Request(`${DESKTOP_ORIGIN}${path}`, {
    ...init,
    headers,
  })
}

function fixture(): { handler: ReturnType<typeof createDesktopProtocolHandler>; graph: WebBootGraph } {
  const root = mkdtempSync(join(tmpdir(), 'lasmex-desktop-'))
  roots.push(root)
  mkdirSync(join(root, 'assets'))
  writeFileSync(join(root, 'index.html'), '<html><head></head><body><script src="/assets/app.js"></script></body></html>')
  writeFileSync(join(root, 'assets', 'app.js'), 'globalThis.started = true\n')
  const plugin = join(root, 'client.js')
  writeFileSync(plugin, 'globalThis.plugin = true\n')
  const graph: WebBootGraph = {
    rev: 'graph-rev',
    entries: [{ id: '@fixture/plugin', url: '/plugins/@fixture/plugin/client.js?rev=plugin-rev', rev: 'plugin-rev' }],
  }
  return {
    graph,
    handler: createDesktopProtocolHandler({
      rendererRoot: root,
      host: {
        fetch: async request => new Response(`api:${new URL(request.url).pathname}`),
        modules: {
          graph: () => graph,
          clientPath: id => id === '@fixture/plugin' ? plugin : undefined,
        },
      },
    }),
  }
}

describe('desktop custom protocol', () => {
  it('injects the real Host graph and serves only its exact plugin revision', async () => {
    const { handler } = fixture()
    const index = await handler(new Request(`${DESKTOP_ORIGIN}/index.html`))
    expect(index.status).toBe(200)
    const html = await index.text()
    expect(html).toContain('<script id="lasmex-boot-manifest" type="application/json">{"rev":"graph-rev"')
    expect(html).not.toContain('window.__DSH_BOOT__')
    expect(index.headers.get('content-security-policy')).toContain("default-src 'self'")

    const plugin = await handler(trustedRequest('/plugins/@fixture/plugin/client.js?rev=plugin-rev'))
    expect(plugin.status).toBe(200)
    expect(await plugin.text()).toContain('globalThis.plugin')
    expect((await handler(trustedRequest('/plugins/@fixture/plugin/client.js?rev=wrong'))).status).toBe(404)
    expect((await handler(trustedRequest('/plugins/@fixture/other/client.js?rev=plugin-rev'))).status).toBe(404)
    expect((await handler(trustedRequest('/plugins/@fixture/plugin/client.js?rev=plugin-rev', { method: 'POST' }))).status).toBe(405)
    const head = await handler(trustedRequest('/plugins/@fixture/plugin/client.js?rev=plugin-rev', { method: 'HEAD' }))
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  it('preserves API responses and refuses untrusted origins and escaped assets', async () => {
    const { handler } = fixture()
    const response = await handler(trustedRequest('/api/session.list'))
    expect(await response.text()).toBe('api:/api/session.list')

    const untrusted = new Request(`${DESKTOP_ORIGIN}/api/session.list`, {
      headers: { origin: 'https://example.com', 'sec-fetch-site': 'same-origin' },
    })
    expect((await handler(untrusted)).status).toBe(403)
    expect((await handler(new Request(`${DESKTOP_ORIGIN}/assets/%2e%2e/secret`))).status).not.toBe(200)
    expect((await handler(trustedRequest('/assets/app.js'))).status).toBe(200)
    expect((await handler(new Request(`${DESKTOP_ORIGIN}/assets/app.js`, {
      headers: { origin: DESKTOP_ORIGIN },
    }))).status).toBe(200)
    expect((await handler(trustedRequest('/assets/%'))).status).toBe(400)
  })
})
