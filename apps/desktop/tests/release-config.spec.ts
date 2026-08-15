import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  desktopUpdateFeedUrl,
  loadDesktopReleaseConfig,
  parseDesktopReleaseConfig,
  resolveDesktopReleaseConfig,
} from '../src/release-config.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('desktop release configuration', () => {
  it('keeps unsigned builds offline and rejects ambiguous release flags', () => {
    expect(resolveDesktopReleaseConfig({}, 'win32')).toEqual({
      formatVersion: 1,
      release: false,
      update: { enabled: false },
    })
    expect(resolveDesktopReleaseConfig({ LASMEX_DESKTOP_RELEASE: '0' }, 'darwin').update.enabled).toBe(false)
    expect(() => resolveDesktopReleaseConfig({ LASMEX_DESKTOP_RELEASE: 'yes' }, 'win32')).toThrow(
      'LASMEX_DESKTOP_RELEASE must be 0 or 1',
    )
  })

  it('requires a credential-free HTTPS feed for signed Windows and macOS releases', () => {
    const environment = {
      LASMEX_DESKTOP_RELEASE: '1',
      LASMEX_DESKTOP_UPDATE_BASE_URL: 'https://updates.example.test/lasmex/',
    }
    const config = resolveDesktopReleaseConfig(environment, 'win32')
    expect(config).toEqual({
      formatVersion: 1,
      release: true,
      update: { enabled: true, baseUrl: 'https://updates.example.test/lasmex' },
    })
    expect(desktopUpdateFeedUrl(config, 'win32', '0.1.0')).toBe(
      'https://updates.example.test/lasmex/win32/0.1.0',
    )
    expect(() => resolveDesktopReleaseConfig({ LASMEX_DESKTOP_RELEASE: '1' }, 'darwin')).toThrow(
      'require LASMEX_DESKTOP_UPDATE_BASE_URL',
    )
    for (const baseUrl of [
      'http://updates.example.test/lasmex',
      'https://user:secret@updates.example.test/lasmex',
      'https://updates.example.test/lasmex?channel=stable',
    ]) {
      expect(() => resolveDesktopReleaseConfig({
        LASMEX_DESKTOP_RELEASE: '1',
        LASMEX_DESKTOP_UPDATE_BASE_URL: baseUrl,
      }, 'win32')).toThrow()
    }
  })

  it('rejects Linux updater activation and unknown durable fields', () => {
    expect(resolveDesktopReleaseConfig({ LASMEX_DESKTOP_RELEASE: '1' }, 'linux')).toEqual({
      formatVersion: 1,
      release: true,
      update: { enabled: false },
    })
    expect(() => resolveDesktopReleaseConfig({
      LASMEX_DESKTOP_RELEASE: '1',
      LASMEX_DESKTOP_UPDATE_BASE_URL: 'https://updates.example.test',
    }, 'linux')).toThrow('unsupported on Linux')
    expect(() => parseDesktopReleaseConfig({
      formatVersion: 1,
      release: false,
      update: { enabled: false },
      fallbackUrl: 'https://example.test',
    })).toThrow('unexpected fields')
  })

  it('requires packaged metadata and validates decoded JSON', () => {
    const root = mkdtempSync(join(tmpdir(), 'lasmex-desktop-release-'))
    roots.push(root)
    const path = join(root, 'desktop.release.json')
    expect(loadDesktopReleaseConfig(path, false).update.enabled).toBe(false)
    expect(() => loadDesktopReleaseConfig(path, true)).toThrow('missing desktop.release.json')

    writeFileSync(path, '{')
    expect(() => loadDesktopReleaseConfig(path, true)).toThrow('not valid JSON')
    writeFileSync(path, JSON.stringify({ formatVersion: 1, release: false, update: { enabled: false } }))
    expect(loadDesktopReleaseConfig(path, true).release).toBe(false)
  })
})
