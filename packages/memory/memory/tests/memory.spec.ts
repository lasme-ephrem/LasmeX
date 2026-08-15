import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from 'lasmex-invariants'
import { MemoryId, MemoryService, projectMemoryScope } from '../src/index.ts'
import * as MemoryInvariant from '../src/invariant.ts'

class StubMemoryService extends MemoryService {
  readonly limits = {
    maxRecordBytes: 1,
    maxQueryBytes: 1,
    maxResults: 1,
    previewBytes: 1,
    maxEntriesPerProject: 1,
  }

  constructor(ctx: Context) {
    super(ctx, 'memory')
  }

  read(): undefined { return undefined }
  list(): readonly never[] { return [] }
  listPinned(): readonly never[] { return [] }
  search(): readonly never[] { return [] }
  save(): Promise<never> { return Promise.reject(new Error('unused')) }
  forget(): Promise<boolean> { return Promise.resolve(false) }
}

describe('memory Service Definition', () => {
  it('brands opaque ids without changing their wire value', () => {
    expect(MemoryId('memory-1')).toBe('memory-1')
  })

  it('normalizes an absolute cwd into the sole project scope', () => {
    const cwd = resolve('memory-project', 'nested', '..')
    expect(projectMemoryScope(cwd)).toBe(resolve('memory-project'))
  })

  it.each(['', 'relative/project'])('rejects a non-absolute project cwd %j', (cwd) => {
    expect(() => projectMemoryScope(cwd)).toThrow(/absolute path/)
  })

  it('registers its invariant companion over a live memory service', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(StubMemoryService)
    await ctx.plugin(MemoryInvariant)

    expect(() => {
      ctx.invariants.register('lasmex-memory', () => {})
    }).toThrow(/already registered/)
    await ctx.fiber.dispose()
  })
})
