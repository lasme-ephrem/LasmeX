import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_LASMEX_HOME_DISPLAY,
  LASMEX_HOME_DIR_NAME,
  canonicalizeWatchPath,
  defaultLasmexHome,
  lasmexHomeDisplay,
  lasmexHomePath,
  expandHomePath,
  resolveLasmexHome,
} from 'lasmex-home-paths'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('LasmeX path helpers', () => {
  it('owns the shared default LasmeX home directory name', () => {
    expect(LASMEX_HOME_DIR_NAME).toBe('.lasmex')
    expect(DEFAULT_LASMEX_HOME_DISPLAY).toBe('~/.lasmex')
    expect(defaultLasmexHome()).toBe(join(homedir(), '.lasmex'))
  })

  it('expands tilde paths without changing non-tilde paths', () => {
    expect(expandHomePath('~')).toBe(homedir())
    expect(expandHomePath('~/.lasmex')).toBe(join(homedir(), '.lasmex'))
    expect(expandHomePath('~\\.lasmex')).toBe(join(homedir(), '.lasmex'))
    expect(expandHomePath('/tmp/.lasmex')).toBe('/tmp/.lasmex')
    expect(expandHomePath('~other/.lasmex')).toBe('~other/.lasmex')
  })

  it('resolves explicit path before LASMEX_HOME and the default', () => {
    const envHome = join(homedir(), 'env-lasmex')

    expect(resolveLasmexHome('/tmp/explicit-lasmex', { LASMEX_HOME: '~/env-lasmex' })).toBe(resolve('/tmp/explicit-lasmex'))
    expect(resolveLasmexHome(undefined, { LASMEX_HOME: '~/env-lasmex' })).toBe(envHome)
    expect(resolveLasmexHome(undefined, {})).toBe(defaultLasmexHome())
  })

  it('treats an empty or whitespace-only LASMEX_HOME as unset', () => {
    expect(resolveLasmexHome(undefined, { LASMEX_HOME: '' })).toBe(defaultLasmexHome())
    expect(resolveLasmexHome(undefined, { LASMEX_HOME: '   ' })).toBe(defaultLasmexHome())
  })

  it('joins child segments onto the resolved LASMEX_HOME', () => {
    vi.stubEnv('LASMEX_HOME', '~/env-lasmex')
    expect(lasmexHomePath()).toBe(join(homedir(), 'env-lasmex'))
    expect(lasmexHomePath('storages', 'cache')).toBe(join(homedir(), 'env-lasmex', 'storages', 'cache'))
  })

  it('labels a resolved home by whether it is the default root', () => {
    expect(lasmexHomeDisplay(resolve(defaultLasmexHome()))).toBe('~/.lasmex')
    expect(lasmexHomeDisplay('/some/other/root')).toBe('$LASMEX_HOME')
  })

  it('canonicalizes a watcher ancestor while preserving a missing suffix', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lasmex-watch-path-'))
    const target = join(root, 'target')
    const alias = join(root, 'alias')
    try {
      await mkdir(target)
      await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
      await expect(canonicalizeWatchPath(join(alias, 'later', 'config.yml'))).resolves.toBe(
        join(await realpath(target), 'later', 'config.yml'),
      )
      const file = join(root, 'file')
      await writeFile(file, 'not a directory')
      await expect(canonicalizeWatchPath(join(file, 'child'))).rejects.toMatchObject({ code: 'ENOTDIR' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
