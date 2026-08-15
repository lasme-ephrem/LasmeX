import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import type { Agent } from 'lasmex-agent'
import InvariantRegistry from 'lasmex-invariants'
import { CallId } from 'lasmex-llm'
import { projectMemoryScope } from 'lasmex-memory'
import MemoryProvider from 'lasmex-memory-storage-domain'
import { Session, SessionId } from 'lasmex-session'
import Storage from 'lasmex-storage'
import * as StorageDomain from 'lasmex-storage-domain'
import * as StorageJson from 'lasmex-storage-json'
import SystemPrompt from 'lasmex-system-prompt'
import ToolRuntime from 'lasmex-tools'
import ApprovalService, { type ApprovalOutcome } from 'lasmex-user-approval'
import * as toolMemory from '../src/index.ts'
import * as ToolMemoryInvariant from '../src/invariant.ts'
import type { Config } from '../src/index.ts'

const PROVIDER_CONFIG = {
  maxRecordBytes: 2_048,
  maxQueryBytes: 64,
  maxResults: 10,
  previewBytes: 64,
  maxEntriesPerProject: 10,
}

const DEFAULT_CONFIG: Config = {
  mutationPolicy: 'allow',
  defaultResultLimit: 5,
  pinnedContextMaxBytes: 1_024,
  pinnedContextMaxItems: 5,
}

const contexts: Context[] = []
const roots: string[] = []
const toolFibers = new WeakMap<Context, Fiber>()
let call = 0

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function setup(config: Partial<Config> = {}, withApproval = true): Promise<Context> {
  const root = await mkdtemp(join(tmpdir(), 'lasmex-tool-memory-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(MemoryProvider, PROVIDER_CONFIG)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  if (withApproval) await ctx.plugin(ApprovalService)
  toolFibers.set(ctx, await ctx.plugin(toolMemory, {
    mutationPolicy: config.mutationPolicy ?? DEFAULT_CONFIG.mutationPolicy,
    defaultResultLimit: config.defaultResultLimit ?? DEFAULT_CONFIG.defaultResultLimit,
    pinnedContextMaxBytes: config.pinnedContextMaxBytes ?? DEFAULT_CONFIG.pinnedContextMaxBytes,
    pinnedContextMaxItems: config.pinnedContextMaxItems ?? DEFAULT_CONFIG.pinnedContextMaxItems,
  }))
  return ctx
}

function agent(cwd: string | null = resolve('memory-tool-project')): Agent {
  const id = SessionId(`memory-agent-${String(++call)}`)
  const header = {
    version: 0,
    id,
    createdAt: 1_700_000_000_000,
    ...(cwd === null ? {} : { cwd }),
  }
  const session = Session.create(id, [], header)
  session.append('turn/start', { turn: 1 })
  return { id, session } as unknown as Agent
}

function execute(ctx: Context, name: string, arguments_: unknown, owner: Agent | null = agent()) {
  return ctx.tools.execute({
    callId: CallId(`memory-call-${String(++call)}`),
    name,
    arguments: arguments_,
    signal: new AbortController().signal,
    ...(owner === null ? {} : { agent: owner }),
  })
}

describe('tool-memory Consumer', () => {
  it('registers list, search, read, save, and forget with stable French presentation', async () => {
    const ctx = await setup({}, false)
    expect(ctx.tools.schemas().map(schema => schema.name).filter(name => name.startsWith('memory_'))).toEqual([
      'memory_list',
      'memory_search',
      'memory_read',
      'memory_save',
      'memory_forget',
    ])
    expect(ctx.tools.get('memory_save')?.presentCall?.({ content: 'Préférence' })).toEqual({
      card: 'generic',
      title: 'Enregistrer une mémoire',
      kind: 'edit',
      rawInput: 'Préférence',
    })
  })

  it('runs explicit allow-mode save, list, search, read, and forget within the caller project', async () => {
    const ctx = await setup()
    const owner = agent()
    const saved = await execute(ctx, 'memory_save', {
      title: 'Style',
      content: 'Répondre en français.',
      tags: ['langue'],
      pinned: true,
    }, owner)
    expect(saved.isError).toBe(false)
    if (saved.isError) throw new Error('expected save success')
    const id = (saved.value as { id: string }).id

    const listed = await execute(ctx, 'memory_list', {}, owner)
    expect(listed.value).toMatchObject({ memories: [{ id, title: 'Style', pinned: true }] })
    const searched = await execute(ctx, 'memory_search', { query: 'français' }, owner)
    expect(searched.value).toMatchObject({ hits: [{ id, preview: 'Répondre en français.' }] })
    const read = await execute(ctx, 'memory_read', { id }, owner)
    expect(read.value).toMatchObject({ memory: { id, content: 'Répondre en français.' } })
    expect((await execute(ctx, 'memory_read', { id: 'missing' }, owner)).value).toEqual({ memory: null })
    const replaced = await execute(ctx, 'memory_save', { id, content: 'Toujours en français.' }, owner)
    expect(replaced.value).toMatchObject({ id, content: 'Toujours en français.' })
    const forgotten = await execute(ctx, 'memory_forget', { id }, owner)
    expect(forgotten.value).toEqual({ forgotten: true })
  })

  it.each<ApprovalOutcome>(['rejected', 'cancelled', 'unavailable'])(
    'writes nothing when approval returns %s',
    async (outcome) => {
      const ctx = await setup({ mutationPolicy: 'approval' })
      const owner = agent()
      const seen: Array<{ toolName: string; reason?: string }> = []
      ctx.on('approval/request', (request) => {
        seen.push({ toolName: request.toolName, ...(request.reason === undefined ? {} : { reason: request.reason }) })
        return Promise.resolve(outcome)
      })

      const result = await execute(ctx, 'memory_save', { content: 'Ne doit pas être écrit.' }, owner)
      expect(result.isError).toBe(true)
      expect(seen).toEqual([{ toolName: 'memory_save', reason: 'Enregistrer une mémoire durable pour ce projet.' }])
      expect(ctx.memory.list({ project: projectMemoryScope(owner.session.header.cwd!), limit: 5 })).toEqual([])
    },
  )

  it('writes only after allowed-once and audits the exact save and forget calls', async () => {
    const ctx = await setup({ mutationPolicy: 'approval' })
    const owner = agent()
    const requests: Array<{ toolName: string; callId?: string; reason?: string }> = []
    ctx.on('approval/request', (request) => {
      requests.push({
        toolName: request.toolName,
        ...(request.callId === undefined ? {} : { callId: request.callId }),
        ...(request.reason === undefined ? {} : { reason: request.reason }),
      })
      return Promise.resolve<ApprovalOutcome>('allowed-once')
    })

    const saved = await execute(ctx, 'memory_save', { content: 'Autorisé.' }, owner)
    expect(saved.isError).toBe(false)
    if (saved.isError) throw new Error('expected save success')
    const id = (saved.value as { id: string }).id
    const forgotten = await execute(ctx, 'memory_forget', { id }, owner)
    expect(forgotten.value).toEqual({ forgotten: true })
    expect(requests.map(request => request.toolName)).toEqual(['memory_save', 'memory_forget'])
    expect(requests.every(request => request.callId?.startsWith('memory-call-'))).toBe(true)
    expect(owner.session.events.filter(event => event.type === 'approval/asked')).toHaveLength(2)
    const decided = owner.session.events.filter(event => event.type === 'approval/decided')
    expect(decided).toHaveLength(2)
    for (const event of decided) {
      if (event.type !== 'approval/decided') throw new Error('expected approval decision')
      expect(event.data.outcome).toBe('allowed-once')
    }
  })

  it('rejects non-agent, cwd-less, and out-of-range calls without creating global state', async () => {
    const ctx = await setup()
    expect((await execute(ctx, 'memory_list', {}, null)).isError).toBe(true)
    expect((await execute(ctx, 'memory_save', { content: 'x' }, agent(null))).isError).toBe(true)
    expect((await execute(ctx, 'memory_list', { limit: 11 })).isError).toBe(true)

    const approval = await setup({ mutationPolicy: 'approval' })
    expect((await execute(approval, 'memory_save', { content: 'x' }, null)).isError).toBe(true)
  })

  it('injects only whole pinned records within both item and UTF-8 byte caps', async () => {
    const ctx = await setup({ pinnedContextMaxItems: 2, pinnedContextMaxBytes: 220 }, false)
    const owner = agent()
    await execute(ctx, 'memory_save', { content: 'première', pinned: true }, owner)
    await execute(ctx, 'memory_save', { content: 'x'.repeat(400), pinned: true }, owner)
    await execute(ctx, 'memory_save', { content: 'non épinglée', pinned: false }, owner)

    const assembly = await ctx.systemPrompt.assemble({ agent: owner })
    const text = assembly.contexts.find(context => context.name === 'memory:pinned-project')?.text ?? ''
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(220)
    expect(text).toMatch(/^Mémoires épinglées du projet/)
    expect(text).toContain('première')
    expect(text).not.toContain('x'.repeat(20))
    expect(text).not.toContain('non épinglée')
    expect(() => { void (JSON.parse(text.slice(text.indexOf('\n') + 1)) as unknown) }).not.toThrow()
    expect(toolMemory.renderPinnedMemories([], 200)).toBe('')
    expect(toolMemory.renderPinnedMemories(ctx.memory.listPinned({
      project: projectMemoryScope(owner.session.header.cwd!),
      limit: 2,
    }), 0)).toBe('')
    expect(toolMemory.renderPinnedMemories(ctx.memory.listPinned({
      project: projectMemoryScope(owner.session.header.cwd!),
      limit: 2,
    }), 5)).toBe('')
    const cwdless = { session: { header: {} } } as unknown as Agent
    expect((await ctx.systemPrompt.assemble({ agent: cwdless })).contexts.find(entry => entry.name === 'memory:pinned-project')?.text).toBe('')
  })

  it('covers disabled context, content-free summaries, and pure presentation metadata', async () => {
    const ctx = await setup({ pinnedContextMaxBytes: 0, pinnedContextMaxItems: 0 }, false)
    const owner = agent()
    const saved = await execute(ctx, 'memory_save', { content: 'sans titre' }, owner)
    expect(saved.isError).toBe(false)
    const listed = await execute(ctx, 'memory_list', {}, owner)
    expect(JSON.stringify(listed.value)).not.toContain('"content"')
    expect(JSON.stringify(listed.value)).not.toContain('"title"')
    expect((await ctx.systemPrompt.assemble()).contexts.find(entry => entry.name === 'memory:pinned-project')?.text).toBe('')

    expect(ctx.tools.get('memory_list')?.isConcurrencySafe?.({})).toBe(true)
    expect(ctx.tools.get('memory_search')?.isConcurrencySafe?.({ query: 'x' })).toBe(true)
    expect(ctx.tools.get('memory_read')?.isConcurrencySafe?.({ id: 'x' })).toBe(true)
    expect(ctx.tools.get('memory_list')?.presentCall?.({})).toMatchObject({ title: 'Lister les mémoires du projet' })
    expect(ctx.tools.get('memory_search')?.presentCall?.({ query: 'needle' })).toMatchObject({ rawInput: 'needle' })
    expect(ctx.tools.get('memory_read')?.presentCall?.({ id: 'read-id' })).toMatchObject({ rawInput: 'read-id' })
    expect(ctx.tools.get('memory_forget')?.presentCall?.({ id: 'forget-id' })).toMatchObject({ rawInput: 'forget-id' })
  })

  it('unregisters tools and pinned context with its plugin fiber', async () => {
    const ctx = await setup()
    const owner = agent()
    const project = projectMemoryScope(owner.session.header.cwd!)
    await ctx.memory.save({ project, content: 'Visible before disposal.', pinned: true })
    const fiber = toolFibers.get(ctx)
    if (fiber === undefined) throw new Error('missing tool-memory fiber')
    await fiber.dispose()
    expect(ctx.tools.schemas().some(schema => schema.name === 'memory_save')).toBe(false)
    expect((await ctx.systemPrompt.assemble({ agent: owner })).contexts.some(context => context.name === 'memory:pinned-project')).toBe(false)
  })

  it('registers its invariant companion over the live Consumer services', async () => {
    const ctx = await setup()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(ToolMemoryInvariant)
    expect(() => {
      ctx.invariants.register('lasmex-tool-memory', () => {})
    }).toThrow(/already registered/)
  })

  it('keeps Loader namespace metadata and rejects invalid mandatory config', async () => {
    const loader = Object.create(Loader.prototype) as Loader
    expect(loader.unwrapExports(toolMemory)).toBe(toolMemory)
    expect(toolMemory.inject).toEqual(['tools', 'memory', 'systemPrompt'])
    await expect(setup({ defaultResultLimit: 11 })).rejects.toThrow(/provider maximum/)
    await expect(setup({ pinnedContextMaxItems: 11 })).rejects.toThrow(/provider maximum/)
    const ctx = await setup()
    expect(() => {
      toolMemory.apply(ctx, {
        mutationPolicy: DEFAULT_CONFIG.mutationPolicy,
        defaultResultLimit: 0,
        pinnedContextMaxBytes: DEFAULT_CONFIG.pinnedContextMaxBytes,
        pinnedContextMaxItems: DEFAULT_CONFIG.pinnedContextMaxItems,
      })
    }).toThrow(/at least 1/)
  })
})
