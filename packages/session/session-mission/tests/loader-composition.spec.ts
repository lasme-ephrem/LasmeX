/**
 * Real Loader composition proof for the shipped session + projection registry
 * + explicitly configured mission contributor shape.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SessionStore, { SessionId } from 'lasmex-session'
import SessionProjectionRegistry from 'lasmex-session-projection'
import * as MissionPlugin from 'lasmex-session-mission'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function loadYaml(lines: readonly string[]): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'lasmex-session-mission-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [...lines, ''].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['lasmex-session', SessionStore],
    ['lasmex-session-projection', SessionProjectionRegistry],
    ['lasmex-session-mission', MissionPlugin],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  return context
}

describe('real Loader composition', () => {
  it('loads explicit mission config and serves the whole-log projection', async () => {
    const loaded = await loadYaml([
      "- name: 'lasmex-session'",
      "- name: 'lasmex-session-projection'",
      "- name: 'lasmex-session-mission'",
      '  config:',
      '    maxRecentValidations: 4',
      '    validationCommandTools: [bash, pwsh]',
      '    validationCommandPatterns:',
      "      - '^(?:pnpm|npm) test\\b'",
    ])
    const unloaded = [...loaded.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    expect(unloaded).toEqual([])

    const session = loaded.sessions.create(SessionId('composed-mission'))
    session.append('todo/write', { todos: [{ content: 'Test mission', status: 'in_progress' }] })
    expect(loaded.sessionProjections.snapshot(session).values.missionActivity).toMatchObject({
      checklist: { todos: [{ content: 'Test mission', status: 'in_progress' }] },
      capabilities: [],
      validations: [],
    })
  })

  it('keeps the function-plugin namespace free of a default export', () => {
    expect('default' in MissionPlugin).toBe(false)
  })
})
