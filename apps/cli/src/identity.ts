/** LasmeX product identity applied before the runtime boots. */

import { homedir } from 'node:os'
import { join } from 'node:path'

/** Public environment variable overriding the LasmeX user-data directory. */
export const LASMEX_HOME_ENV = 'LASMEX_HOME'

/** Default LasmeX user-data directory name. */
export const LASMEX_HOME_DIR_NAME = '.lasmex'

/** Inherited hard-disable switch for the DeepSeek telemetry plugin. */
const LASMEX_TELEMETRY_DISABLED_ENV = 'LASMEX_TELEMETRY_DISABLED'

/** Mutable environment fields required by the LasmeX launcher. */
export type LasmexEnvironment = Record<string, string | undefined>

/**
 * Isolate LasmeX state and disable the inherited DeepSeek telemetry exporter.
 * An explicit LASMEX_HOME selects the runtime home; otherwise ~/.lasmex is used.
 * @param environment - mutable process environment.
 * @param userHome - operating-system user home used for the default path.
 */
export function prepareLasmexEnvironment(
  environment: LasmexEnvironment = process.env,
  userHome: string = homedir(),
): void {
  const configured = environment[LASMEX_HOME_ENV]?.trim()
  environment[LASMEX_HOME_ENV] = configured === undefined || configured === ''
    ? join(userHome, LASMEX_HOME_DIR_NAME)
    : configured
  environment[LASMEX_TELEMETRY_DISABLED_ENV] = '1'
}
