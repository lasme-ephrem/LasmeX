/**
 * Mission activity folds actual native and Code Mode capabilities, configured
 * validation commands, approval audit, todo snapshots, and turn outcomes from
 * the complete durable log. Registry mounting also proves late replay and
 * effect-scoped removal.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from 'lasmex-session'
import type { SessionEvent } from 'lasmex-session'
import SessionProjectionRegistry from 'lasmex-session-projection'
import * as MissionPlugin from 'lasmex-session-mission'
import {
  createMissionActivityProjection,
  resolveMissionConfig,
} from 'lasmex-session-mission/src/projection.ts'
import type { MissionActivityProjection } from 'lasmex-session-mission/types'

const resolved = (maxRecentValidations = 8) => resolveMissionConfig({
  maxRecentValidations,
  validationCommandTools: ['bash', 'pwsh'],
  validationCommandPatterns: ['^(?:pnpm|npm) (?:test|run (?:typecheck|lint))\\b'],
})

/** Synthetic committed event with controlled sequence and time. */
function at(seq: number, type: string, data: unknown, time = seq * 100): SessionEvent {
  return { type, seq, time, data } as unknown as SessionEvent
}

/** Native tool start with model-emitted raw JSON arguments. */
function nativeStart(seq: number, callId: string, name: string, args: unknown): SessionEvent {
  return at(seq, 'tool/call', {
    turn: 1,
    step: 1,
    callId,
    name,
    arguments: typeof args === 'string' ? args : JSON.stringify(args),
  })
}

/** Native tool result carrying shell-rendered text. */
function nativeResult(seq: number, callId: string, text: string, executionFailed = false): SessionEvent {
  return at(seq, 'tool/result', {
    turn: 1,
    step: 1,
    message: {
      role: 'tool',
      content: [{ type: 'text', text }],
      source: { kind: 'tool', callId },
    },
    ...(executionFailed ? { error: { name: 'Error', code: 'TOOL_ERROR' } } : {}),
  })
}

/** Code Mode nested start. */
function nestedStart(seq: number, subCallId: string, name: string, args: unknown): SessionEvent {
  return at(seq, 'tool/code-dispatch-start', {
    rootCallId: 'root',
    parentCallId: 'root',
    subCallId,
    name,
    arguments: args,
  })
}

/** Code Mode nested settlement. */
function nestedResult(seq: number, subCallId: string, name: string, args: unknown, text: string, isError = false):
SessionEvent {
  return at(seq, 'tool/code-dispatch', {
    rootCallId: 'root',
    parentCallId: 'root',
    subCallId,
    name,
    arguments: args,
    isError,
    content: [{ type: 'text', text }],
  })
}

/** Fold a complete synthetic log and validate the resulting wire value. */
function fold(events: readonly SessionEvent[], maxRecentValidations = 8): MissionActivityProjection {
  const definition = createMissionActivityProjection(resolved(maxRecentValidations))
  let state = definition.init()
  for (const event of events) state = definition.apply(state, event)
  return definition.schema.parse(definition.view(state))
}

function empty(): MissionActivityProjection {
  return {
    capabilities: [],
    validations: [],
    approvals: { asked: 0, allowed: 0, rejected: 0, cancelled: 0, unavailable: 0 },
    checklist: null,
    lastOutcome: null,
  }
}

describe('missionActivity fold', () => {
  it('serves an empty value and preserves the state reference for unrelated events', () => {
    const definition = createMissionActivityProjection(resolved())
    const state = definition.init()
    expect(definition.view(state)).toEqual(empty())
    expect(definition.apply(state, at(0, 'user/message', { role: 'user', content: [] }))).toBe(state)
    expect(definition.apply(state, at(1, 'assistant/chunk', { turn: 1, step: 1, chunk: {} }))).toBe(state)
    expect(definition.apply(state, at(2, 'request/header', { header: {}, reason: 'initial' }))).toBe(state)
  })

  it('counts native capabilities and classifies configured validation exit outcomes', () => {
    const cases = [
      ['a', 'pnpm test', 'ok', false, 'passed'],
      ['b', 'pnpm run typecheck', 'bad\n[exit code: 2]', false, 'failed'],
      ['c', 'npm test', 'gone\n[killed by signal: SIGTERM]', false, 'failed'],
      ['d', 'pnpm run lint', 'slow\n[timed out after 100ms]', false, 'failed'],
      ['e', 'pnpm test', 'denied\n[sandbox: file access denied under read-only mode]', false, 'failed'],
      ['f', 'pnpm test', 'internal', true, 'failed'],
    ] as const
    const events: SessionEvent[] = []
    for (const [index, [callId, command, text, executionFailed]] of cases.entries()) {
      events.push(nativeStart(index * 2, callId, 'bash', { command }))
      events.push(nativeResult(index * 2 + 1, callId, text, executionFailed))
    }
    const value = fold(events)
    expect(value.capabilities).toEqual([{
      name: 'bash', started: 6, settled: 6, failed: 5, running: 0, lastUsedAt: 1_000,
    }])
    expect(value.validations.map(validation => validation.status))
      .toEqual(cases.map(testCase => testCase[4]))
    expect(value.validations.every(validation => validation.completedAt !== undefined
      && validation.durationMs === 100)).toBe(true)
  })

  it('keeps the exact recent validation window and ignores malformed or unmatched commands', () => {
    const events = [
      nativeStart(0, 'bad-json', 'bash', '{'),
      nativeResult(1, 'bad-json', 'bad'),
      nativeStart(2, 'unmatched', 'bash', { command: 'git status' }),
      nativeResult(3, 'unmatched', 'ok'),
      nativeStart(4, 'one', 'bash', { command: 'pnpm test' }),
      nativeResult(5, 'one', 'ok'),
      nativeStart(6, 'two', 'pwsh', { command: 'npm test' }),
      nativeResult(7, 'two', 'ok'),
      nativeStart(8, 'three', 'bash', { command: 'pnpm run lint' }),
      nativeResult(9, 'three', 'ok'),
    ]
    const value = fold(events, 2)
    expect(value.validations.map(validation => validation.command)).toEqual(['npm test', 'pnpm run lint'])
    expect(value.capabilities).toEqual([
      { name: 'bash', started: 4, settled: 4, failed: 0, running: 0, lastUsedAt: 800 },
      { name: 'pwsh', started: 1, settled: 1, failed: 0, running: 0, lastUsedAt: 600 },
    ])
  })

  it('excludes the Code Mode transport and counts each actual nested dispatch once', () => {
    const args = { command: 'pnpm test' }
    const value = fold([
      nativeStart(0, 'root', 'run_code', { code: 'await bash(...)' }),
      nestedStart(1, 'root:code:1', 'bash', args),
      nestedResult(2, 'root:code:1', 'bash', args, 'ok'),
      nestedStart(3, 'root:code:2', 'read_file', { path: 'x' }),
      nestedResult(4, 'root:code:2', 'read_file', { path: 'x' }, 'missing', true),
      nativeResult(5, 'root', 'program complete'),
    ])
    expect(value.capabilities).toEqual([
      { name: 'bash', started: 1, settled: 1, failed: 0, running: 0, lastUsedAt: 100 },
      { name: 'read_file', started: 1, settled: 1, failed: 1, running: 0, lastUsedAt: 300 },
    ])
    expect(value.validations).toMatchObject([{ toolName: 'bash', command: 'pnpm test', status: 'passed' }])
  })

  it('closes pending calls as interrupted, retains the checklist, audits approvals, and tracks turn outcome', () => {
    const value = fold([
      at(0, 'todo/write', { todos: [{ content: 'Run checks', status: 'in_progress' }] }),
      at(1, 'approval/asked', { id: 'approval-1', toolName: 'bash' }),
      at(2, 'approval/decided', { id: 'approval-1', outcome: 'allowed-once' }),
      at(3, 'approval/asked', { id: 'approval-2', toolName: 'bash' }),
      at(4, 'approval/decided', { id: 'approval-2', outcome: 'rejected' }),
      nativeStart(5, 'open', 'bash', { command: 'pnpm test' }),
      at(6, 'turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'offline', code: 'NETWORK' } } }),
      at(7, 'turn/start', { turn: 2 }),
    ])
    expect(value.capabilities).toEqual([{
      name: 'bash', started: 1, settled: 1, failed: 1, running: 0, lastUsedAt: 500,
    }])
    expect(value.validations).toMatchObject([{ status: 'interrupted', completedAt: 600, durationMs: 100 }])
    expect(value.approvals).toEqual({
      asked: 2, allowed: 1, rejected: 1, cancelled: 0, unavailable: 0, lastDecisionAt: 400,
    })
    expect(value.checklist).toEqual({
      todos: [{ content: 'Run checks', status: 'in_progress' }],
      updatedAt: 0,
    })
    expect(value.lastOutcome).toEqual({ kind: 'error', time: 600, message: 'offline', code: 'NETWORK' })
    expect(fold([
      at(0, 'turn/end', { turn: 1, reason: { kind: 'blocked' } }),
      at(1, 'turn/end', { turn: 2, reason: { kind: 'completed' } }),
    ]).lastOutcome).toBeNull()
  })

  it('rejects blank, duplicate, and invalid regex configuration at load resolution', () => {
    expect(() => resolveMissionConfig({
      maxRecentValidations: 1,
      validationCommandTools: ['bash', 'bash'],
      validationCommandPatterns: [],
    })).toThrow(/duplicate entry/)
    expect(() => resolveMissionConfig({
      maxRecentValidations: 1,
      validationCommandTools: [' bash'],
      validationCommandPatterns: [],
    })).toThrow(/surrounding whitespace/)
    expect(() => resolveMissionConfig({
      maxRecentValidations: 1,
      validationCommandTools: ['bash'],
      validationCommandPatterns: ['['],
    })).toThrow(/invalid regex/)
  })
})

describe('missionActivity registry integration', () => {
  it('rejects an omitted explicit configuration before registration', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    const fiber = ctx.plugin(MissionPlugin, {} as MissionPlugin.Config)
    await expect(fiber).rejects.toThrow(/maxRecentValidations/)
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('replays an existing log and removes the key when its plugin fiber unloads', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    const session = ctx.sessions.create(SessionId('mission'))
    session.append('todo/write', { todos: [{ content: 'Inspect', status: 'completed' }] })
    expect('missionActivity' in ctx.sessionProjections.snapshot(session).values).toBe(false)

    const fiber = await ctx.plugin(MissionPlugin, {
      maxRecentValidations: 2,
      validationCommandTools: ['bash'],
      validationCommandPatterns: ['^pnpm test\\b'],
    })
    expect(ctx.sessionProjections.snapshot(session).values.missionActivity?.checklist?.todos)
      .toEqual([{ content: 'Inspect', status: 'completed' }])
    await fiber.dispose()
    expect('missionActivity' in ctx.sessionProjections.snapshot(session).values).toBe(false)
    await ctx.fiber.dispose()
  })
})
