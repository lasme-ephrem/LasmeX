# Projections de session

Le seam de projection de session est une [capacité seam](../capability-seams.md) par laquelle les plugins hôtes de domaine fournissent aux transports clients la valeur courante complète d’un état propre à chaque session et dérivé du journal. Il comprend la Service Definition et son registre ([lasmex-session-projection](../../packages/session/session-projection), `ctx.sessionProjections`), les contributeurs de domaine qui enregistrent chacun une unité pure et les transports — la page de fin d’historique de [lasmex-host-apiproxy](../../packages/host/apiproxy) et sa frame push `session/projection`. Il s’agit d’une capacité facultative unique, qui ne fait pas partie de la structure centrale de l’agent loop. Le framework pilote, le domaine calcule : le registre s’abonne une seule fois à `session/event` et replie chaque événement validé dans chaque unité ; les domaines ne conservent aucun abonnement et les clients ne replient jamais les événements de domaine, car ils reçoivent des valeurs achevées. Autorité de conception : [RFC sur les projections et le journal de commandes de session](../../.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md) ; règles de pilotage, cache et flux : [README du package](../../packages/session/session-projection/README.md).

Source : [`packages/session/session-projection/src/index.ts`](../../packages/session/session-projection/src/index.ts)

## L’unité

`SessionProjectionMap` est la table de types extensible par fusion pour toute la chaîne — unité hôte, bloc sur le fil et hook client. Ses valeurs sont des valeurs complètes encodables en JSON sur le fil ; le rendu appartient au système de slots, jamais à cette couche. Un domaine fournit une `ProjectionDefinition` par clé :

```ts type-equiv
/**
 * One domain's state-driven computation unit: three pure synchronous
 * functions plus declarations — never an opaque getter. The framework drives
 * `apply` on every committed session event; the domain holds no
 * subscriptions and owns only the mathematics. All three functions MUST be
 * synchronous (an async unit would tear the carriers' consistency cut) and
 * `state` MUST be plain JSON (the persisted-cache precondition).
 */
interface ProjectionDefinition<K extends keyof SessionProjectionMap, S> {
  /** The projection key this unit owns (its `SessionProjectionMap` entry). */
  key: K
  /** Validates the wire payload (`view` output) before it leaves the host. */
  schema: ZodType<SessionProjectionMap[K]>
  /**
   * State for the empty log.
   * @returns the initial state.
   */
  init(): S
  /**
   * Pure transition: previous state + one committed event → next state. A
   * unit uninterested in an event MUST return the same state reference — an
   * unchanged reference (`Object.is`) produces zero downstream work.
   * @param state - the state covering all prior events.
   * @param event - the next committed session event.
   * @returns the next state (same reference when the event is not the unit's).
   */
  apply(state: S, event: SessionEvent): S
  /**
   * State → wire payload (the read-side projection).
   * @param state - the current state.
   * @returns the whole current value for this unit's key.
   */
  view(state: S): SessionProjectionMap[K]
  /**
   * Persisted-cache invalidation version: bump whenever the serialized state fields or the
   * fold semantics change, so persisted `(sessionId, key, ver, seq, val)`
   * rows from an older unit are discarded instead of being forward-applied
   * into garbage. Non-negative integer.
   */
  stateVersion: number
}
```

La règle d’événement portant une valeur complète est essentielle : un événement de journal qui transporte un état contient l’état complet après modification, jamais un simple delta. Chaque transition reste ainsi peu coûteuse et chaque valeur servie se décrit elle-même ; pour les consommateurs, la dernière valeur gagne.

## Instantané et flux de changements

```ts type-equiv
/**
 * One consistent read cut over every registered unit for one session.
 * `asOfSeq` is the shared watermark — the seq of the last event every value
 * reflects (`-1` for an empty log, mirroring `session/subscribed.lastSeq`).
 */
interface ProjectionSnapshot {
  /** Seq of the last event the values reflect; -1 for an empty log. */
  asOfSeq: number
  /** Whole current value per registered key. */
  values: Partial<SessionProjectionMap>
}
```

```ts type-equiv
/**
 * Change-feed listener: one unit's value changed for one session. `value` is
 * the schema-validated `view` output; `seq` is the unit's watermark at
 * emission (the seq of the event that caused the change).
 */
type ProjectionChangeListener = (
  session: Session,
  key: Extract<keyof SessionProjectionMap, string>,
  value: unknown,
  seq: number,
) => void
```

`snapshot(session)` est entièrement synchrone : un transport le lit dans le même tick que sa tranche de page, afin que `asOfSeq` couvre les deux lectures à un même numéro de séquence. Chaque valeur passe par le schéma de son unité avant d’être renvoyée ; si un `view` devient asynchrone par erreur, il renvoie une Promise que la validation de schéma rejette. Le flux de changements s’exécute une fois par unité dont la *référence* d’état a changé pour chaque événement validé ; `apply` doit renvoyer la même référence lorsque son état n’a pas changé.

## Le registre : `ctx.sessionProjections`

`SessionProjectionRegistry` ([signatures](#ctxsessionprojections--sessionprojectionregistry)) possède le pilotage : un abonnement à `session/event`, un `apply` immédiat de chaque unité enregistrée et des cellules de watermark propres à chaque unité et session. Les cellules sont construites à la demande : lorsqu’une unité est enregistrée après le passage d’événements, ou que la session est antérieure au registre, le premier accès — événement ou lecture — replie `init` sur le journal en mémoire. L’enregistrement est un effet dont le disposer suit la fiber appelante. La clé d’un plugin de domaine déchargé, avec ses cellules en cache, disparaît des pilotages et instantanés suivants ; les clients interprètent cette absence comme celle de la capacité. Les clés en double lèvent une erreur. Les plugins de domaine s’enregistrent sous `ctx.inject(['sessionProjections'], …)`, afin que les assemblages headless sans registre ne soient pas affectés.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Cette section est générée depuis le code source par `scripts/gen-cordis-catalog.ts` ; `pnpm run verify-cordis-catalog` vérifie sa fraîcheur dans doc-sync et `pnpm run gen-cordis-catalog` la régénère. Les blocs de signatures utilisent une fence `ts cordis-catalog` et conservent le JSDoc original. Les modes de distribution sont définis dans le [primer](../cordis-primer.md#dispatch-modes), tandis que l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessionprojectioncache--sessionprojectioncache"></a>

### `ctx.sessionProjectionCache` — `SessionProjectionCache`

Le service de cache persistant des projections. Il ouvre le domaine `session_projcache` à l’initialisation, crée des points de contrôle des sessions actives au moyen d’une écriture différée limitée — déclencheurs de nombre et d’intervalle issus de Config — ainsi qu’à deux moments obligatoires : `turn/end` et la libération de la session, qui correspond au passage de l’état actif à l’état froid. Il sert aussi l’échelle de lecture à froid : ligne en cache, fin de journal fournie par `readFrom` du service de persistance, `restore` du registre, puis réécriture durable. Toute écriture durable est tolérante aux erreurs : un échec consigne un avertissement et le cache se répare à l’écriture ou lecture à froid suivante.

```ts cordis-catalog
/**
 * The zero-I/O listing read: whole values viewed straight from the stored
 * rows (version-matching keys only), each cut carried with its watermark
 * so a client value store can seed under its higher-seq-wins rule — as
 * stale as the last durable checkpoint but never wrong, and never from an
 * unrelated log (the caller's header is the identity witness). Fresher
 * paths (the history tail baseline, {@link coldSnapshot}) supersede these
 * values whenever a session is actually opened.
 * @param meta - the listed session's header (identity witness; no log read).
 * @returns the cut (`asOfSeq` = lowest served-row watermark), or
 *   `undefined` when no usable row exists for this lifecycle.
 */
cachedSnapshot(meta: SessionHeader): ProjectionSnapshot | undefined

/**
 * Durably checkpoint one live session NOW (both mandatory points call
 * this; tests and carriers may too). The registry cut is snapshotted at
 * this boundary (states are live references), then the whole record is
 * replaced. NOT fail-soft — callers on the fail-soft paths contain it.
 * @param session - the live session to checkpoint.
 * @returns resolution after durability and event emission.
 */
async write(session: Session): Promise<void>

/**
 * Cold-read one persisted session's projections with zero full-log load:
 * cached rows + a persistence `readFrom` tail from the registry's restore
 * floor, refolded by the registry and written back (fail-soft) so the next
 * cold read starts closer. A cache row invalidated by a shrunk log
 * (crash-repair truncation) triggers one full re-read from seq 0 — the
 * ladder's slow rung, still no crash. Rejects when the session has no
 * persisted log (`not found` from the persistence seam).
 * @param id - the persisted session to read.
 * @param signal - optional cancellation for the persistence reads.
 * @returns the snapshot cut at the stored log end.
 */
async coldSnapshot(id: SessionId, signal?: AbortSignal): Promise<ProjectionSnapshot>
```

Types : [Session](session.md) · [SessionHeader](persistence.md) · [SessionId](core.md)

Source : [`packages/session/session-projection-cache/src/index.ts:71`](../../packages/session/session-projection-cache/src/index.ts)

<a id="ctxsessionprojections--sessionprojectionregistry"></a>

### `ctx.sessionProjections` — `SessionProjectionRegistry`

`ctx.sessionProjections` désigne la table des unités de projection et son pilotage. Le service s’abonne une fois à `session/event` ; chaque événement validé passe par le `apply` de chaque unité enregistrée — pilotage immédiat — et une référence d’état modifiée notifie le flux de changements avec la vue validée par le schéma. Les cellules sont construites à la demande : lorsqu’une unité est enregistrée après le passage d’événements ou que la session est antérieure au registre, le premier accès, événement ou lecture, replie `init` sur le journal en mémoire. L’enregistrement est un effet dont le disposer suit la fiber appelante : la clé d’un plugin de domaine déchargé disparaît des instantanés et les clients interprètent cette absence comme celle de la capacité. Les plugins de domaine s’enregistrent sous `ctx.inject(['sessionProjections'], …)`, afin que les assemblages headless sans registre ne soient pas affectés. Les inscrits qui partagent une clé partagent aussi une unité et sont comptés : un même package d’outil monté dans N préréglages d’agent s’enregistre N fois, et la clé survit jusqu’au déchargement du dernier.

```ts cordis-catalog
/**
 * Register one domain's unit. The registration is an effect on the calling
 * context's fiber: disposing the fiber (or calling the returned disposer)
 * removes the key — and the unit's cached cells — from subsequent drives
 * and snapshots.
 * @param definition - key, state schema, pure unit functions, and stateVersion.
 * @returns the exact disposer that unregisters this unit.
 */
register<K extends keyof SessionProjectionMap, S>(definition: ProjectionDefinition<K, S>): () => void

/**
 * Subscribe to the change feed. The registration is an effect on the
 * calling context's fiber.
 * @param listener - called once per unit whose state reference changed, per committed event.
 * @returns the exact disposer that unsubscribes.
 */
onChanged(listener: ProjectionChangeListener): () => void

/**
 * One consistent cut over every registered unit for one session, read from
 * the watermark cache (missing cells fold lazily over the in-memory log).
 * Fully synchronous — every value and `asOfSeq` reflect the same log
 * position. Each value passes its unit's schema before leaving.
 * @param session - the session whose projection values are read.
 * @returns the snapshot; `values` is empty when no unit is registered.
 */
snapshot(session: Session): ProjectionSnapshot

/**
 * State-level checkpoint of every registered unit for one session, read
 * from the watermark cache (missing cells fold lazily over the in-memory
 * log). This is the write side of the persisted projection cache: the
 * returned rows are the `(key → {ver, seq, val})` part of the durable
 * `(sessionId, key, ver, seq, val)`
 * rows. Every `val` is a DETACHED structured clone — never the live
 * cell reference: the watermark cache is this registry's authoritative
 * mutable state, and a caller reaching the live reference could corrupt
 * every subsequent snapshot and frame through it (plain JSON by the unit
 * contract, so the clone is total).
 * @param session - the session whose unit states are checkpointed.
 * @returns one row per registered key; empty when no unit is registered.
 */
checkpoint(session: Session): ProjectionCheckpoint

/**
 * The stored seq a {@link restore} tail read over `checkpoint` must start
 * at: one event BELOW the lowest usable watermark (a row is usable when
 * its `ver` matches the live unit's `stateVersion`; an absent or mismatched row
 * pulls the floor to `0` — that key must refold the full log). The
 * one-below anchor is load-bearing: the tail then proves how far the
 * stored log still extends, so {@link restore} can detect a log that
 * shrank below a row's watermark (crash-repair truncation) instead of
 * serving the stale row as current — an empty tail read from the anchor
 * yields an end below every watermark and the restore rejects for a full
 * re-read.
 * @param checkpoint - persisted rows for one session (possibly stale or empty).
 * @returns the seq to hand the persistence `readFrom`, or `undefined`
 *   when no unit is registered (no read needed — {@link restore} would
 *   serve empty values regardless).
 */
restoreFloor(checkpoint: ProjectionCheckpoint): number | undefined

/**
 * View a checkpoint's rows without any log read: for every registered
 * unit whose row's `ver` matches, serve the schema-validated
 * `view` of the stored state; mismatched or absent rows leave their key
 * absent (a cold or listing consumer treats it as not-yet-available and a
 * fuller read path refolds it). The zero-I/O rung of the read ladder —
 * values are as stale as their rows, never wrong.
 * @param checkpoint - persisted rows for one session (possibly stale or empty).
 * @returns whole values per key with a usable row; empty when none.
 */
viewCheckpoint(checkpoint: ProjectionCheckpoint): Partial<SessionProjectionMap>

/**
 * Cold read: fold every registered unit over a stored log suffix, seeding
 * each from its checkpoint row when usable — the one read recipe (cached
 * state + forward tail replay + `view`) applied without a live `Session`.
 * Call with the events returned by a persistence
 * `readFrom(id, restoreFloor(checkpoint))` and that same floor as
 * `baseSeq`; the floor's one-below anchor makes the supplied end honest,
 * so a shrunk log is detected here. A row is usable iff its
 * `ver` matches the live unit's `stateVersion`, it does not predate `baseSeq`
 * (`seq >= baseSeq - 1`), and it does not claim events past the
 * supplied end (`seq <= endSeq`); an unusable row is discarded
 * and its key refolds from `init` — which is only sound over the full
 * log, so a discarded row with `baseSeq > 0` throws (the caller re-reads
 * from seq 0, e.g. after a crash-repair truncation shrank the log below
 * a row's watermark).
 * @param checkpoint - persisted rows for one session (possibly stale or empty).
 * @param events - the stored events with `seq >= baseSeq`, in seq order.
 * @param baseSeq - the seq `events` starts at (its first event's seq when non-empty).
 * @returns the snapshot cut at the supplied log end (`asOfSeq` is the last
 *   supplied event's seq, `baseSeq - 1` for an empty tail) plus the
 *   refreshed checkpoint rows at that cut, ready for a durable write-back.
 */
restore(checkpoint: ProjectionCheckpoint, events: readonly SessionEvent[], baseSeq: number): { snapshot: ProjectionSnapshot; checkpoint: ProjectionCheckpoint }
```

Types : [Session](session.md) · [SessionEvent](session.md)

Source : [`packages/session/session-projection/src/index.ts:171`](../../packages/session/session-projection/src/index.ts)
<!-- END GENERATED cordis-surface -->
