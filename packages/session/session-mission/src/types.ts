/**
 * Wire-safe mission activity types and the `missionActivity` projection key.
 *
 * @module lasmex-session-mission/types
 */

import type { TodoItem } from 'lasmex-session/types'

export type { TodoItem } from 'lasmex-session/types'

/** Aggregated lifecycle counters for one actual capability tool. */
export interface MissionCapabilityUsage {
  /** Tool name recorded by the durable call event. */
  name: string
  /** Calls whose execution started. */
  started: number
  /** Calls that produced a result or were closed as interrupted with their turn. */
  settled: number
  /** Settled calls carrying an execution, command, timeout, sandbox, or interruption failure. */
  failed: number
  /** Calls still open in the current turn. */
  running: number
  /** Timestamp of the latest start for this tool. */
  lastUsedAt: number
}

/** Lifecycle of one configured validation command. */
export type MissionValidationStatus = 'running' | 'passed' | 'failed' | 'interrupted'

/** One recent command whose tool and command text matched the validation configuration. */
export interface MissionValidation {
  /** Sequence number of the durable start event. */
  seq: number
  /** Tool that executed the command. */
  toolName: string
  /** Exact command recorded in the call arguments. */
  command: string
  /** Current or terminal validation status. */
  status: MissionValidationStatus
  /** Durable start-event timestamp. */
  startedAt: number
  /** Durable result or turn-end timestamp, once settled. */
  completedAt?: number
  /** Non-negative durable wall time, once settled. */
  durationMs?: number
}

/** Whole-session approval audit totals. */
export interface MissionApprovalSummary {
  /** Approval questions recorded. */
  asked: number
  /** One-shot grants recorded. */
  allowed: number
  /** Explicit rejections recorded. */
  rejected: number
  /** Withdrawn questions recorded. */
  cancelled: number
  /** Questions that failed closed without an answerer. */
  unavailable: number
  /** Timestamp of the latest decision, when one exists. */
  lastDecisionAt?: number
}

/** Latest complete todo snapshot and the event time that installed it. */
export interface MissionChecklist {
  /** Detached copy of the latest durable list. */
  todos: TodoItem[]
  /** Timestamp of the latest `todo/write`. */
  updatedAt: number
}

/** Known non-success reasons for the latest closed turn. */
export type MissionTurnOutcome = {
  /** Normalized actionable outcome category. */
  kind: 'blocked' | 'error' | 'max-tokens' | 'interrupted' | 'aborted'
  /** Timestamp of the closing `turn/end`. */
  time: number
  /** Human-readable provider or hook detail when the durable reason carries one. */
  message?: string
  /** Stable provider error code or cancellation-cause kind when available. */
  code?: string
}

/** Whole-log operational facts for a session mission dashboard. */
export interface MissionActivityProjection {
  /** Actual capability tools, sorted by name. */
  capabilities: MissionCapabilityUsage[]
  /** Recent configured validation commands, oldest to newest. */
  validations: MissionValidation[]
  /** Whole-session approval audit totals. */
  approvals: MissionApprovalSummary
  /** Latest todo snapshot, retained across turns, or null before the first write. */
  checklist: MissionChecklist | null
  /** Latest known non-success turn outcome; a completed or unknown extension reason clears it. */
  lastOutcome: MissionTurnOutcome | null
}

declare module 'lasmex-session-projection/types' {
  interface SessionProjectionMap {
    /** Whole-log mission activity; see {@link MissionActivityProjection}. */
    missionActivity: MissionActivityProjection
  }
}
