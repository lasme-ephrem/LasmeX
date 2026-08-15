import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { HostConnectionHandle } from 'lasmex-client-connection'
import type { ClientModuleRegistry } from 'lasmex-client-modules'
import { requireHostFaces } from '../src/host-faces.ts'

function profileContext(services: Record<string, unknown>): Context {
  return {
    loader: {
      * entries() {
        for (const id of ['connection', 'modules']) yield {
          options: { id },
          fiber: {
            store: id === 'connection'
              ? { connection: { value: services['connection:connection'] } }
              : { clientModules: { value: services['modules:clientModules'] } },
          },
        }
      },
    },
  } as unknown as Context
}

describe('desktop Host faces', () => {
  it('reads services from the stable Loader entry contexts', () => {
    const connection = { fetch: vi.fn() } as unknown as HostConnectionHandle
    const modules = { resolve: vi.fn() } as unknown as ClientModuleRegistry

    expect(requireHostFaces(profileContext({
      'connection:connection': connection,
      'modules:clientModules': modules,
    }))).toEqual({ connection, modules })
  })

  it('fails when the composed entries do not provide both services', () => {
    expect(() => requireHostFaces(profileContext({}))).toThrow(
      'desktop: profile did not provide connection and clientModules',
    )
  })
})
