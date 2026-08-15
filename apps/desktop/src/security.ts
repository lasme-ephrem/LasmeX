/** Security policy shared by the Electron main process and its unit tests. */

export const DESKTOP_SCHEME = 'lasmex'
export const DESKTOP_HOST = 'app'
export const DESKTOP_ORIGIN = `${DESKTOP_SCHEME}://${DESKTOP_HOST}`
export const DESKTOP_ENTRY_URL = `${DESKTOP_ORIGIN}/index.html`
export const DESKTOP_SESSION_PARTITION = 'lasmex-desktop'

/** BrowserWindow preferences that keep all Node and Electron capability out of the renderer. */
export interface DesktopWebPreferences {
  contextIsolation: true
  devTools: false
  nodeIntegration: false
  sandbox: true
  webSecurity: true
  allowRunningInsecureContent: false
  partition: typeof DESKTOP_SESSION_PARTITION
}

/** @returns the immutable renderer-security preferences. */
export function desktopWebPreferences(): DesktopWebPreferences {
  return {
    contextIsolation: true,
    devTools: false,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    partition: DESKTOP_SESSION_PARTITION,
  }
}

/**
 * Admit only same-origin renderer fetches to privileged app resources.
 * The isolated in-memory Electron session is the sender boundary. Chromium
 * omits both Fetch Metadata and Origin on same-origin custom-protocol
 * subresources, so absent headers are admitted; any supplied cross-origin
 * signal is rejected.
 * @param request - custom-protocol request from Chromium.
 * @returns whether the renderer origin is authenticated for app data.
 */
export function isTrustedRendererRequest(request: Request): boolean {
  const url = new URL(request.url)
  if (url.protocol !== `${DESKTOP_SCHEME}:` || url.host !== DESKTOP_HOST) return false
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite !== null && fetchSite !== 'same-origin') return false
  const origin = request.headers.get('origin')
  if (origin !== null && origin !== DESKTOP_ORIGIN) return false
  return true
}

/**
 * Restrict main-frame navigation to the packaged entry document.
 * @param target - navigation target proposed by Chromium.
 * @returns whether the main frame may navigate there.
 */
export function isAllowedNavigation(target: string): boolean {
  try {
    const url = new URL(target)
    return url.protocol === `${DESKTOP_SCHEME}:`
      && url.host === DESKTOP_HOST
      && (url.pathname === '/' || url.pathname === '/index.html')
  } catch {
    return false
  }
}

/**
 * Allow packaged resources plus the in-memory image and worker URLs admitted by CSP.
 * @param target - request URL proposed by the isolated renderer session.
 * @returns whether the private session may load it.
 */
export function isAllowedSessionRequest(target: string): boolean {
  try {
    const url = new URL(target)
    if (url.protocol === `${DESKTOP_SCHEME}:`) return url.host === DESKTOP_HOST
    if (url.protocol === 'data:') return true
    return url.protocol === 'blob:' && target.startsWith(`blob:${DESKTOP_ORIGIN}/`)
  } catch {
    return false
  }
}
