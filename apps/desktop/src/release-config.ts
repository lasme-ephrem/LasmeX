/** Immutable release metadata embedded in every desktop ASAR. */

import { existsSync, readFileSync } from 'node:fs'

export type DesktopReleasePlatform = 'darwin' | 'linux' | 'win32'

/** Update policy sealed into a desktop build. */
type DesktopUpdatePolicy =
  | { enabled: false }
  | { enabled: true; baseUrl: string }

/** Release metadata consumed by the Electron main process. */
export interface DesktopReleaseConfig {
  formatVersion: 1
  release: boolean
  update: DesktopUpdatePolicy
}

const DEVELOPMENT_CONFIG: DesktopReleaseConfig = {
  formatVersion: 1,
  release: false,
  update: { enabled: false },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === expected.length
    && actual.every((key, index) => key === [...expected].sort()[index])
}

function normalizedUpdateBaseUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:') throw new Error('desktop update base URL must use HTTPS')
  if (url.username !== '' || url.password !== '') {
    throw new Error('desktop update base URL must not contain credentials')
  }
  if (url.search !== '' || url.hash !== '') {
    throw new Error('desktop update base URL must not contain a query or fragment')
  }
  return url.href.replace(/\/$/u, '')
}

/**
 * Parse release metadata at the packaged-file trust boundary.
 * @param value - decoded JSON value.
 * @returns validated release metadata.
 */
export function parseDesktopReleaseConfig(value: unknown): DesktopReleaseConfig {
  if (!isRecord(value) || !hasExactKeys(value, ['formatVersion', 'release', 'update'])) {
    throw new Error('desktop release configuration has unexpected fields')
  }
  if (value.formatVersion !== 1 || typeof value.release !== 'boolean' || !isRecord(value.update)) {
    throw new Error('desktop release configuration is invalid')
  }
  if (value.update.enabled === false && hasExactKeys(value.update, ['enabled'])) {
    return { formatVersion: 1, release: value.release, update: { enabled: false } }
  }
  if (value.update.enabled === true
    && hasExactKeys(value.update, ['baseUrl', 'enabled'])
    && typeof value.update.baseUrl === 'string') {
    if (!value.release) throw new Error('desktop development builds cannot enable updates')
    return {
      formatVersion: 1,
      release: true,
      update: { enabled: true, baseUrl: normalizedUpdateBaseUrl(value.update.baseUrl) },
    }
  }
  throw new Error('desktop update configuration is invalid')
}

/**
 * Resolve build-time release metadata without retaining signing secrets.
 * @param environment - build process environment.
 * @param platform - target operating system.
 * @returns metadata to embed in the ASAR.
 */
export function resolveDesktopReleaseConfig(
  environment: NodeJS.ProcessEnv,
  platform: DesktopReleasePlatform,
): DesktopReleaseConfig {
  const releaseFlag = environment.LASMEX_DESKTOP_RELEASE
  if (releaseFlag !== undefined && releaseFlag !== '' && releaseFlag !== '0' && releaseFlag !== '1') {
    throw new Error('LASMEX_DESKTOP_RELEASE must be 0 or 1')
  }
  if (releaseFlag !== '1') return DEVELOPMENT_CONFIG
  if (platform === 'linux') {
    if (environment.LASMEX_DESKTOP_UPDATE_BASE_URL !== undefined) {
      throw new Error('Electron autoUpdater is unsupported on Linux; omit LASMEX_DESKTOP_UPDATE_BASE_URL')
    }
    return { formatVersion: 1, release: true, update: { enabled: false } }
  }
  const baseUrl = environment.LASMEX_DESKTOP_UPDATE_BASE_URL
  if (baseUrl === undefined || baseUrl === '') {
    throw new Error('signed Windows and macOS releases require LASMEX_DESKTOP_UPDATE_BASE_URL')
  }
  return {
    formatVersion: 1,
    release: true,
    update: { enabled: true, baseUrl: normalizedUpdateBaseUrl(baseUrl) },
  }
}

/**
 * Load release metadata beside the packaged main-process bundle.
 * @param path - expected metadata file path.
 * @param packaged - whether Electron is running a packaged application.
 * @returns validated release metadata.
 */
export function loadDesktopReleaseConfig(path: string, packaged: boolean): DesktopReleaseConfig {
  if (!existsSync(path)) {
    if (packaged) throw new Error('packaged desktop application is missing desktop.release.json')
    return DEVELOPMENT_CONFIG
  }
  let decoded: unknown
  try {
    decoded = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error('desktop release configuration is not valid JSON', { cause: error })
  }
  return parseDesktopReleaseConfig(decoded)
}

/**
 * Build the platform-and-version-specific Squirrel endpoint.
 * @param config - validated release metadata.
 * @param platform - running operating system.
 * @param version - running application version.
 * @returns the authenticated update endpoint, or undefined when updates are disabled.
 */
export function desktopUpdateFeedUrl(
  config: DesktopReleaseConfig,
  platform: DesktopReleasePlatform,
  version: string,
): string | undefined {
  if (!config.update.enabled) return undefined
  if (platform === 'linux') throw new Error('Electron autoUpdater is unsupported on Linux')
  return `${config.update.baseUrl}/${platform}/${encodeURIComponent(version)}`
}
