/** LasmeX Electron main process: one local Host, one isolated renderer, zero listening ports. */

import { fileURLToPath } from 'node:url'
import { app, autoUpdater, BrowserWindow, protocol, session, type Session } from 'electron'
import electronSquirrelStartup from 'electron-squirrel-startup'
import type { Context } from '@deepseek-ai/cordis'
import { loadLayeredEnv } from 'lasmex-app-boot'
import { prepareLasmexEnvironment } from 'lasmex/identity'
import { runProfile } from 'lasmex/profile-boot'
import { requireHostFaces } from './host-faces.ts'
import { createDesktopProtocolHandler } from './protocol.ts'
import { loadDesktopReleaseConfig } from './release-config.ts'
import {
  DESKTOP_ENTRY_URL,
  DESKTOP_SCHEME,
  DESKTOP_SESSION_PARTITION,
  desktopWebPreferences,
  isAllowedNavigation,
  isAllowedSessionRequest,
} from './security.ts'
import { configureDesktopUpdates } from './updates.ts'

protocol.registerSchemesAsPrivileged([{
  scheme: DESKTOP_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true },
}])
app.enableSandbox()

const userDataOverride = process.env.LASMEX_DESKTOP_USER_DATA_DIR
if (userDataOverride !== undefined && userDataOverride !== '') app.setPath('userData', userDataOverride)

const DESKTOP_PATCH = fileURLToPath(new URL('../desktop.patch.yml', import.meta.url))
const RENDERER_ROOT = fileURLToPath(new URL('../renderer/', import.meta.url))
const DESKTOP_ICON = fileURLToPath(new URL('../assets/icon.png', import.meta.url))
const RELEASE_CONFIG = fileURLToPath(new URL('../desktop.release.json', import.meta.url))

let hostContext: Context | undefined
let hostShutdown: { shutdown(code: number): Promise<void> } | undefined
let protocolSession: Session | undefined
let mainWindow: BrowserWindow | undefined
let disposeUpdates: (() => void) | undefined
let quitting = false
let disposed = false

async function disposeHost(): Promise<void> {
  if (disposed) return
  disposed = true
  disposeUpdates?.()
  disposeUpdates = undefined
  protocolSession?.protocol.unhandle(DESKTOP_SCHEME)
  protocolSession = undefined
  if (hostShutdown !== undefined) await hostShutdown.shutdown(0)
  else await hostContext?.fiber.dispose()
}

async function start(): Promise<void> {
  const releaseConfig = loadDesktopReleaseConfig(RELEASE_CONFIG, app.isPackaged)
  prepareLasmexEnvironment()
  const launched = await runProfile({
    environment: loadLayeredEnv('lasmex'),
    profile: 'web',
    patchFiles: [DESKTOP_PATCH],
    args: [],
    watchUserPatches: false,
  })
  hostContext = launched.ctx
  hostShutdown = launched.shutdown
  await hostContext.loader.await()
  const faces = requireHostFaces(hostContext)

  const desktopSession = session.fromPartition(DESKTOP_SESSION_PARTITION)
  desktopSession.setPermissionCheckHandler(() => false)
  desktopSession.setPermissionRequestHandler((_webContents, _permission, callback) => { callback(false) })
  desktopSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedSessionRequest(details.url) })
  })
  desktopSession.protocol.handle(DESKTOP_SCHEME, createDesktopProtocolHandler({
    rendererRoot: RENDERER_ROOT,
    host: { fetch: request => faces.connection.fetch(request), modules: faces.modules },
  }))
  protocolSession = desktopSession

  mainWindow = new BrowserWindow({
    icon: DESKTOP_ICON,
    title: 'LasmeX',
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: desktopWebPreferences(),
  })
  const contents = mainWindow.webContents
  contents.on('console-message', (details) => {
    if (details.level !== 'error') return
    console.error(
      `[lasmex-desktop] renderer error: ${details.message} (${details.sourceId}:${String(details.lineNumber)})`,
    )
  })
  contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) console.error(`[lasmex-desktop] renderer load failed: ${String(code)} ${description} (${url})`)
  })
  contents.on('render-process-gone', (_event, details) => {
    console.error(`[lasmex-desktop] renderer exited: ${details.reason} (${String(details.exitCode)})`)
  })
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-attach-webview', (event) => { event.preventDefault() })
  contents.on('will-navigate', (event, target) => {
    if (!isAllowedNavigation(target)) event.preventDefault()
  })
  contents.on('will-redirect', (event, target) => {
    if (!isAllowedNavigation(target)) event.preventDefault()
  })
  mainWindow.once('ready-to-show', () => { mainWindow?.show() })
  mainWindow.on('closed', () => {
    mainWindow = undefined
    app.quit()
  })
  await mainWindow.loadURL(DESKTOP_ENTRY_URL)
  disposeUpdates = configureDesktopUpdates(autoUpdater, releaseConfig, {
    argv: process.argv,
    executablePath: process.execPath,
    packaged: app.isPackaged,
    platform: process.platform as 'darwin' | 'linux' | 'win32',
    version: app.getVersion(),
  }, {
    info: (message) => { console.info(`[lasmex-desktop] ${message}`) },
    error: (message, error) => { console.error(`[lasmex-desktop] ${message}:`, error) },
  })
}

app.setName('LasmeX')
app.setAppUserModelId('com.squirrel.LasmeX.LasmeX')
app.on('window-all-closed', () => { app.quit() })
app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  mainWindow?.destroy()
  void disposeHost().finally(() => { app.quit() })
})

if (electronSquirrelStartup) app.quit()
else {
  void app.whenReady().then(start).catch(async (error: unknown) => {
    console.error('[lasmex-desktop] startup failed:', error)
    await disposeHost().catch((disposeError: unknown) => {
      console.error('[lasmex-desktop] teardown failed:', disposeError)
    })
    app.exit(1)
  })
}
