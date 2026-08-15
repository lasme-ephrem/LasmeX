import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopAutoUpdater } from '../src/updates.ts'
import { configureDesktopUpdates } from '../src/updates.ts'

const roots: string[] = []

afterEach(() => {
  vi.useRealTimers()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function updaterFixture() {
  const listeners = new Map<string, Set<object>>()
  const checkForUpdates = vi.fn((): void => undefined)
  const setFeedURL = vi.fn((_options: { url: string }): void => undefined)
  const updater: DesktopAutoUpdater = {
    checkForUpdates,
    setFeedURL,
    on(event, listener) {
      const eventListeners = listeners.get(event) ?? new Set()
      eventListeners.add(listener)
      listeners.set(event, eventListeners)
      return this
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener)
      return this
    },
  }
  return { checkForUpdates, setFeedURL, updater }
}

describe('desktop automatic updates', () => {
  it('does nothing for the default unsigned build', () => {
    const { setFeedURL, updater } = updaterFixture()
    const dispose = configureDesktopUpdates(updater, {
      formatVersion: 1,
      release: false,
      update: { enabled: false },
    }, {
      argv: [],
      executablePath: 'LasmeX.exe',
      packaged: false,
      platform: 'win32',
      version: '0.1.0',
    }, { info: vi.fn(), error: vi.fn() })
    dispose()
    expect(setFeedURL).not.toHaveBeenCalled()
  })

  it('configures an installed Squirrel release and delays its first-run check', () => {
    vi.useFakeTimers()
    const root = mkdtempSync(join(tmpdir(), 'lasmex-desktop-update-'))
    roots.push(root)
    const versionDirectory = join(root, 'app-0.1.0')
    mkdirSync(versionDirectory)
    writeFileSync(join(root, 'Update.exe'), '')
    const { checkForUpdates, setFeedURL, updater } = updaterFixture()
    const dispose = configureDesktopUpdates(updater, {
      formatVersion: 1,
      release: true,
      update: { enabled: true, baseUrl: 'https://updates.example.test/lasmex' },
    }, {
      argv: ['LasmeX.exe', '--squirrel-firstrun'],
      executablePath: join(versionDirectory, 'LasmeX.exe'),
      packaged: true,
      platform: 'win32',
      version: '0.1.0',
    }, { info: vi.fn(), error: vi.fn() })

    expect(setFeedURL).toHaveBeenCalledWith({
      url: 'https://updates.example.test/lasmex/win32/0.1.0',
    })
    vi.advanceTimersByTime(9_999)
    expect(checkForUpdates).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(checkForUpdates).toHaveBeenCalledOnce()
    dispose()
  })

  it('fails before networking for unpackaged or non-Squirrel releases', () => {
    const config = {
      formatVersion: 1 as const,
      release: true,
      update: { enabled: true as const, baseUrl: 'https://updates.example.test' },
    }
    const { setFeedURL, updater } = updaterFixture()
    expect(() => configureDesktopUpdates(updater, config, {
      argv: [],
      executablePath: 'LasmeX.exe',
      packaged: false,
      platform: 'win32',
      version: '0.1.0',
    }, { info: vi.fn(), error: vi.fn() })).toThrow('packaged release')
    expect(() => configureDesktopUpdates(updater, config, {
      argv: [],
      executablePath: 'C:\\portable\\LasmeX.exe',
      packaged: true,
      platform: 'win32',
      version: '0.1.0',
    }, { info: vi.fn(), error: vi.fn() })).toThrow('installed Squirrel.Windows')
    expect(setFeedURL).not.toHaveBeenCalled()
  })
})
