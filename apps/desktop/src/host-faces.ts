/** Resolve Host services owned by the composed desktop Loader entries. */

import type { Context } from '@deepseek-ai/cordis'
import type { HostConnectionHandle } from 'lasmex-client-connection'
import type { ClientModuleRegistry } from 'lasmex-client-modules'

/** Host services used by the `lasmex://app` carrier. */
export interface DesktopHostFaces {
  connection: HostConnectionHandle
  modules: ClientModuleRegistry
}

/**
 * Resolve the services provided by their stable Web-composition entries.
 * @param ctx - settled profile root.
 * @returns the Host connection and client-module registry.
 */
export function requireHostFaces(ctx: Context): DesktopHostFaces {
  const entries = [...ctx.loader.entries()]
  const connection = entries.find(entry => entry.options.id === 'connection')
    ?.fiber?.store?.connection?.value as HostConnectionHandle | undefined
  const modules = entries.find(entry => entry.options.id === 'modules')
    ?.fiber?.store?.clientModules?.value as ClientModuleRegistry | undefined
  if (connection === undefined || modules === undefined) {
    throw new Error('desktop: profile did not provide connection and clientModules')
  }
  return { connection, modules }
}
