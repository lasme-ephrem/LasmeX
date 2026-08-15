/**
 * Service Definition for bounded, project-scoped long-term memory.
 * @module lasmex-memory
 */

import { isAbsolute, normalize } from 'node:path'
import { Service } from '@deepseek-ai/cordis'
import type { Branded } from 'lasmex-brand'

declare module '@deepseek-ai/cordis' {
  interface Context {
    memory: MemoryService
  }
}

/** Opaque identity of one durable memory. */
export type MemoryId = Branded<'MemoryId'>

/**
 * Brand a provider-created memory id.
 * @param value - Raw opaque id.
 * @returns the same value with the memory-id brand.
 */
export function MemoryId(value: string): MemoryId {
  return value as MemoryId
}

/** Normalized absolute working directory that owns a memory set. */
export type ProjectMemoryScope = Branded<'ProjectMemoryScope'>

/**
 * Derive the sole project-memory scope from an Agent session working directory.
 * @param cwd - Absolute working directory captured by the Session header.
 * @returns the platform-normalized absolute directory.
 */
export function projectMemoryScope(cwd: string): ProjectMemoryScope {
  if (cwd.length === 0 || !isAbsolute(cwd)) {
    throw new TypeError(`memory: project cwd must be an absolute path, got ${JSON.stringify(cwd)}`)
  }
  return normalize(cwd) as ProjectMemoryScope
}

/** Immutable durable memory record. */
export interface MemoryRecord {
  /** Provider-created opaque identity. */
  readonly id: MemoryId
  /** Normalized project directory that owns the record. */
  readonly project: ProjectMemoryScope
  /** Optional short label supplied by the caller. */
  readonly title?: string
  /** Complete user-authorized memory text. */
  readonly content: string
  /** Caller-supplied search labels. */
  readonly tags: readonly string[]
  /** Whether the Consumer may include this record in request context. */
  readonly pinned: boolean
  /** Creation time as Unix epoch milliseconds. */
  readonly createdAt: number
  /** Latest material update time as Unix epoch milliseconds. */
  readonly updatedAt: number
}

/** Bounded list item that omits full memory content. */
export interface MemorySummary extends Omit<MemoryRecord, 'content'> {}

/** Bounded search result with a provider-sized content preview. */
export interface MemorySearchHit extends MemorySummary {
  /** UTF-8-bounded leading content excerpt. */
  readonly preview: string
}

/** Provider limits visible to Consumers for early configuration validation. */
export interface MemoryLimits {
  /** Maximum UTF-8 bytes in a complete stored record. */
  readonly maxRecordBytes: number
  /** Maximum UTF-8 bytes in one search query. */
  readonly maxQueryBytes: number
  /** Maximum entries returned by list, pinned-list, or search. */
  readonly maxResults: number
  /** Maximum UTF-8 bytes in one search preview. */
  readonly previewBytes: number
  /** Maximum records owned by one project scope. */
  readonly maxEntriesPerProject: number
}

/** Read one record without crossing project ownership. */
export interface MemoryReadRequest {
  /** Owning project. */
  readonly project: ProjectMemoryScope
  /** Record identity. */
  readonly id: MemoryId
}

/** List recent project records. */
export interface MemoryListRequest {
  /** Owning project. */
  readonly project: ProjectMemoryScope
  /** Positive result count bounded by the provider. */
  readonly limit: number
}

/** Search memory text and metadata within one project. */
export interface MemorySearchRequest extends MemoryListRequest {
  /** Non-blank literal query. */
  readonly query: string
}

/** Create or replace one project record. */
export interface MemorySaveRequest {
  /** Owning project. */
  readonly project: ProjectMemoryScope
  /** Existing record to replace; omit to create. */
  readonly id?: MemoryId
  /** Optional non-blank label. */
  readonly title?: string
  /** Required non-blank durable text. */
  readonly content: string
  /** Optional labels; the provider trims and deduplicates them. */
  readonly tags?: readonly string[]
  /** Whether the Consumer may inject the record automatically. */
  readonly pinned?: boolean
}

/** Delete one record without crossing project ownership. */
export interface MemoryForgetRequest extends MemoryReadRequest {}

/**
 * Provider-independent long-term memory service. Providers own bounded reads,
 * search semantics, durable mutations, and record lifecycle.
 */
export abstract class MemoryService extends Service {
  /** Effective provider limits. */
  abstract readonly limits: MemoryLimits

  /**
   * Read a complete record in one project.
   * @param request - Project and record identity.
   * @returns an immutable record, or `undefined` when absent from that project.
   */
  abstract read(request: MemoryReadRequest): MemoryRecord | undefined

  /**
   * List recent summaries in one project.
   * @param request - Project and bounded result count.
   * @returns immutable summaries ordered newest first.
   */
  abstract list(request: MemoryListRequest): readonly MemorySummary[]

  /**
   * List recent pinned records in one project for bounded prompt assembly.
   * @param request - Project and bounded result count.
   * @returns immutable complete records ordered newest first.
   */
  abstract listPinned(request: MemoryListRequest): readonly MemoryRecord[]

  /**
   * Search one project's title, content, and tags.
   * @param request - Project, literal query, and bounded result count.
   * @returns immutable hits ordered newest first.
   */
  abstract search(request: MemorySearchRequest): readonly MemorySearchHit[]

  /**
   * Create or replace one project record.
   * @param request - Complete desired record fields.
   * @returns the immutable durable record after the write lands.
   */
  abstract save(request: MemorySaveRequest): Promise<MemoryRecord>

  /**
   * Delete one project record.
   * @param request - Project and record identity.
   * @returns `true` when a record was deleted, otherwise `false`.
   */
  abstract forget(request: MemoryForgetRequest): Promise<boolean>
}

export default MemoryService
