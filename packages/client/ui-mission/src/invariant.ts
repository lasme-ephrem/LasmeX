/**
 * Package-owned invariant companion for `lasmex-client-ui-mission`.
 * @module lasmex-client-ui-mission/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from 'lasmex-invariants'

const PACKAGE_NAME = 'lasmex-client-ui-mission'

/** Cordis companion plugin name. */
export const name = 'client-ui-mission-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this pure consumer owns no mutable cross-plugin state;
 * its slot registration is an effect observed by package behavior specs.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns The installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
