/** Secure custom-protocol carrier for packaged UI assets, plugins, and API Fetch. */

import { readFile } from 'node:fs/promises'
import { extname, relative, resolve, sep } from 'node:path'
import { serializeBootManifest, type ClientModuleRegistry, type WebBootGraph } from 'lasmex-client-modules'
import { DESKTOP_HOST, DESKTOP_ORIGIN, DESKTOP_SCHEME, isTrustedRendererRequest } from './security.ts'

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'"
const BOOT_MANIFEST_ID = 'lasmex-boot-manifest'

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

/** Host faces used by the custom protocol after the profile has settled. */
interface DesktopProtocolHost {
  /** Dispatch trusted `/api` Fetch requests. */
  fetch(request: Request): Promise<Response>
  /** Composed client plugin inventory and bundle locations. */
  modules: Pick<ClientModuleRegistry, 'clientPath' | 'graph'>
}

/** Inputs owned by the desktop application assembly. */
export interface DesktopProtocolOptions {
  /** Absolute Vite renderer output directory. */
  rendererRoot: string
  /** Settled Host faces. */
  host: DesktopProtocolHost
}

/**
 * Create the `lasmex://app` handler. It preserves API streaming responses,
 * serves only composed plugin ids, and refuses filesystem traversal.
 * @param options - renderer directory and settled Host faces.
 * @returns protocol handler for Electron's isolated session.
 */
export function createDesktopProtocolHandler(options: DesktopProtocolOptions): (request: Request) => Promise<Response> {
  const rendererRoot = resolve(options.rendererRoot)
  return async (request): Promise<Response> => {
    const url = new URL(request.url)
    if (url.protocol !== `${DESKTOP_SCHEME}:` || url.host !== DESKTOP_HOST) return forbidden()

    if (url.pathname.startsWith('/api/')) {
      if (!isTrustedRendererRequest(request)) return forbidden()
      return options.host.fetch(request)
    }
    if (url.pathname.startsWith('/plugins/')) {
      if (!isTrustedRendererRequest(request)) return forbidden()
      return servePlugin(url, request, options.host.modules)
    }
    return serveRenderer(url, request, rendererRoot, options.host.modules.graph())
  }
}

async function servePlugin(
  url: URL,
  request: Request,
  modules: DesktopProtocolOptions['host']['modules'],
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('method not allowed', { status: 405 })
  if (url.pathname.endsWith('.map')) return new Response('not found', { status: 404 })
  const match = /^\/plugins\/(.+)\/client\.js$/.exec(url.pathname)
  if (match === null) return new Response('not found', { status: 404 })
  const id = decodePath(match[1] ?? '')
  if (id === undefined) return new Response('bad path encoding', { status: 400 })
  const row = modules.graph().entries.find(entry => entry.id === id)
  if (row === undefined || url.searchParams.get('rev') !== row.rev) {
    return new Response('plugin revision not found', { status: 404 })
  }
  const path = modules.clientPath(id)
  if (path === undefined) return new Response('not found', { status: 404 })
  try {
    const body = await readFile(path)
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: { 'cache-control': 'no-cache', 'content-type': CONTENT_TYPES['.js'] ?? 'text/javascript' },
    })
  } catch {
    return new Response('not found', { status: 404 })
  }
}

async function serveRenderer(
  url: URL,
  request: Request,
  rendererRoot: string,
  graph: WebBootGraph,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('method not allowed', { status: 405 })
  const entryRequest = url.pathname === '/' || url.pathname === '/index.html'
  if (!entryRequest && !isTrustedRendererRequest(request)) return forbidden()
  const decodedPath = entryRequest ? '/index.html' : decodePath(url.pathname)
  if (decodedPath === undefined) return new Response('bad path encoding', { status: 400 })
  const relativePath = decodedPath.replace(/^\/+/, '')
  const path = resolve(rendererRoot, relativePath)
  const fromRoot = relative(rendererRoot, path)
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || resolve(path) === rendererRoot) return forbidden()
  try {
    const raw = await readFile(path)
    const body = entryRequest ? injectDesktopBootManifest(raw.toString('utf8'), graph) : raw
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: {
        'cache-control': 'no-cache',
        'content-security-policy': CSP,
        'content-type': CONTENT_TYPES[extname(path)] ?? 'application/octet-stream',
      },
    })
  } catch {
    return new Response('not found', { status: 404 })
  }
}

function injectDesktopBootManifest(html: string, graph: WebBootGraph): string {
  const script = `<script id="${BOOT_MANIFEST_ID}" type="application/json">${serializeBootManifest(graph)}</script>`
  const head = html.indexOf('<head>')
  if (head !== -1) return `${html.slice(0, head + 6)}${script}${html.slice(head + 6)}`
  return `${script}${html}`
}

function forbidden(): Response {
  return new Response(`forbidden origin; expected ${DESKTOP_ORIGIN}`, { status: 403 })
}

function decodePath(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return undefined
  }
}
