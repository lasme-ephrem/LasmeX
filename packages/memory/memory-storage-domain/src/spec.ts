/** Durable storage declaration for project memory. @module lasmex-memory-storage-domain/src/spec */

import { z } from 'zod'
import {
  MemoryId,
  projectMemoryScope,
  type MemoryRecord,
  type ProjectMemoryScope,
} from 'lasmex-memory'
import { defineDomain, domainTable } from 'lasmex-storage-domain'

const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

/** Runtime schema for opaque memory ids. */
export const memoryIdSchema = z.uuid().transform(MemoryId)

/** Runtime schema for normalized absolute project scopes. */
export const projectMemoryScopeSchema = z.string().refine((value) => {
  try {
    return projectMemoryScope(value) === value
  } catch {
    return false
  }
}, { message: 'project memory scope must be a normalized absolute path' })
  .transform(value => value as ProjectMemoryScope)

/** Runtime schema for one durable memory record. */
export const memoryRecordSchema = z.object({
  id: memoryIdSchema,
  project: projectMemoryScopeSchema,
  title: z.string().refine(value => value.length > 0 && value === value.trim(), {
    message: 'memory title must be non-empty and trimmed',
  }).optional(),
  content: z.string().refine(value => value.trim().length > 0, {
    message: 'memory content must contain a non-whitespace character',
  }),
  tags: z.array(z.string().refine(value => value.length > 0 && value === value.trim(), {
    message: 'memory tags must be non-empty and trimmed',
  })).refine(tags => new Set(tags).size === tags.length, {
    message: 'memory tags must be unique',
  }),
  pinned: z.boolean(),
  createdAt: nonNegativeSafeInteger,
  updatedAt: nonNegativeSafeInteger,
}).refine(record => record.updatedAt >= record.createdAt, {
  path: ['updatedAt'],
  message: 'memory updatedAt must not precede createdAt',
}) as unknown as z.ZodType<MemoryRecord>

/** One independently addressable record table. */
export const projectMemoryDomainSpec = defineDomain({
  name: 'project_memory',
  version: 0,
  tables: {
    memories: domainTable<MemoryId, MemoryRecord>(memoryRecordSchema),
  },
})
