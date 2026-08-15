import { describe, expect, it } from 'vitest'
import {
  DESKTOP_ENTRY_URL,
  DESKTOP_ORIGIN,
  desktopWebPreferences,
  isAllowedNavigation,
  isAllowedSessionRequest,
  isTrustedRendererRequest,
} from '../src/security.ts'

describe('desktop security policy', () => {
  it('pins the renderer sandbox and disables Node, remote navigation, and DevTools', () => {
    expect(desktopWebPreferences()).toEqual({
      contextIsolation: true,
      devTools: false,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      partition: 'lasmex-desktop',
    })
    expect(isAllowedNavigation(DESKTOP_ENTRY_URL)).toBe(true)
    expect(isAllowedNavigation(`${DESKTOP_ORIGIN}/`)).toBe(true)
    expect(isAllowedNavigation(`${DESKTOP_ORIGIN}/assets/index.js`)).toBe(false)
    expect(isAllowedNavigation('https://example.com/')).toBe(false)
    expect(isAllowedNavigation('not a URL')).toBe(false)
  })

  it('requires the app authority and rejects conflicting origin metadata', () => {
    const trusted = new Request(`${DESKTOP_ORIGIN}/api/session.list`, {
      headers: { origin: DESKTOP_ORIGIN, 'sec-fetch-site': 'same-origin' },
    })
    expect(isTrustedRendererRequest(trusted)).toBe(true)
    expect(isTrustedRendererRequest(new Request(trusted.url, {
      headers: { origin: DESKTOP_ORIGIN },
    }))).toBe(true)
    expect(isTrustedRendererRequest(new Request(trusted.url, {
      headers: { 'sec-fetch-site': 'same-origin' },
    }))).toBe(true)
    expect(isTrustedRendererRequest(new Request(trusted.url, {
      headers: { origin: 'https://example.com', 'sec-fetch-site': 'same-origin' },
    }))).toBe(false)
    expect(isTrustedRendererRequest(new Request(trusted.url, {
      headers: { 'sec-fetch-site': 'cross-site' },
    }))).toBe(false)
    expect(isTrustedRendererRequest(new Request('lasmex://other/api/session.list', {
      headers: { 'sec-fetch-site': 'same-origin' },
    }))).toBe(false)
    // Chromium supplies neither header for same-origin lasmex:// subresources;
    // the isolated session and exact app authority authenticate this request.
    expect(isTrustedRendererRequest(new Request(trusted.url))).toBe(true)
  })

  it('allows CSP-scoped data and same-origin blob loads without opening remote requests', () => {
    expect(isAllowedSessionRequest(`${DESKTOP_ORIGIN}/assets/index.js`)).toBe(true)
    expect(isAllowedSessionRequest('data:image/png;base64,AA==')).toBe(true)
    expect(isAllowedSessionRequest(`blob:${DESKTOP_ORIGIN}/attachment-id`)).toBe(true)
    expect(isAllowedSessionRequest('blob:https://example.com/attachment-id')).toBe(false)
    expect(isAllowedSessionRequest('https://example.com/')).toBe(false)
    expect(isAllowedSessionRequest('not a URL')).toBe(false)
  })
})
