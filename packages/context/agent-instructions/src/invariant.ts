/**
 * Package-owned invariant companion for `lasmex-agent-instructions`.
 * @module lasmex-agent-instructions/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from 'lasmex-invariants'

const PACKAGE_NAME = 'lasmex-agent-instructions'

/** Cordis companion plugin name. */
export const name = 'workspace-context-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: replay intentionally tolerates unknown or malformed workspace sources,
 * while focused pipeline tests own its private pending/cache state transitions.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
