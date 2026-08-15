/**
 * Function plugin registering the configurable `missionActivity` whole-log
 * projection.
 *
 * @module lasmex-session-mission
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createMissionActivityProjection, resolveMissionConfig } from './projection.ts'

export type * from './types.ts'

/** Cordis plugin name. */
export const name = 'session-mission'
/** The projection registry is required for this host-only contributor. */
export const inject = ['sessionProjections']

/** Mission activity classification and retention configuration. */
export interface Config {
  /** Maximum number of recent validation commands retained in the projection. */
  maxRecentValidations: number
  /** Tool names whose string `command` argument and rendered exit status are command-aware. */
  validationCommandTools: string[]
  /** Case-insensitive JavaScript regex sources that classify command-aware calls as validations. */
  validationCommandPatterns: string[]
}

/** Schemastery configuration; deployment-varying choices are all required. */
export const Config: z<Config> = z.object({
  maxRecentValidations: z.number().step(1).min(1).required(),
  validationCommandTools: z.array(z.string()).required(),
  validationCommandPatterns: z.array(z.string()).required(),
})

/**
 * Validate and register the `missionActivity` projection.
 * @param ctx - registrant context carrying the projection registry.
 * @param config - explicit validation classification and retention choices.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.sessionProjections.register(createMissionActivityProjection(resolveMissionConfig(config)))
}
