import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from 'lasmex-agent-loop'
import { mountAgentLoopTestDependencies } from 'lasmex-agent-loop-testkit'
import {
  createUserMessage,
  LlmAdapter,
  type GenerateOptions,
  type StreamChunk,
} from 'lasmex-llm'
import { projectMemoryScope } from 'lasmex-memory'
import MemoryProvider from 'lasmex-memory-storage-domain'
import { Session, SessionId, type SessionEvent } from 'lasmex-session'
import Storage from 'lasmex-storage'
import * as StorageDomain from 'lasmex-storage-domain'
import * as StorageJson from 'lasmex-storage-json'
import ApprovalService from 'lasmex-user-approval'
import * as toolMemory from '../src/index.ts'

class RecordingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'done' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

let ctx: Context | undefined
let root: string | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('pinned-memory replay', () => {
  it('materializes exact systemPrompt context as a durable, replayable user/message', async () => {
    root = await mkdtemp(join(tmpdir(), 'lasmex-memory-replay-'))
    ctx = new Context()
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    await ctx.plugin(MemoryProvider, {
      maxRecordBytes: 2_048,
      maxQueryBytes: 64,
      maxResults: 10,
      previewBytes: 64,
      maxEntriesPerProject: 10,
    })
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(ApprovalService)
    await ctx.plugin(toolMemory, {
      mutationPolicy: 'allow',
      defaultResultLimit: 5,
      pinnedContextMaxBytes: 1_024,
      pinnedContextMaxItems: 5,
    })
    await ctx.plugin(AgentLoop, { agents: [] })

    const cwd = resolve('replay-project')
    const saved = await ctx.memory.save({
      project: projectMemoryScope(cwd),
      title: 'Langue',
      content: 'Répondre en français.',
      pinned: true,
    })
    const adapter = new RecordingAdapter()
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = ctx.agentLoop.create(SessionId('memory-replay'), { provider: 'mock', model: 'mock' }, { cwd })
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Commence.' }],
      source: { kind: 'user' },
    }))
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(1)
    const contextEvent = agent.session.events.find((event): event is SessionEvent<'user/message'> =>
      event.type === 'user/message'
      && event.data.source.kind === 'plugin'
      && event.data.source.plugin === 'lasmex-system-prompt'
      && JSON.stringify(event.data.source).includes('memory:pinned-project'))
    expect(contextEvent).toBeDefined()
    const pinned = contextEvent?.data.content
      .flatMap(block => block.type === 'text' ? [block.text] : [])
      .join('\n')
    const expectedPinned = toolMemory.renderPinnedMemories(ctx.memory.listPinned({
      project: projectMemoryScope(cwd),
      limit: 5,
    }), 1_024)
    expect(pinned).toContain(expectedPinned)
    if (contextEvent?.data.source.kind !== 'plugin' || contextEvent.data.source.form !== 'snapshot') {
      throw new Error('expected plugin-sourced runtime-context snapshot')
    }
    expect(contextEvent.data.source.sections.find(section => section.name === 'memory:pinned-project')?.text)
      .toBe(expectedPinned)
    expect(JSON.stringify(adapter.requests[0]?.messages)).toContain('Répondre en français.')

    await ctx.memory.save({
      project: projectMemoryScope(cwd),
      id: saved.id,
      content: 'Répondre en anglais.',
      pinned: true,
    })

    const replayed = Session.create(agent.session.id, agent.session.events, agent.session.header)
    const replayedEvent = replayed.events[contextEvent.seq]
    expect(replayedEvent).toEqual(contextEvent)
    expect(JSON.stringify(replayed.deriveMessages())).toContain('Répondre en français.')
    expect(JSON.stringify(replayed.deriveMessages())).not.toContain('Répondre en anglais.')
  })
})
