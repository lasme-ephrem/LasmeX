import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { inspectLasmeXPackageLicenses } from './verify-lasmex-package-licenses.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function writeManifest(root: string, file: string, manifest: Record<string, unknown>): void {
  const path = join(root, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
}

function createWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'lasmex-package-licenses-'))
  roots.push(root)
  writeManifest(root, 'package.json', {
    name: 'lasmex-root',
    license: 'MIT',
    private: true,
    workspaces: ['apps/*', 'packages/*/*', 'vendor/*'],
  })
  return root
}

describe('LasmeX package license gate', () => {
  it('checks publishable LasmeX package names while ignoring private and other families', () => {
    const root = createWorkspace()
    writeManifest(root, 'apps/cli/package.json', { name: 'lasmex', license: 'MIT' })
    writeManifest(root, 'packages/core/agent/package.json', {
      name: 'lasmex-agent',
      license: 'BSD-3-Clause',
    })
    writeManifest(root, 'vendor/cordis/package.json', {
      name: '@deepseek-ai/cordis',
      license: 'BSD-3-Clause',
    })

    expect(inspectLasmeXPackageLicenses(root)).toEqual({
      packageCount: 2,
      failures: [
        'packages/core/agent/package.json: lasmex-agent must declare "license": "MIT"; found "BSD-3-Clause".',
      ],
    })
  })

  it('rejects a missing license declaration', () => {
    const root = createWorkspace()
    writeManifest(root, 'packages/core/agent/package.json', { name: 'lasmex-agent' })

    expect(inspectLasmeXPackageLicenses(root).failures).toEqual([
      'packages/core/agent/package.json: lasmex-agent must declare "license": "MIT"; found undefined.',
    ])
  })
})
