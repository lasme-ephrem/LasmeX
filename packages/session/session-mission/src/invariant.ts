/**
 * Package-owned invariant companion for `lasmex-session-mission`.
 * @module lasmex-session-mission/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from 'lasmex-invariants'

const PACKAGE_NAME = 'lasmex-session-mission'

/** Cordis companion plugin name. */
export const name = 'session-mission-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package owns one pure projection fold whose wire
 * value is schema-validated by the projection registry. The call/result,
 * Code Mode dispatch, approval-pair, and turn-enclosure relations it consumes
 * are authoritative session facts checked by their producing packages.
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
