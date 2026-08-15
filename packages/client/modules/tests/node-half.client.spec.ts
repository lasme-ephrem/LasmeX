/** Node-half composition diagnostics for package metadata and built client bundles. */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { WebServer, WebRoute } from 'lasmex-host-webserver'
import { ClientModuleRegistry } from '../src/index.ts'
import { createPackageJsonResolver } from '../src/package-resolution.ts'

let root: string | undefined

afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
  root = undefined
})

/** Create a resolvable package whose client export points at the returned path. */
function writePackage(
  packageName: string,
  metadata: Record<string, unknown> = { lasmex: { client: { platform: 'web' } } },
): string {
  root ??= realpathSync(mkdtempSync(join(tmpdir(), 'lasmex-client-modules-')))
  const pkgRoot = join(root, 'node_modules', ...packageName.split('/'))
  const clientPath = join(pkgRoot, 'lib', 'client.js')
  mkdirSync(pkgRoot, { recursive: true })
  writeFileSync(join(pkgRoot, 'package.json'), JSON.stringify({
    name: packageName,
    exports: {
      './client': './lib/client.js',
      './package.json': './package.json',
    },
    ...metadata,
  }))
  return clientPath
}

/** Construct the node-half service and capture its plugin-bundle route. */
function constructWithRoute(packageNames: string[]): { service: ClientModuleRegistry; route: WebRoute } {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(root!).href + '/'
  ctx.provide('loader', {
    *entries() {
      for (const packageName of packageNames) {
        yield { options: { name: packageName }, fiber: {}, disabled: false }
      }
    },
  })
  let route: WebRoute | undefined
  const webServer: Pick<WebServer, 'port' | 'register' | 'tapIndex'> = {
    port: 0,
    register: (candidate) => {
      if (candidate.path === '/plugins') route = candidate
      return () => {}
    },
    tapIndex: () => () => {},
  }
  ctx.provide('webServer', webServer as WebServer)
  const service = new ClientModuleRegistry(ctx)
  if (route === undefined) throw new Error('client bundle route was not registered')
  return { service, route }
}

/** Construct the node-half service over the enabled fixture entries. */
function construct(packageNames: string[]): ClientModuleRegistry {
  return constructWithRoute(packageNames).service
}

describe('client bundle activation', () => {
  it('falls back from the writable profile to the installed runtime package tree', () => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-client-module-resolver-')))
    const profile = join(root, 'profile')
    const runtime = join(root, 'runtime')
    const packageRoot = join(runtime, 'node_modules', '@fixture', 'runtime-client')
    mkdirSync(profile, { recursive: true })
    mkdirSync(packageRoot, { recursive: true })
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ name: '@fixture/runtime-client' }))

    const resolvePackageJson = createPackageJsonResolver(
      pathToFileURL(join(profile, 'entry.mjs')).href,
      pathToFileURL(join(runtime, 'entry.mjs')).href,
    )

    expect(resolvePackageJson('@fixture/runtime-client')).toBe(join(packageRoot, 'package.json'))
  })

  it('keeps a profile-local package ahead of the installed runtime', () => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-client-module-primary-')))
    const profile = join(root, 'profile')
    const runtime = join(root, 'runtime')
    const profilePackage = join(profile, 'node_modules', '@fixture', 'shared-client')
    const runtimePackage = join(runtime, 'node_modules', '@fixture', 'shared-client')
    mkdirSync(profilePackage, { recursive: true })
    mkdirSync(runtimePackage, { recursive: true })
    writeFileSync(join(profilePackage, 'package.json'), JSON.stringify({ name: '@fixture/shared-client' }))
    writeFileSync(join(runtimePackage, 'package.json'), JSON.stringify({ name: '@fixture/shared-client' }))

    const resolvePackageJson = createPackageJsonResolver(
      pathToFileURL(join(profile, 'entry.mjs')).href,
      pathToFileURL(join(runtime, 'entry.mjs')).href,
    )

    expect(resolvePackageJson('@fixture/shared-client')).toBe(join(profilePackage, 'package.json'))
  })

  it('does not hide a profile package that blocks its package.json export', () => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-client-module-private-')))
    const profile = join(root, 'profile')
    const runtime = join(root, 'runtime')
    const profilePackage = join(profile, 'node_modules', '@fixture', 'private-client')
    const runtimePackage = join(runtime, 'node_modules', '@fixture', 'private-client')
    mkdirSync(profilePackage, { recursive: true })
    mkdirSync(runtimePackage, { recursive: true })
    writeFileSync(join(profilePackage, 'package.json'), JSON.stringify({
      name: '@fixture/private-client',
      exports: { '.': './index.js' },
    }))
    writeFileSync(join(runtimePackage, 'package.json'), JSON.stringify({ name: '@fixture/private-client' }))

    const resolvePackageJson = createPackageJsonResolver(
      pathToFileURL(join(profile, 'entry.mjs')).href,
      pathToFileURL(join(runtime, 'entry.mjs')).href,
    )

    expect(() => resolvePackageJson('@fixture/private-client')).toThrow(/package subpath.*package\.json.*exports/i)
  })

  it('composes the graph without an HTTP server for in-process carriers', () => {
    const packageName = '@fixture/in-process'
    const clientPath = writePackage(packageName)
    mkdirSync(dirname(clientPath), { recursive: true })
    writeFileSync(clientPath, 'module.exports = {}\n')
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(root!).href + '/'
    ctx.provide('loader', {
      *entries() {
        yield { options: { name: packageName }, fiber: {}, disabled: false }
      },
    })
    const service = new ClientModuleRegistry(ctx)
    expect(service.graph().entries.map(entry => entry.id)).toEqual([packageName])
  })

  it('allows sibling dsh roles', () => {
    const currentName = '@fixture/current-client-field'
    const clientPath = writePackage(currentName, {
      lasmex: {
        bundle: { patch: './cordis.patch.yml' },
        client: { platform: 'web' },
        profile: { bundles: [] },
      },
    })
    mkdirSync(dirname(clientPath), { recursive: true })
    writeFileSync(clientPath, 'module.exports = {}\n')
    expect(construct([currentName]).graph().entries.map(entry => entry.id)).toEqual([currentName])
  })

  it('groups missing bundles under one source-build instruction with a package/path list', () => {
    const firstName = '@fixture/missing-first'
    const secondName = '@fixture/missing-second'
    const firstPath = writePackage(firstName)
    const secondPath = writePackage(secondName)
    expect(() => construct([firstName, secondName])).toThrow([
      'client-modules: 2 client packages failed to compose:',
      '  client bundles not found; run `pnpm run build` before launch:',
      `    - package: ${firstName}`,
      `      path: ${firstPath}`,
      `    - package: ${secondName}`,
      `      path: ${secondPath}`,
    ].join('\n'))
  })

  it('does not report other bundle read failures as missing builds', () => {
    const packageName = '@fixture/unreadable-client'
    const clientPath = writePackage(packageName)
    mkdirSync(clientPath, { recursive: true })
    let thrown: unknown
    try {
      construct([packageName])
    } catch (error) {
      thrown = error
    }
    expect(String(thrown)).toContain('client-modules: 1 client package failed to compose:')
    expect(String(thrown)).toContain('  other failures:')
    expect(String(thrown)).toContain('EISDIR')
    expect(String(thrown)).not.toContain('pnpm run build')
  })

  it('serves the source map beside a registered client bundle', async () => {
    const packageName = '@fixture/source-map'
    const clientPath = writePackage(packageName)
    mkdirSync(dirname(clientPath), { recursive: true })
    writeFileSync(clientPath, 'module.exports = {}\n')
    const map = '{"version":3,"sources":["src/client/index.tsx"]}\n'
    writeFileSync(`${clientPath}.map`, map)
    const { route } = constructWithRoute([packageName])
    let status = 0
    let headers: Record<string, string> | undefined
    let body = ''
    const response = {
      writeHead(nextStatus: number, nextHeaders?: Record<string, string>) {
        status = nextStatus
        headers = nextHeaders
        return response
      },
      end(chunk?: Uint8Array) {
        body = chunk === undefined ? '' : Buffer.from(chunk).toString('utf8')
        return response
      },
    } as unknown as ServerResponse

    await route.handler({
      method: 'GET',
      url: `/plugins/${packageName}/client.js.map`,
    } as IncomingMessage, response)

    expect(status).toBe(200)
    expect(headers).toEqual({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache',
    })
    expect(body).toBe(map)
  })
})
