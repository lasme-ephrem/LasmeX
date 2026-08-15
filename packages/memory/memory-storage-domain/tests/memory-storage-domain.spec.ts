import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import InvariantRegistry from 'lasmex-invariants'
import { MemoryId, projectMemoryScope } from 'lasmex-memory'
import Storage from 'lasmex-storage'
import * as StorageDomain from 'lasmex-storage-domain'
import * as StorageJson from 'lasmex-storage-json'
import MemoryProvider, {
  memoryRecordSchema,
  projectMemoryScopeSchema,
  type Config,
} from '../src/index.ts'
import * as MemoryProviderInvariant from '../src/invariant.ts'

const DEFAULT_CONFIG: Config = {
  maxRecordBytes: 2_048,
  maxQueryBytes: 32,
  maxResults: 10,
  previewBytes: 5,
  maxEntriesPerProject: 3,
}

const roots: string[] = []
const contexts: Context[] = []
const providerFibers = new WeakMap<Context, Fiber>()

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'lasmex-memory-'))
  roots.push(root)
  return root
}

async function mount(root: string, overrides: Partial<Config> = {}): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  providerFibers.set(ctx, await ctx.plugin(MemoryProvider, {
    maxRecordBytes: overrides.maxRecordBytes ?? DEFAULT_CONFIG.maxRecordBytes,
    maxQueryBytes: overrides.maxQueryBytes ?? DEFAULT_CONFIG.maxQueryBytes,
    maxResults: overrides.maxResults ?? DEFAULT_CONFIG.maxResults,
    previewBytes: overrides.previewBytes ?? DEFAULT_CONFIG.previewBytes,
    maxEntriesPerProject: overrides.maxEntriesPerProject ?? DEFAULT_CONFIG.maxEntriesPerProject,
  }))
  return ctx
}

const projectA = projectMemoryScope(resolve('project-a'))
const projectB = projectMemoryScope(resolve('project-b'))

describe('StorageDomainMemoryService', () => {
  it('creates, isolates, searches, replaces, lists, reads, and forgets records', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_700_000_000_000)
    const ctx = await mount(await temporaryRoot())
    const first = await ctx.memory.save({
      project: projectA,
      title: 'Architecture',
      content: 'Use the plugin seam.',
      tags: ['design', 'design', ' plugin '],
      pinned: true,
    })
    vi.setSystemTime(1_700_000_000_100)
    const other = await ctx.memory.save({ project: projectB, content: 'Private to B.' })

    expect(first.tags).toEqual(['design', 'plugin'])
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.tags)).toBe(true)
    expect(ctx.memory.read({ project: projectB, id: first.id })).toBeUndefined()
    expect(ctx.memory.read({ project: projectA, id: other.id })).toBeUndefined()
    expect(ctx.memory.list({ project: projectA, limit: 10 })).toEqual([{
      id: first.id,
      project: projectA,
      title: 'Architecture',
      tags: ['design', 'plugin'],
      pinned: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    }])
    expect(ctx.memory.search({ project: projectA, query: 'PLUGIN', limit: 10 })[0]).toMatchObject({
      id: first.id,
      preview: 'Use t',
    })
    expect(ctx.memory.listPinned({ project: projectA, limit: 10 })).toEqual([first])

    const replaced = await ctx.memory.save({
      project: projectA,
      id: first.id,
      content: 'Updated.',
      tags: ['current'],
      pinned: false,
    })
    expect(replaced).toMatchObject({
      id: first.id,
      content: 'Updated.',
      tags: ['current'],
      pinned: false,
      createdAt: first.createdAt,
      updatedAt: 1_700_000_000_100,
    })
    expect(replaced).not.toHaveProperty('title')
    await expect(ctx.memory.save({ project: projectB, id: first.id, content: 'cross-scope' }))
      .rejects.toThrow(/not found in project/)
    await expect(ctx.memory.forget({ project: projectB, id: first.id })).resolves.toBe(false)
    await expect(ctx.memory.forget({ project: projectA, id: first.id })).resolves.toBe(true)
    await expect(ctx.memory.forget({ project: projectA, id: first.id })).resolves.toBe(false)
  })

  it('enforces query, result, record, preview, and concurrent capacity bounds', async () => {
    const ctx = await mount(await temporaryRoot(), {
      maxRecordBytes: 220,
      maxQueryBytes: 4,
      maxResults: 2,
      previewBytes: 5,
      maxEntriesPerProject: 1,
    })
    await expect(Promise.allSettled([
      ctx.memory.save({ project: projectA, content: 'ééé text' }),
      ctx.memory.save({ project: projectA, content: 'second' }),
    ])).resolves.toSatisfy((results: PromiseSettledResult<unknown>[]) =>
      results.filter(result => result.status === 'fulfilled').length === 1
      && results.filter(result => result.status === 'rejected').length === 1)
    await expect(ctx.memory.save({ project: projectA, content: 'capacity' })).rejects.toThrow(/maximum 1 records/)

    const hit = ctx.memory.search({ project: projectA, query: 'é', limit: 1 })[0]
    if (hit !== undefined && hit.preview.startsWith('é')) {
      expect(Buffer.byteLength(hit.preview, 'utf8')).toBeLessThanOrEqual(5)
      expect(hit.preview).not.toContain('�')
    }
    expect(() => ctx.memory.list({ project: projectA, limit: 3 })).toThrow(/1 to 2/)
    expect(() => ctx.memory.search({ project: projectA, query: 'abcde', limit: 1 })).toThrow(/maximum is 4/)
    expect(() => ctx.memory.search({ project: projectA, query: '   ', limit: 1 })).toThrow(/must not be blank/)
    await expect(ctx.memory.save({ project: projectB, content: 'x'.repeat(500) })).rejects.toThrow(/complete record/)
    await expect(ctx.memory.save({ project: projectB, content: '   ' })).rejects.toThrow(/must not be blank/)
    await expect(ctx.memory.save({ project: projectB, title: '   ', content: 'valid' })).rejects.toThrow(/title must not be blank/)
    await expect(ctx.memory.save({ project: projectB, content: 'valid', tags: ['  '] })).rejects.toThrow(/tags must not be blank/)
  })

  it('orders timestamp ties by id and returns short previews unchanged', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_700_000_000_000)
    const ctx = await mount(await temporaryRoot())
    const left = await ctx.memory.save({ project: projectA, content: 'a' })
    const right = await ctx.memory.save({ project: projectA, content: 'b' })
    const expected = [left.id, right.id].sort((a, b) => a.localeCompare(b))
    expect(ctx.memory.list({ project: projectA, limit: 2 }).map(record => record.id)).toEqual(expected)
    expect(ctx.memory.search({ project: projectA, query: 'a', limit: 1 })[0]?.preview).toBe('a')
    expect(ctx.memory.list({ project: projectA, limit: 2 }).every(record => record.title === undefined)).toBe(true)
  })

  it('reopens durable records and rejects active limits that contradict stored data', async () => {
    const root = await temporaryRoot()
    const first = await mount(root)
    const saved = await first.memory.save({ project: projectA, content: 'Persist across restart.', pinned: true })
    await first.fiber.dispose()
    contexts.splice(contexts.indexOf(first), 1)

    const reopened = await mount(root)
    expect(reopened.memory.read({ project: projectA, id: saved.id })).toEqual(saved)
    await reopened.fiber.dispose()
    contexts.splice(contexts.indexOf(reopened), 1)

    await expect(mount(root, { maxRecordBytes: 1 })).rejects.toThrow(/stored record/)
  })

  it('fails loud for invalid direct-mount configuration and missing update ids', async () => {
    const root = await temporaryRoot()
    await expect(mount(root, { maxResults: 0 })).rejects.toThrow(/maxResults.*>= 1/)

    const healthy = await mount(await temporaryRoot())
    await expect(healthy.memory.save({
      project: projectA,
      id: MemoryId('00000000-0000-4000-8000-000000000000'),
      content: 'missing',
    })).rejects.toThrow(/not found in project/)
  })

  it('registers its invariant companion over the live provider', async () => {
    const ctx = await mount(await temporaryRoot())
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(MemoryProviderInvariant)
    expect(() => {
      ctx.invariants.register('lasmex-memory-storage-domain', () => {})
    }).toThrow(/already registered/)
  })

  it('validates direct constructors, durable schemas, uninitialized access, and disposal admission', async () => {
    const invalidConfig = {
      maxRecordBytes: DEFAULT_CONFIG.maxRecordBytes,
      maxQueryBytes: DEFAULT_CONFIG.maxQueryBytes,
      maxResults: 0,
      previewBytes: DEFAULT_CONFIG.previewBytes,
      maxEntriesPerProject: DEFAULT_CONFIG.maxEntriesPerProject,
    }
    expect(() => new MemoryProvider(new Context(), invalidConfig)).toThrow(/positive safe integer/)

    expect(projectMemoryScopeSchema.safeParse('relative').success).toBe(false)
    const base = {
      id: '00000000-0000-4000-8000-000000000000',
      project: projectA,
      content: 'valid',
      tags: ['tag'],
      pinned: false,
      createdAt: 2,
      updatedAt: 2,
    }
    expect(memoryRecordSchema.safeParse(base).success).toBe(true)
    expect(memoryRecordSchema.safeParse({ ...base, title: ' ' }).success).toBe(false)
    expect(memoryRecordSchema.safeParse({ ...base, title: ' title ' }).success).toBe(false)
    expect(memoryRecordSchema.safeParse({ ...base, tags: [''] }).success).toBe(false)
    expect(memoryRecordSchema.safeParse({ ...base, tags: [' tag '] }).success).toBe(false)
    expect(memoryRecordSchema.safeParse({ ...base, tags: ['tag', 'tag'] }).success).toBe(false)
    expect(memoryRecordSchema.safeParse({ ...base, updatedAt: 1 }).success).toBe(false)

    const uninitialized = new MemoryProvider(new Context(), DEFAULT_CONFIG)
    expect(() => uninitialized.list({ project: projectA, limit: 1 })).toThrow(/not initialized/)

    const mounted = await mount(await temporaryRoot())
    const service = mounted.memory
    const fiber = providerFibers.get(mounted)
    if (fiber === undefined) throw new Error('missing provider fiber')
    await fiber.dispose()
    await expect(service.save({ project: projectA, content: 'late' })).rejects.toThrow(/disposing/)
  })

  it('rejects loaded project overflow and a replacement beyond safe timestamp range', async () => {
    const capacityRoot = await temporaryRoot()
    const writer = await mount(capacityRoot)
    await writer.memory.save({ project: projectA, content: 'first' })
    await writer.memory.save({ project: projectA, content: 'second' })
    await writer.fiber.dispose()
    contexts.splice(contexts.indexOf(writer), 1)
    await expect(mount(capacityRoot, { maxEntriesPerProject: 1 })).rejects.toThrow(/exceeds the configured 1 records/)

    const timestampRoot = await temporaryRoot()
    const initial = await mount(timestampRoot)
    const saved = await initial.memory.save({ project: projectA, content: 'timestamp' })
    await initial.fiber.dispose()
    contexts.splice(contexts.indexOf(initial), 1)
    const path = join(timestampRoot, 'project_memory.json')
    const document = JSON.parse(await readFile(path, 'utf8')) as {
      tables: { memories: Record<string, { updatedAt: number }> }
    }
    document.tables.memories[saved.id]!.updatedAt = Number.MAX_SAFE_INTEGER
    await writeFile(path, `${JSON.stringify(document)}\n`)
    const reopened = await mount(timestampRoot)
    await expect(reopened.memory.save({ project: projectA, id: saved.id, content: 'overflow' }))
      .rejects.toThrow(/safe integer range/)
  })
})
