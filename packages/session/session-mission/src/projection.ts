/**
 * Pure whole-log fold for the `missionActivity` projection.
 *
 * Native tool calls use `tool/call` and `tool/result`. Code Mode's outer
 * `run_code` call is a presentation transport, so the fold excludes it and
 * counts the actual `tool/code-dispatch-start` and `tool/code-dispatch`
 * sub-calls instead. Validation status is derived only for explicitly
 * configured command tools and regex matches.
 *
 * @module lasmex-session-mission/projection
 */

import { z } from 'zod'
import { RUN_CODE_NAME } from 'lasmex-tools'
import type {} from 'lasmex-tools/types'
import type {} from 'lasmex-user-approval'
import { parseExitStatus } from 'lasmex-shell'
import type { SessionEvent } from 'lasmex-session'
import type { ProjectionDefinition } from 'lasmex-session-projection'
import type { Config } from './index.ts'
import type {
  MissionActivityProjection,
  MissionApprovalSummary,
  MissionCapabilityUsage,
  MissionTurnOutcome,
  MissionValidation,
} from './types.ts'

/** Configuration resolved once at plugin load. */
export interface ResolvedMissionConfig {
  /** Complete retained validation window. */
  maxRecentValidations: number
  /** Exact command-aware tool names. */
  validationCommandTools: ReadonlySet<string>
  /** Compiled case-insensitive validation classifiers. */
  validationCommandPatterns: readonly RegExp[]
}

/** One call awaiting a durable result or turn closure. */
interface PendingCall {
  name: string
  startedAt: number
  /** Start-event seq of a retained validation, or null for an ordinary call. */
  validationSeq: number | null
  /** Whether rendered shell exit markers determine semantic failure. */
  commandAware: boolean
}

/** Persistable fold state; every field is plain JSON. */
interface MissionActivityState {
  capabilities: Record<string, MissionCapabilityUsage>
  validations: MissionValidation[]
  approvals: MissionApprovalSummary
  checklist: MissionActivityProjection['checklist']
  lastOutcome: MissionTurnOutcome | null
  pendingCalls: Record<string, PendingCall>
}

const capabilitySchema = z.object({
  name: z.string(),
  started: z.number().int().nonnegative(),
  settled: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  running: z.number().int().nonnegative(),
  lastUsedAt: z.number(),
}).strict()

const validationSchema = z.object({
  seq: z.number().int().nonnegative(),
  toolName: z.string(),
  command: z.string(),
  status: z.union([
    z.literal('running'),
    z.literal('passed'),
    z.literal('failed'),
    z.literal('interrupted'),
  ]),
  startedAt: z.number(),
  completedAt: z.number().optional(),
  durationMs: z.number().nonnegative().optional(),
}).strict()

const approvalSchema = z.object({
  asked: z.number().int().nonnegative(),
  allowed: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  unavailable: z.number().int().nonnegative(),
  lastDecisionAt: z.number().optional(),
}).strict()

const checklistSchema = z.object({
  todos: z.array(z.object({
    content: z.string(),
    status: z.union([z.literal('pending'), z.literal('in_progress'), z.literal('completed')]),
  }).strict()),
  updatedAt: z.number(),
}).strict()

const outcomeSchema = z.object({
  kind: z.union([
    z.literal('blocked'),
    z.literal('error'),
    z.literal('max-tokens'),
    z.literal('interrupted'),
    z.literal('aborted'),
  ]),
  time: z.number(),
  message: z.string().optional(),
  code: z.string().optional(),
}).strict()

const missionActivitySchema = z.object({
  capabilities: z.array(capabilitySchema),
  validations: z.array(validationSchema),
  approvals: approvalSchema,
  checklist: checklistSchema.nullable(),
  lastOutcome: outcomeSchema.nullable(),
}).strict() as z.ZodType<MissionActivityProjection>

/** Reject blank or duplicate exact configuration entries. */
function uniqueEntries(field: string, values: readonly string[]): string[] {
  const seen = new Set<string>()
  return values.map((value) => {
    if (value.length === 0 || value.trim() !== value) {
      throw new Error(`session-mission: ${field} entries must be non-blank and have no surrounding whitespace`)
    }
    if (seen.has(value)) {
      throw new Error(`session-mission: ${field} contains duplicate entry ${JSON.stringify(value)}`)
    }
    seen.add(value)
    return value
  })
}

/**
 * Validate regex sources and normalize configuration before registration.
 * @param config - schema-validated explicit plugin configuration.
 * @returns immutable lookup structures captured by the projection definition.
 */
export function resolveMissionConfig(config: Config): ResolvedMissionConfig {
  const tools = uniqueEntries('validationCommandTools', config.validationCommandTools)
  const sources = uniqueEntries('validationCommandPatterns', config.validationCommandPatterns)
  const patterns = sources.map((source) => {
    try {
      return new RegExp(source, 'i')
    } catch (cause) {
      throw new Error(
        `session-mission: validationCommandPatterns contains invalid regex ${JSON.stringify(source)}`,
        { cause },
      )
    }
  })
  return {
    maxRecentValidations: config.maxRecentValidations,
    validationCommandTools: new Set(tools),
    validationCommandPatterns: patterns,
  }
}

/** Read a string `command` own-property without widening trusted typed inputs. */
function commandOf(argumentsValue: unknown): string | null {
  if (typeof argumentsValue !== 'object' || argumentsValue === null || Array.isArray(argumentsValue)) return null
  if (!Object.hasOwn(argumentsValue, 'command')) return null
  const command = (argumentsValue as { command?: unknown }).command
  return typeof command === 'string' ? command : null
}

/** Parse model-emitted native tool JSON; malformed calls cannot be validations. */
function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    // JSON.parse is the only statement in the try; malformed model output is
    // already represented by the eventual tool result and is not rethrown by a projection.
    void error
    return null
  }
}

/** Join text blocks in the same order the shell renderer emitted them. */
function renderedText(content: readonly unknown[]): string {
  const parts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const candidate = block as { type?: unknown; text?: unknown }
    if (candidate.type === 'text' && typeof candidate.text === 'string') parts.push(candidate.text)
  }
  return parts.join('\n')
}

/** Interpret shell exit, timeout, and sandbox markers plus execution-layer failures. */
function callFailed(text: string, executionFailed: boolean, commandAware: boolean): boolean {
  if (executionFailed) return true
  if (!commandAware) return false
  const parsed = parseExitStatus(text)
  if ('signal' in parsed || parsed.exitCode !== 0) return true
  return /\[timed out after [^\]\n]+\]|\[sandbox:[^\]\n]+\]/.test(parsed.body)
}

/** Add one start to a capability row. */
function startCapability(
  capabilities: MissionActivityState['capabilities'],
  name: string,
  time: number,
): MissionActivityState['capabilities'] {
  const current = Object.hasOwn(capabilities, name) ? capabilities[name] : undefined
  return {
    ...capabilities,
    [name]: current === undefined
      ? { name, started: 1, settled: 0, failed: 0, running: 1, lastUsedAt: time }
      : { ...current, started: current.started + 1, running: current.running + 1, lastUsedAt: time },
  }
}

/** Settle one previously started capability row. */
function settleCapability(
  capabilities: MissionActivityState['capabilities'],
  name: string,
  failed: boolean,
): MissionActivityState['capabilities'] {
  const current = Object.hasOwn(capabilities, name) ? capabilities[name] : undefined
  if (current === undefined) return capabilities
  return {
    ...capabilities,
    [name]: {
      ...current,
      settled: current.settled + 1,
      failed: current.failed + (failed ? 1 : 0),
      running: Math.max(0, current.running - 1),
    },
  }
}

/** Opaque native and nested call ids occupy separate state namespaces. */
function pendingKey(kind: 'native' | 'nested', id: string): string {
  return `${kind}:${id}`
}

/** Remove one own pending entry. */
function withoutPending(pendingCalls: MissionActivityState['pendingCalls'], key: string):
MissionActivityState['pendingCalls'] {
  return Object.fromEntries(Object.entries(pendingCalls).filter(([candidate]) => candidate !== key))
}

/** Replace one retained running validation with its terminal status. */
function settleValidation(
  validations: readonly MissionValidation[],
  pending: PendingCall,
  status: Exclude<MissionValidation['status'], 'running'>,
  time: number,
): MissionValidation[] {
  if (pending.validationSeq === null) return validations as MissionValidation[]
  const index = validations.findIndex(validation => (
    validation.seq === pending.validationSeq && validation.status === 'running'
  ))
  if (index < 0) return validations as MissionValidation[]
  return validations.map((validation, candidate) => {
    if (candidate !== index) return validation
    return {
      ...validation,
      status,
      completedAt: time,
      durationMs: Math.max(0, time - pending.startedAt),
    }
  })
}

/** Normalize the latest known turn outcome; extension reasons are intentionally non-actionable here. */
function outcomeOf(event: SessionEvent<'turn/end'>): MissionTurnOutcome | null {
  const reason = event.data.reason
  switch (reason.kind) {
    case 'completed':
      return null
    case 'blocked':
      return { kind: 'blocked', time: event.time }
    case 'max-tokens':
      return { kind: 'max-tokens', time: event.time }
    case 'interrupted':
      return { kind: 'interrupted', time: event.time }
    case 'error':
      return { kind: 'error', time: event.time, message: reason.error.message, code: reason.error.code }
    case 'aborted':
      return reason.reason.kind === 'hook'
        ? { kind: 'aborted', time: event.time, message: reason.reason.reason, code: reason.reason.kind }
        : { kind: 'aborted', time: event.time, code: reason.reason.kind }
    default:
      // TurnEndReasonMap is merge-extensible. Unknown extension reasons clear a
      // prior built-in outcome rather than misclassifying extension behavior.
      return null
  }
}

/** Start one actual capability and optionally append a validation record. */
function startCall(
  state: MissionActivityState,
  config: ResolvedMissionConfig,
  key: string,
  name: string,
  argumentsValue: unknown,
  event: SessionEvent,
): MissionActivityState {
  const command = config.validationCommandTools.has(name) ? commandOf(argumentsValue) : null
  const isValidation = command !== null
    && config.validationCommandPatterns.some(pattern => pattern.test(command))
  const validation: MissionValidation | null = isValidation
    ? { seq: event.seq, toolName: name, command, status: 'running', startedAt: event.time }
    : null
  const validations = validation === null
    ? state.validations
    : [...state.validations, validation].slice(-config.maxRecentValidations)
  return {
    ...state,
    capabilities: startCapability(state.capabilities, name, event.time),
    validations,
    pendingCalls: {
      ...state.pendingCalls,
      [key]: {
        name,
        startedAt: event.time,
        validationSeq: validation?.seq ?? null,
        commandAware: command !== null,
      },
    },
  }
}

/** Settle one matched call; orphan results leave the fold untouched. */
function settleCall(
  state: MissionActivityState,
  key: string,
  text: string,
  executionFailed: boolean,
  time: number,
): MissionActivityState {
  const pending = Object.hasOwn(state.pendingCalls, key) ? state.pendingCalls[key] : undefined
  if (pending === undefined) return state
  const failed = callFailed(text, executionFailed, pending.commandAware)
  return {
    ...state,
    capabilities: settleCapability(state.capabilities, pending.name, failed),
    validations: settleValidation(state.validations, pending, failed ? 'failed' : 'passed', time),
    pendingCalls: withoutPending(state.pendingCalls, key),
  }
}

/** Close every call left open when its enclosing turn ends. */
function closePendingAtTurnEnd(state: MissionActivityState, time: number): Pick<
  MissionActivityState,
  'capabilities' | 'validations' | 'pendingCalls'
> {
  let capabilities = state.capabilities
  let validations = state.validations
  for (const pending of Object.values(state.pendingCalls)) {
    capabilities = settleCapability(capabilities, pending.name, true)
    validations = settleValidation(validations, pending, 'interrupted', time)
  }
  return { capabilities, validations, pendingCalls: {} }
}

/**
 * Create one definition with load-time-resolved deployment configuration.
 * @param config - validated command classification and retention configuration.
 * @returns the pure `missionActivity` projection definition.
 */
export function createMissionActivityProjection(
  config: ResolvedMissionConfig,
): ProjectionDefinition<'missionActivity', MissionActivityState> {
  return {
    key: 'missionActivity',
    schema: missionActivitySchema,
    init: () => ({
      capabilities: {},
      validations: [],
      approvals: { asked: 0, allowed: 0, rejected: 0, cancelled: 0, unavailable: 0 },
      checklist: null,
      lastOutcome: null,
      pendingCalls: {},
    }),
    apply: (state, event) => {
      switch (event.type) {
        case 'tool/call':
          if (event.data.name === RUN_CODE_NAME) return state
          return startCall(
            state,
            config,
            pendingKey('native', event.data.callId),
            event.data.name,
            parseArguments(event.data.arguments),
            event,
          )
        case 'tool/result':
          return settleCall(
            state,
            pendingKey('native', event.data.message.source.callId),
            renderedText(event.data.message.content),
            event.data.error !== undefined,
            event.time,
          )
        case 'tool/code-dispatch-start':
          return startCall(
            state,
            config,
            pendingKey('nested', event.data.subCallId),
            event.data.name,
            event.data.arguments,
            event,
          )
        case 'tool/code-dispatch':
          return settleCall(
            state,
            pendingKey('nested', event.data.subCallId),
            renderedText(event.data.content),
            event.data.isError,
            event.time,
          )
        case 'todo/write':
          return {
            ...state,
            checklist: {
              todos: event.data.todos.map(todo => ({ content: todo.content, status: todo.status })),
              updatedAt: event.time,
            },
          }
        case 'approval/asked':
          return { ...state, approvals: { ...state.approvals, asked: state.approvals.asked + 1 } }
        case 'approval/decided': {
          const approvals = { ...state.approvals, lastDecisionAt: event.time }
          switch (event.data.outcome) {
            case 'allowed-once': approvals.allowed += 1; break
            case 'rejected': approvals.rejected += 1; break
            case 'cancelled': approvals.cancelled += 1; break
            case 'unavailable': approvals.unavailable += 1; break
          }
          return { ...state, approvals }
        }
        case 'turn/end': {
          const nextOutcome = outcomeOf(event)
          if (Object.keys(state.pendingCalls).length === 0 && nextOutcome === state.lastOutcome) return state
          const closed = closePendingAtTurnEnd(state, event.time)
          return { ...state, ...closed, lastOutcome: nextOutcome }
        }
        default:
          return state
      }
    },
    view: state => ({
      capabilities: Object.values(state.capabilities).sort((left, right) => (
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0
      )),
      validations: state.validations,
      approvals: state.approvals,
      checklist: state.checklist,
      lastOutcome: state.lastOutcome,
    }),
    stateVersion: 1,
  }
}
