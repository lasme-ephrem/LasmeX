/** Package-owned invariant companion. @module lasmex-tool-memory/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from 'lasmex-invariants'

const PACKAGE_NAME = 'lasmex-tool-memory'

/** Cordis companion plugin name. */
export const name = 'tool-memory-invariant'
/** Services required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: tools and system-prompt own their registration lifecycle checks. */
const install: InvariantInstaller = Object.assign(() => {}, { inject: ['tools', 'memory', 'systemPrompt'] })

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
