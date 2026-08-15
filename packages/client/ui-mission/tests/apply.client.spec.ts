import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from 'lasmex-client-locale/client'
import { SlotRegistry } from 'lasmex-client-runtime/client'
import { resolveSlotLabel } from 'lasmex-client-ui-slots'
import { apply, inject } from 'lasmex-client-ui-mission/client'
import { apply as nodeApply } from 'lasmex-client-ui-mission'
import { MissionView } from '../src/client/MissionView.tsx'

async function bench(hasSession = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const loadOlder = vi.fn(async () => {})
  const openSubagent = vi.fn()
  const session = {
    loadOlder,
    getSnapshot: () => ({ hasMore: true }),
  }
  ctx.provide('sessions', {
    binding: vi.fn(() => hasSession ? { session } : undefined),
    openSubagent,
  } as never)
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, loadOlder, openSubagent }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'conversation.view': { kind: 'list', scope: 'session' } },
  } as never, () => null)
}

describe('ui-mission apply', () => {
  it('declares only the services it drives and keeps its node half empty', () => {
    expect(inject).toEqual(['slots', 'sessions', 'locale'])
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('registers after an early or late declaration at order five with French copy', async () => {
    const early = await bench()
    declare(early.slots)
    await early.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = early.slots.entries('conversation.view')[0]!
    expect(entry.options).toMatchObject({ id: 'mission', order: 5 })
    expect(entry).toMatchObject({ locale: 'mission', component: MissionView })
    expect(resolveSlotLabel(entry.options.label)).toBe('Mission')
    expect(early.locale.bind('mission')('title')).toBe('Tableau de mission')

    const late = await bench()
    await late.ctx.plugin({ inject: [...inject], apply }).await()
    expect(late.slots.entries('conversation.view')).toHaveLength(0)
    declare(late.slots)
    await Promise.resolve()
    expect(late.slots.entries('conversation.view')).toHaveLength(1)
  })

  it('injects ordinary Session paging and removes the view on teardown', async () => {
    const b = await bench()
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = b.slots.entries('conversation.view')[0]!
    const injected = (entry.inject as (sessionId: string) => {
      loadOlder: () => Promise<boolean>
      openChild: (address: unknown) => void
    })('session')
    await expect(injected.loadOlder()).resolves.toBe(false)
    expect(b.loadOlder).toHaveBeenCalledOnce()
    const address = { parentSessionId: 'session', childSessionId: 'child', mode: 'continuable' }
    injected.openChild(address)
    expect(b.openSubagent).toHaveBeenCalledWith(address)
    await fiber.dispose()
    expect(b.slots.entries('conversation.view')).toHaveLength(0)
  })

  it('fails a missing session binding at the injection point', async () => {
    const b = await bench(false)
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = b.slots.entries('conversation.view')[0]!
    expect(() => (entry.inject as (sessionId: string) => unknown)('missing'))
      .toThrow('session "missing" is unavailable')
  })
})
