/** Main-process automatic update lifecycle for signed desktop releases. */

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { DesktopReleaseConfig, DesktopReleasePlatform } from './release-config.ts'
import { desktopUpdateFeedUrl } from './release-config.ts'

/** Electron autoUpdater methods used by the desktop lifecycle. */
export interface DesktopAutoUpdater {
  setFeedURL(options: { url: string }): void
  checkForUpdates(): void
  on(event: 'error', listener: (error: Error) => void): this
  on(event: 'update-downloaded', listener: () => void): this
  removeListener(event: 'error', listener: (error: Error) => void): this
  removeListener(event: 'update-downloaded', listener: () => void): this
}

/** Runtime facts required before enabling networked updates. */
export interface DesktopUpdateRuntime {
  argv: string[]
  executablePath: string
  packaged: boolean
  platform: DesktopReleasePlatform
  version: string
}

/** Update diagnostics sink. */
export interface DesktopUpdateLogger {
  /** @param message - current-state update diagnostic. */
  info(message: string): void
  /**
   * @param message - update failure diagnostic.
   * @param error - underlying failure.
   */
  error(message: string, error: unknown): void
}

function assertUpdateRuntime(config: DesktopReleaseConfig, runtime: DesktopUpdateRuntime): void {
  if (!config.update.enabled) return
  if (!runtime.packaged || !config.release) {
    throw new Error('desktop updates require a packaged release build')
  }
  if (runtime.platform === 'linux') throw new Error('Electron autoUpdater is unsupported on Linux')
  if (runtime.platform === 'win32') {
    const updateExecutable = resolve(dirname(runtime.executablePath), '..', 'Update.exe')
    if (!existsSync(updateExecutable)) {
      throw new Error('desktop updates require an installed Squirrel.Windows application')
    }
  }
}

/**
 * Configure automatic downloads for a signed installed release.
 * @param updater - Electron autoUpdater instance.
 * @param config - release metadata sealed into the ASAR.
 * @param runtime - current packaged-runtime facts.
 * @param logger - diagnostic sink.
 * @returns disposer for listeners and the scheduled first check.
 */
export function configureDesktopUpdates(
  updater: DesktopAutoUpdater,
  config: DesktopReleaseConfig,
  runtime: DesktopUpdateRuntime,
  logger: DesktopUpdateLogger,
): () => void {
  assertUpdateRuntime(config, runtime)
  const feedUrl = desktopUpdateFeedUrl(config, runtime.platform, runtime.version)
  if (feedUrl === undefined) return () => undefined

  const onError = (error: Error): void => {
    logger.error('automatic update failed', error)
  }
  const onDownloaded = (): void => {
    logger.info('automatic update downloaded; it will be installed after exit')
  }
  updater.on('error', onError)
  updater.on('update-downloaded', onDownloaded)
  updater.setFeedURL({ url: feedUrl })

  const firstRun = runtime.argv.includes('--squirrel-firstrun')
  const timer = setTimeout(() => {
    try {
      updater.checkForUpdates()
    } catch (error) {
      logger.error('automatic update check could not start', error)
    }
  }, firstRun ? 10_000 : 0)

  return () => {
    clearTimeout(timer)
    updater.removeListener('error', onError)
    updater.removeListener('update-downloaded', onDownloaded)
  }
}
