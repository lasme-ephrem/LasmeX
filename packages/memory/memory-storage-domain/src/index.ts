/**
 * Durable storage-domain provider for bounded, project-scoped memory.
 * @module lasmex-memory-storage-domain
 */

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import MemoryService, {
  MemoryId,
  type MemoryForgetRequest,
  type MemoryLimits,
  type MemoryListRequest,
  type MemoryReadRequest,
  type MemoryRecord,
  type MemorySaveRequest,
  type MemorySearchHit,
  type MemorySearchRequest,
  type MemorySummary,
  type ProjectMemoryScope,
} from 'lasmex-memory'
import type { KvTable } from 'lasmex-storage-domain'
import { projectMemoryDomainSpec } from './spec.ts'

export {
  memoryIdSchema,
  memoryRecordSchema,
  projectMemoryDomainSpec,
  projectMemoryScopeSchema,
} from './spec.ts'

/** Required storage and query bounds. */
export interface Config extends MemoryLimits {}

/** Loader validation for every deployment-varying bound. */
export const Config: s<Config> = s.object({
  maxRecordBytes: s.number().step(1).min(1).required(),
  maxQueryBytes: s.number().step(1).min(1).required(),
  maxResults: s.number().step(1).min(1).required(),
  previewBytes: s.number().step(1).min(1).required(),
  maxEntriesPerProject: s.number().step(1).min(1).required(),
})

/** Validate one positive integer because direct programmatic mounts bypass loader schemas. */
function positive(name: keyof Config, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`memory-storage-domain: ${name} must be a positive safe integer, got ${String(value)}`)
  }
  return value
}

/** Copy and freeze a record before it crosses the service boundary. */
function snapshotRecord(record: MemoryRecord): MemoryRecord {
  return Object.freeze({
    id: record.id,
    project: record.project,
    ...(record.title === undefined ? {} : { title: record.title }),
    content: record.content,
    tags: Object.freeze([...record.tags]),
    pinned: record.pinned,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })
}

/** Copy and freeze the content-free list form. */
function snapshotSummary(record: MemoryRecord): MemorySummary {
  return Object.freeze({
    id: record.id,
    project: record.project,
    ...(record.title === undefined ? {} : { title: record.title }),
    tags: Object.freeze([...record.tags]),
    pinned: record.pinned,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })
}

/** Return a valid Unicode prefix within one UTF-8 byte limit. */
function utf8Prefix(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value
  let result = ''
  let bytes = 0
  for (const point of value) {
    const pointBytes = Buffer.byteLength(point, 'utf8')
    if (bytes + pointBytes > maxBytes) break
    result += point
    bytes += pointBytes
  }
  return result
}

/** Deterministic newest-first ordering with an opaque-id tie break. */
function compareRecent(left: MemoryRecord, right: MemoryRecord): number {
  return right.updatedAt - left.updatedAt || left.id.localeCompare(right.id)
}

/** UTF-8 size of the complete durable JSON record. */
function recordBytes(record: MemoryRecord): number {
  return Buffer.byteLength(JSON.stringify(record), 'utf8')
}

/** Storage-domain implementation of the memory capability. */
export class StorageDomainMemoryService extends MemoryService {
  static inject = ['storageDomain']
  static Config = Config

  /** Effective immutable service limits. */
  readonly limits: MemoryLimits

  private table?: KvTable<MemoryId, MemoryRecord>
  private readonly operationTails = new Map<ProjectMemoryScope, Promise<void>>()
  private mutationAdmissionOpen = true

  /**
   * @param ctx - Host context carrying the storage-domain form.
   * @param config - Required complete storage and query limits.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'memory')
    this.limits = Object.freeze({
      maxRecordBytes: positive('maxRecordBytes', config.maxRecordBytes),
      maxQueryBytes: positive('maxQueryBytes', config.maxQueryBytes),
      maxResults: positive('maxResults', config.maxResults),
      previewBytes: positive('previewBytes', config.previewBytes),
      maxEntriesPerProject: positive('maxEntriesPerProject', config.maxEntriesPerProject),
    })
  }

  /** Open, validate, and own the project-memory storage domain. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(projectMemoryDomainSpec)
    const table = domain.table('memories')
    try {
      this.validateLoaded(table)
    } catch (error) {
      await domain.close()
      throw error
    }
    this.table = table
    this.ctx.effect(() => async () => {
      this.mutationAdmissionOpen = false
      await Promise.all(this.operationTails.values())
      await domain.close()
    }, 'memory-storage-domain.domainClose')
  }

  /** @inheritdoc */
  read(request: MemoryReadRequest): MemoryRecord | undefined {
    const record = this.requireTable().get(request.id)
    return record?.project === request.project ? snapshotRecord(record) : undefined
  }

  /** @inheritdoc */
  list(request: MemoryListRequest): readonly MemorySummary[] {
    const limit = this.resolveLimit(request.limit)
    return Object.freeze(this.records(request.project).slice(0, limit).map(snapshotSummary))
  }

  /** @inheritdoc */
  listPinned(request: MemoryListRequest): readonly MemoryRecord[] {
    const limit = this.resolveLimit(request.limit)
    return Object.freeze(this.records(request.project).filter(record => record.pinned).slice(0, limit).map(snapshotRecord))
  }

  /** @inheritdoc */
  search(request: MemorySearchRequest): readonly MemorySearchHit[] {
    const limit = this.resolveLimit(request.limit)
    const query = request.query.trim()
    if (query.length === 0) throw new TypeError('memory: search query must not be blank')
    const actualBytes = Buffer.byteLength(query, 'utf8')
    if (actualBytes > this.limits.maxQueryBytes) {
      throw new RangeError(`memory: search query is ${actualBytes} bytes; maximum is ${this.limits.maxQueryBytes}`)
    }
    const needle = query.toLowerCase()
    const hits = this.records(request.project)
      .filter((record) => {
        const haystack = [record.title ?? '', record.content, ...record.tags].join('\n').toLowerCase()
        return haystack.includes(needle)
      })
      .slice(0, limit)
      .map((record): MemorySearchHit => Object.freeze({
        ...snapshotSummary(record),
        preview: utf8Prefix(record.content, this.limits.previewBytes),
      }))
    return Object.freeze(hits)
  }

  /** @inheritdoc */
  save(request: MemorySaveRequest): Promise<MemoryRecord> {
    return this.enqueue(request.project, async () => {
      const table = this.requireTable()
      const existing = request.id === undefined ? undefined : table.get(request.id)
      if (request.id !== undefined && existing?.project !== request.project) {
        throw new Error(`memory: record '${request.id}' was not found in project '${request.project}'`)
      }
      if (request.id === undefined
        && this.records(request.project).length >= this.limits.maxEntriesPerProject) {
        throw new RangeError(
          `memory: project '${request.project}' already has the maximum ${this.limits.maxEntriesPerProject} records`,
        )
      }
      const content = request.content
      if (content.trim().length === 0) throw new TypeError('memory: content must not be blank')
      const title = request.title?.trim()
      if (request.title !== undefined && title?.length === 0) {
        throw new TypeError('memory: title must not be blank')
      }
      const tags = this.resolveTags(request.tags ?? [])
      const now = Date.now()
      const updatedAt = existing === undefined
        ? now
        : Math.max(now, existing.updatedAt + 1)
      if (!Number.isSafeInteger(updatedAt)) {
        throw new RangeError('memory: updatedAt exceeded the safe integer range')
      }
      const record = snapshotRecord({
        id: existing?.id ?? this.nextId(table),
        project: request.project,
        ...(title === undefined ? {} : { title }),
        content,
        tags,
        pinned: request.pinned ?? false,
        createdAt: existing?.createdAt ?? now,
        updatedAt,
      })
      const actualBytes = recordBytes(record)
      if (actualBytes > this.limits.maxRecordBytes) {
        throw new RangeError(`memory: complete record is ${actualBytes} bytes; maximum is ${this.limits.maxRecordBytes}`)
      }
      await table.put(record.id, record)
      return snapshotRecord(record)
    })
  }

  /** @inheritdoc */
  forget(request: MemoryForgetRequest): Promise<boolean> {
    return this.enqueue(request.project, async () => {
      const table = this.requireTable()
      const record = table.get(request.id)
      if (record?.project !== request.project) return false
      return table.delete(request.id)
    })
  }

  /** Validate active limits against every record already stored on disk. */
  private validateLoaded(table: KvTable<MemoryId, MemoryRecord>): void {
    const counts = new Map<ProjectMemoryScope, number>()
    for (const [, record] of table.entries()) {
      const actualBytes = recordBytes(record)
      if (actualBytes > this.limits.maxRecordBytes) {
        throw new RangeError(
          `memory-storage-domain: stored record '${record.id}' is ${actualBytes} bytes; configured maximum is ${this.limits.maxRecordBytes}`,
        )
      }
      const count = (counts.get(record.project) ?? 0) + 1
      if (count > this.limits.maxEntriesPerProject) {
        throw new RangeError(
          `memory-storage-domain: project '${record.project}' exceeds the configured ${this.limits.maxEntriesPerProject} records`,
        )
      }
      counts.set(record.project, count)
    }
  }

  /** Resolve one result count without silently clamping caller intent. */
  private resolveLimit(limit: number): number {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > this.limits.maxResults) {
      throw new RangeError(`memory: limit must be an integer from 1 to ${this.limits.maxResults}, got ${String(limit)}`)
    }
    return limit
  }

  /** Current records owned by one project, sorted deterministically. */
  private records(project: ProjectMemoryScope): MemoryRecord[] {
    return [...this.requireTable().entries()]
      .flatMap(([, record]) => record.project === project ? [record] : [])
      .sort(compareRecent)
  }

  /** Normalize, deduplicate, copy, and freeze tags. */
  private resolveTags(input: readonly string[]): readonly string[] {
    const tags: string[] = []
    const seen = new Set<string>()
    for (const raw of input) {
      const tag = raw.trim()
      if (tag.length === 0) throw new TypeError('memory: tags must not be blank')
      if (seen.has(tag)) continue
      seen.add(tag)
      tags.push(tag)
    }
    return Object.freeze(tags)
  }

  /** Allocate an unused UUID inside the current authoritative table. */
  private nextId(table: KvTable<MemoryId, MemoryRecord>): MemoryId {
    let id: MemoryId
    do id = MemoryId(randomUUID())
    while (table.get(id) !== undefined)
    return id
  }

  /** Serialize a complete project mutation, including its capacity check. */
  private enqueue<T>(project: ProjectMemoryScope, operation: () => Promise<T>): Promise<T> {
    if (!this.mutationAdmissionOpen) {
      return Promise.reject(new Error('memory-storage-domain: service is disposing'))
    }
    const previous = this.operationTails.get(project) ?? Promise.resolve()
    const result = previous.then(operation)
    const tail = result.then(() => undefined, () => undefined)
    this.operationTails.set(project, tail)
    return result.finally(() => {
      if (this.operationTails.get(project) === tail) this.operationTails.delete(project)
    })
  }

  /** Resolve the initialized durable table or fail a broken lifecycle. */
  private requireTable(): KvTable<MemoryId, MemoryRecord> {
    if (this.table === undefined) throw new Error('memory-storage-domain: durable domain is not initialized')
    return this.table
  }
}

export default StorageDomainMemoryService
