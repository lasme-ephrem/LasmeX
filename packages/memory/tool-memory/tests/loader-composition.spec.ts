import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import type { Agent } from 'lasmex-agent'
import { projectMemoryScope } from 'lasmex-memory'
import MemoryProvider from 'lasmex-memory-storage-domain'
import { Session, SessionId } from 'lasmex-session'
import Storage from 'lasmex-storage'
import * as StorageDomain from 'lasmex-storage-domain'
import * as StorageJson from 'lasmex-storage-json'
import SystemPrompt from 'lasmex-system-prompt'
import ToolRuntime from 'lasmex-tools'
import * as ToolMemory from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('project memory through a real cordis.yml Loader composition', () => {
  it('loads the complete service, provider, and Consumer seam', async () => {
    root = await mkdtemp(join(tmpdir(), 'lasmex-memory-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: 'lasmex-storage'",
      "- name: 'lasmex-storage-json'",
      '  config:',
      `    root: ${JSON.stringify(root)}`,
      "- name: 'lasmex-storage-domain'",
      '  config:',
      '    backend: json',
      "- name: 'lasmex-memory-storage-domain'",
      '  config:',
      '    maxRecordBytes: 2048',
      '    maxQueryBytes: 64',
      '    maxResults: 10',
      '    previewBytes: 64',
      '    maxEntriesPerProject: 10',
      "- name: 'lasmex-system-prompt'",
      "- name: 'lasmex-tools'",
      "- name: 'lasmex-tool-memory'",
      '  config:',
      '    mutationPolicy: allow',
      '    defaultResultLimit: 5',
      '    pinnedContextMaxBytes: 1024',
      '    pinnedContextMaxItems: 5',
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = `${pathToFileURL(root).href}/`
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['lasmex-storage', Storage],
      ['lasmex-storage-json', StorageJson],
      ['lasmex-storage-domain', StorageDomain],
      ['lasmex-memory-storage-domain', MemoryProvider],
      ['lasmex-system-prompt', SystemPrompt],
      ['lasmex-tools', ToolRuntime],
      ['lasmex-tool-memory', ToolMemory],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await context.loader.await()

    expect(context.tools.schemas().map(schema => schema.name).filter(name => name.startsWith('memory_')))
      .toEqual(['memory_list', 'memory_search', 'memory_read', 'memory_save', 'memory_forget'])
    const project = projectMemoryScope(root)
    await context.memory.save({ project, content: 'Loader-visible memory.', pinned: true })
    const id = SessionId('memory-loader-agent')
    const session = Session.create(id, [], { version: 0, id, createdAt: 0, cwd: root })
    const owner = { id, session } as unknown as Agent
    const pinned = (await context.systemPrompt.assemble({ agent: owner })).contexts
      .find(entry => entry.name === 'memory:pinned-project')
    expect(pinned?.text).toContain('Loader-visible memory.')
  })
})
