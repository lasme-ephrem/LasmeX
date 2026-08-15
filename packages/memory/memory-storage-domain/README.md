# lasmex-memory-storage-domain

English | [中文](README.zh.md)

Durable provider for `ctx.memory` over `lasmex-storage-domain`. It stores one immutable record per `MemoryId` in the versioned `project_memory` domain and keeps synchronous reads backed by storage-domain's authoritative in-memory view.

## Configuration

Every field is required; changing a deployment must be deliberate.

| key | meaning |
| --- | --- |
| `maxRecordBytes` | Maximum UTF-8 bytes in the complete serialized record, including metadata. |
| `maxQueryBytes` | Maximum UTF-8 bytes in one trimmed literal query. |
| `maxResults` | Maximum records returned by list, pinned-list, or search. |
| `previewBytes` | Maximum UTF-8 bytes in one search content preview. |
| `maxEntriesPerProject` | Maximum durable records owned by one normalized project scope. |

The provider checks stored records against the active record and project-capacity limits when the domain opens. A deployment cannot silently reopen data under tighter contradictory limits.

## Semantics

Reads never cross `record.project`. List, pinned-list, and search order by `updatedAt` descending with `MemoryId` as a deterministic tie break. Search is case-insensitive literal substring matching across title, content, and tags. UTF-8 previews stop at complete Unicode code points.

Creates and replacements store the complete desired record. Content must contain a non-whitespace character; titles are trimmed and must remain non-blank; tags are trimmed and deduplicated. A per-project mutation chain encloses the capacity check and durable write, so concurrent creates in one process cannot exceed the configured cap.

## Model Experience

### Durable provider records

#### What the model sees

Nothing directly. This provider registers no prompt, context, or tool. It returns immutable records to `ctx.memory` Consumers, which own any model-visible projection.

#### Token effect

Zero from this package alone. Stored bytes are not model tokens until a Consumer renders them.

#### KV Cache effect

Independent. Durable reads and writes do not alter request prefixes.

## Known Limitations and Deferred Work

- **One-process mutation serialization** — storage-domain provides one writer chain per open domain, and this provider adds per-project admission. It does not provide compare-and-swap across several LasmeX processes sharing an external medium.
- **Linear in-memory search** — the first provider intentionally offers deterministic literal matching without secondary indexes, ranking, embeddings, or semantic retrieval.
- **No migrations before release** — the domain format is version `0`; incompatible stored records fail at open.
