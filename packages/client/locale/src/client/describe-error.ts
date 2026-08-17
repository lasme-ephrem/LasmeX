/**
 * Present one wire error through the active locale catalog.
 * Fallback: when a code has no catalog entry the lookup echoes the key
 * itself, so the raw host message carries the presentation instead.
 */

import type { Translate } from 'lasmex-client-ui-slots'
import { ERROR_KEYS } from './error-keys.ts'

/** Structural wire error: the generic carrier failures outside the closed RpcError union satisfy it too. */
export type WireError = { code: string; message: string; details?: object }

/**
 * Localize a wire error for display.
 * @param error - the wire error (discriminated RpcError or a generic carrier failure).
 * @param t - the bound translate function of the rendering namespace; the
 *   error keys live in the shared common vocabulary the lookup consults.
 * @returns the localized message; details and the host message interpolate where the template names them.
 */
export function describeError<K extends string>(error: WireError, t: Translate<K>): string {
  // Wire-boundary defense: the error object arrives from the wire, where an
  // unknown code can slip through despite the closed union.
  const key = (ERROR_KEYS as Record<string, string | undefined>)[error.code]
  if (key === undefined) return `${error.message} (${error.code})`
  // The error keys belong to the common vocabulary; a namespace whose typed
  // union predates one of them still resolves it at runtime (the lookup echo
  // lands on the raw-message fallback below).
  const text = t(key as K, { ...error.details, message: error.message })
  return text === key ? `${error.message} (${error.code})` : text
}
