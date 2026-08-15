# Persistance des sessions

Cette page décrit la **capacité de durabilité** du journal d’événements. [session.md](session.md) présente la `Session` en mémoire, c’est-à-dire le journal de `SessionEvent` en ajout seul qui fait autorité. La présente page explique comment ce journal devient durable : service abstrait `SessionPersistence`, moteurs de stockage, point de contrôle de vidage, récupération après incident et en-tête de métadonnées conservé aux côtés du journal. Le vocabulaire des événements transportés par le journal est énuméré membre par membre dans le [catalogue généré des événements de persistance](../persistence-catalog.md).

Il s’agit d’une [capacité complète](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md) : un service abstrait ([lasmex-session-persistence](../../packages/session/session-persistence), `ctx.sessionPersistence`) définit la localisation, la création et l’ajout, la préparation réutilisable d’une Session, le chargement et l’inspection logiques, la lecture physique d’un suffixe et l’observation légère par liste ou instantané à partir du `SessionEvent` existant — **sans type d’événement persistant parallèle**. Deux moteurs interchangeables appliquent ce même contrat. Consultez l’[Agent Note sur la persistance des sessions](../../.agents/notes/implemented/architecture/2026-06-14-session-persistence.md).

## Point de contrôle du vidage

`session/event` est une notification *synchrone* : les plugins de persistance copient l’événement dans un contrôleur propre à la session sans bloquer le producteur. Le premier événement en attente démarre une fenêtre de regroupement fixe ; les événements suivants la rejoignent sans repousser son échéance. À l’expiration, un lot durable démarre. Les événements admis pendant cette écriture obtiennent leur propre échéance et forment le lot suivant. `session/flush` annule l’attente puis vide la file jusqu’au repos ; la boucle continue donc de l’utiliser comme point de contrôle d’ordre et d’observation des erreurs avant de revendiquer le prochain tour ordinaire. Lorsqu’une écriture en arrière-plan échoue, elle conserve ses événements et suspend les nouvelles tentatives automatiques. Un nouvel événement ouvre une nouvelle fenêtre, tandis qu’un vidage explicite réessaie immédiatement et signale l’échec par `agent/error` et le journaliseur, jamais par un événement de session ajouté après la fermeture du tour. La libération effectue le même vidage final. Le maximum configuré ne borne que l’attente intentionnelle du regroupement, et non la planification de la boucle d’événements ni la latence de durabilité du moteur ([décision](../../.agents/notes/implemented/architecture/2026-08-08-bounded-session-persistence-write-batching.md)).

## La récupération après incident préserve un tour interrompu

Lorsqu’un moteur recharge un journal interrompu en plein tour, il trouve un `turn/start` ouvert sans `turn/end`. Il ne le tronque **pas** : dans une tâche de longue durée, un seul tour peut être très volumineux, avec de nombreuses étapes et d’importantes sorties d’outils, et ces événements ont été enregistrés durablement avant l’incident. Le moteur ferme plutôt le tour orphelin avec un événement synthétique `turn/end { reason: { kind: 'interrupted' } }`. L’exécution interrompue reste ainsi équilibrée sans modifier les événements autonomes placés avant ou après. `interrupted` est le seul `TurnEndReason` qu’aucune boucle n’émet ; voir [session.md](session.md#why-a-turn-ended-turnendreasonmap).

Cette réparation ne s’applique qu’aux sessions inactives. Pour un identifiant actif, `SessionPersistence.load(id)` attend que l’instantané en mémoire faisant autorité soit durable et ne le renvoie que s’il est équilibré ; un tour actif ouvert provoque une erreur au lieu de recevoir des limites synthétiques d’interruption. Lors d’un rechargement à chaud, le préfixe actif est repris sans fermer son tour en cours.

`SessionPersistence.inspect(id)` construit une Session logique immuable sans la publier ni écrire la récupération. L’inspection à froid équilibre en mémoire un tour interrompu tout en laissant intactes les fins physiques déchirées ; l’inspection d’une Session déjà active emprunte son instantané immuable courant, qui peut donc contenir un tour ouvert. Les implémentations coordonnées conservent l’exacte Session froide non publiée dans un cache LRU borné : les lectures répétées de l’historique et un appel ultérieur à `prepare(id)` partagent ainsi une seule lecture, décompression, validation, congélation et construction de Session. `prepare(id)` réserve la Session, valide la réparation en attente et renvoie une référence de publication libérable ; `load(id)` utilise le même mécanisme pour valider la réparation sans publier. La [décision sur la préparation des sessions](../../.agents/notes/implemented/architecture/2026-08-05-session-preparation.md) définit ce cycle de vie.

## `SessionLocation` — cible d’artefact facultative propre à la session

`SessionPersistence.locate(meta)` résout de manière synchrone un artefact indépendant appartenant au moteur, sans le lire, le créer ni le vider. JSONL renvoie le chemin absolu de la transcription dans son répertoire de projet et de session ; SQLite renvoie `undefined` puisque les sessions partagent une base unique. Le chemin renvoyé peut donc désigner un fichier qui n’existe pas encore ou qui ne contient pas le tour courant non vidé. Il s’agit d’une indication d’emplacement, et non d’une autorisation ou d’une garantie d’actualité.

```ts type-equiv
/**
 * A backend-resolved, per-session local artifact location. The path is an
 * absolute target path and can name an artifact that has not materialized yet.
 * Consumers must treat it as a location hint, never as an authorization token.
 */
interface SessionLocation {
  /** Backend-specific artifact kind, for example `jsonl`. */
  readonly kind: string
  /** Absolute path to this session's backend-owned artifact. */
  readonly path: string
}
```

<a id="sessionheader--metadata-beside-the-log"></a>

## `SessionHeader` — métadonnées conservées à côté du journal

Les métadonnées propres à la session circulent **séparément** du journal d’événements : version du format, répertoire courant, lignée et limite de l’amorce relèvent du stockage et non des événements de conversation. Elles restent donc hors de `SessionEventMap` et n’atteignent jamais `deriveMessages()`. L’en-tête est rattaché à une `Session` par `session.header`.

Source : [`packages/core/session/src/types.ts`](../../packages/core/session/src/types.ts)

```ts type-equiv
/**
 * Immutable validated storage metadata, kept outside the conversation event log.
 */
interface SessionHeader {
  /**
   * On-disk format version, stamped from {@link SESSION_FORMAT_VERSION} when the
   * session is created. A persistence backend rejects any other version on load
   * (no migration — see the constant).
   */
  readonly version: number
  /** The session's id (mirrors the {@link Session}'s id). */
  readonly id: SessionId
  /** Non-negative safe-integer Unix epoch milliseconds when the session was created. */
  readonly createdAt: number
  /** Absolute working directory the session was created in (if any). */
  readonly cwd?: string
  /** The session this one was forked from (seed lineage), if any. */
  readonly parentSession?: SessionId
  /**
   * How many leading events were inherited through a seed. Persisting this
   * boundary lets resume and replay distinguish parent history from child work.
   */
  readonly seedLength?: number
  /**
   * Coarse product classification for a session created as a subagent child.
   * This is presentation metadata, not proof that the child is continuable.
   */
  readonly origin?: 'subagent'
  /**
   * Delegation depth: absent (zero) for a top-level session, parent depth + 1
   * for a subagent child. Persisted so a recursion budget survives restart and
   * resume — a runtime-only depth would reset a resumed child to top-level.
   */
  readonly delegationDepth?: number
  /**
   * Id of the agent preset this session's agent was composed from, when the
   * deployment composes per session. Durable because the preset decides the
   * session's tools and prompt: a resume that restored a different composition
   * would replay history the model can no longer act on.
   */
  readonly agentPreset?: string
}
```

## Refus de format — journaux qu’une version ne peut pas lire fidèlement

Un moteur refuse avec `SessionFormatUnsupportedError` un journal qu’il ne peut pas interpréter fidèlement. Cette erreur se distingue de `SessionPersistenceCorruptionError`, car aucune donnée n’est endommagée. Si la `version` d’un en-tête dépasse `SESSION_FORMAT_VERSION`, le message indique la direction à suivre — « écrit par un harness plus récent, mettez le harness à niveau pour l’ouvrir ». Si elle est inférieure, il précise que cette version ne fournit aucun parcours de mise à niveau. Après normalisation des anciennes formes, un type d’événement absent du vocabulaire généré de cette version (`KNOWN_SESSION_EVENT_TYPES`, produit par `gen-persistence-catalog`) entraîne le même refus, sauf si l’enveloppe de l’événement porte `ignorable: true`. Ignorer silencieusement un événement requis mais inconnu pourrait modifier la manière dont le reste du journal doit être interprété. Le message ajoute le chemin brut du journal lorsqu’un moteur conserve un artefact par session, afin que le texte refusé reste accessible. Le moteur JSONL refuse une version étrangère dès la ligne brute de l’en-tête, avant de valider la forme actuelle de celui-ci ou de décoder un événement : un format futur structurellement différent indique donc toujours la mise à niveau nécessaire et n’est jamais qualifié de corrompu. SQLite contrôle d’abord la structure de tout le fichier par son propre pragma `SCHEMA_VERSION`. La justification et la chaîne de mises à niveau différée figurent dans l’[Agent Note sur le mécanisme de version du journal de session](../../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.md).

## `CreateSessionOptions` — amorce et métadonnées

La création d’une `Session` par le magasin accepte une `seed`, c’est-à-dire l’historique initial à rejouer ou à brancher, et des `meta`, les champs de stockage que le magasin agrège dans un `SessionHeader`. Le magasin renseigne `version`/`id` et fournit une valeur par défaut à `createdAt`. L’appelant peut fournir le `cwd` absolu validé, la lignée `parentSession`, la limite d’amorce `seedLength`, la catégorie facultative `origin`, la profondeur `delegationDepth`, l’`agentPreset` utilisé pour composer l’agent et une valeur `createdAt` existante. `origin: 'subagent'` permet à la navigation du produit de masquer les lignes d’enfants en double ; cette valeur ne prouve ni la validité d’un descripteur ni la possibilité de reprendre l’enfant.

```ts type-equiv
/**
 * Options for creating a {@link Session} via the store. `seed` replays/forks
 * an existing event log; `meta` carries the caller-supplied storage fields the
 * store folds into a {@link SessionHeader}.
 */
interface CreateSessionOptions {
  /** Initial replay or fork history supplied at construction. */
  readonly seed?: readonly SessionEvent[]
  /**
   * Storage metadata read once before publication. `seedLength` is explicit
   * because a resumed seed contains the full stored log, not only its inherited prefix.
   */
  readonly meta?: {
    readonly cwd?: string
    readonly parentSession?: SessionId
    readonly createdAt?: number
    readonly seedLength?: number
    readonly origin?: 'subagent'
    readonly delegationDepth?: number
    readonly agentPreset?: string
  }
}
```

Le rejeu ou la création d’une branche s’effectue donc avec `ctx.sessions.create(id, { seed: seedEvents })`; la reprise d’une session *persistée* dans un agent actif utilise `ctx.agents.resume({ resumeSessionId })`.

## `SessionRawArtifact` — texte exact de l’artefact stocké

Ce type contient le texte de l’artefact propre au moteur pour une session, identique octet par octet à ce qui a été écrit durablement une fois son encodage physique décodé. `readRaw` le renvoie sans le reconstruire à partir des événements analysés ; la sérialisation propre au moteur — regroupement des fragments, ordre des clés, sauts de ligne — est donc préservée. Les consommateurs consultent d’abord `supportsRawArtifacts`: la valeur `false` signifie que le moteur ne fournit pas cette capacité, par exemple SQLite, tandis que `readRaw(...) === undefined` signifie qu’un moteur compatible ne possède aucun artefact matérialisé pour cette session.

```ts type-equiv
/** A backend's own raw artifact text for one session, verbatim. */
interface SessionRawArtifact {
  /** The session header parsed from the artifact's own first line. */
  readonly meta: SessionHeader
  /** The artifact's base filename on disk, without any physical encoding suffix. */
  readonly filename: string
  /** The artifact's full text content, decoded from the backend's physical encoding. */
  readonly content: string
}
```

## Propriété de la préparation et de la restauration

`SessionStore.prepare()` accepte les options de création ordinaires ou des graphes de persistance neufs transférés par `RestoredSessionOptions`. La branche de restauration valide et fige sur place l’en-tête et les événements transférés ; les appelants ne doivent donc conserver aucun alias mutable. `SessionPreparation` possède ensuite l’exacte Session non publiée jusqu’à sa publication ou son annulation ; sa libération est synchrone et idempotente. L’inspection de la persistance n’expose que `SessionInspection`, une vue logique immuable empruntée à la même Session préparée.

```ts type-equiv
/**
 * Fresh storage values transferred to {@link SessionStore.prepare} without a
 * second serialization copy. Callers retain no mutable aliases.
 */
interface RestoredSessionOptions {
  /** Fresh detached storage events to validate and freeze in place. */
  readonly seed: SessionEvent[]
  /** Fresh detached storage metadata to validate and freeze in place. */
  readonly meta: SessionHeader
  /** Select the persistence ownership-transfer path. */
  readonly seedSource: 'persistence'
}
```

```ts type-equiv
/** Inputs accepted while constructing an unpublished Session. */
type PrepareSessionOptions =
  | (CreateSessionOptions & { readonly seedSource?: undefined })
  | RestoredSessionOptions
```

```ts type-equiv
/** Options for a preparation whose provider retains unpublished state. */
interface SessionPreparationOptions {
  /** Release provider-owned state when the Session was not published. */
  readonly release?: () => void
}
```

```ts public-api
/**
 * One exact unpublished Session and the provider state that keeps it usable.
 * Disposal is synchronous and idempotent. Providers decide whether release
 * returns the Session to a cache or discards it; publication may consume that
 * state before disposal, making the callback a no-op.
 */
declare class SessionPreparation implements Disposable {
  /** The exact Session to use for setup and publication. */
  readonly session: Session;
  /**
   * Wrap an unpublished Session in one preparation lifetime.
   * @param session - exact unpublished Session.
   * @param options - optional provider release behavior.
   * @returns a preparation disposed after publication or rollback.
   */
  static create(session: Session, options?: SessionPreparationOptions): SessionPreparation;
  /** Release provider state once when this preparation leaves its caller. */
  [Symbol.dispose](): void;
}
```

```ts type-equiv
/** Immutable logical session prepared from persistence or a live owner. */
interface SessionInspection {
  /** Validated immutable session metadata. */
  readonly meta: SessionHeader
  /** Validated contiguous logical event log. */
  readonly events: readonly SessionEvent[]
}
```

## Révisions légères des sources

Les consommateurs d’un état dérivé comparent une révision opaque et peu coûteuse avant de charger un journal d’événements complet. Le moteur de persistance possède sa représentation et la modifie dans la même transaction qu’un ajout ou qu’une réparation mutante au chargement ; les appelants la comparent uniquement par égalité.

```ts type-equiv
/**
 * Backend-owned token that identifies both one storage source and one revision
 * of a persisted session log.
 */
type SessionPersistenceRevision = Branded<'SessionPersistenceRevision'>
```

```ts type-equiv
/** Lightweight immutable source identity returned without loading a full log. */
interface SessionPersistenceSnapshot {
  /** Detached metadata for one materialized session. */
  header: SessionHeader
  /** Opaque source-qualified token that changes whenever this stored log changes. */
  revision: SessionPersistenceRevision
}
```

## Moteurs de stockage

Les deux implémentent le même service abstrait `SessionPersistence` — localisation, création, ajout, préparation, chargement, inspection, lecture à partir d’un rang, liste et instantanés de liste sur `SessionEvent`, avec annulation facultative pour les méthodes d’observation — et passent la suite partagée `runPersistenceContract` :

- **[lasmex-session-persistence-jsonl](../../packages/session/session-persistence-jsonl)** — un journal JSONL logique en ajout seul par session, enregistré par défaut sous forme de trames Zstandard concaténées et munies de sommes de contrôle, ou sous forme de lignes brutes selon la configuration, avec écritures atomiques résistantes aux incidents, récupération des tours interrompus et parcours de lecture ou de rejeu.
- **[lasmex-session-persistence-sqlite](../../packages/session/session-persistence-sqlite)** — `node:sqlite`, avec une ligne par `SessionEvent`. Les champs de ligne `(session_id, seq, type, time, data, source_event_seqs, surface_op)` correspondent exactement à l’événement, y compris ses métadonnées de surface facultatives ; aucun schéma persistant parallèle ne doit donc rester synchronisé.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessionpersistence--sessionpersistence-abstract-seam"></a>

### `ctx.sessionPersistence` — `SessionPersistence` (abstract seam)

Durable append-only session storage. Implementations preserve contiguous, losslessly JSON-serializable events; append resolves only after durability, and load balances a complete interrupted tail without rewriting committed events.

```ts cordis-catalog
/**
 * Resolve this backend's independent local artifact for a session without
 * reading, creating, flushing, or otherwise materializing it. Backends such
 * as SQLite that do not own one artifact per session return `undefined`.
 * @param meta - the immutable session header whose artifact is requested.
 * @returns the backend-specific absolute location, when one exists.
 */
abstract locate(meta: SessionHeader): SessionLocation | undefined

/**
 * Read a session's backend-owned artifact text verbatim — the exact durable
 * bytes the backend wrote (decoded from its physical encoding, e.g. a
 * decompressed JSONL). The returned `content` is the raw text, not a
 * reconstruction from parsed events, so it preserves backend-specific
 * serialization (chunk packing, key order, line breaks). Callers first test
 * {@link supportsRawArtifacts}; `undefined` then means only that the requested
 * session has no materialized artifact.
 * @param _id - the persisted session to read (unused by the default: no
 * per-session artifact).
 * @param signal - optional cancellation for backend read work.
 * @returns the raw artifact plus its parsed header, or `undefined` when the
 * session is absent.
 * @throws when this backend does not expose per-session raw artifacts.
 */
readRaw(_id: SessionId, signal?: AbortSignal): Promise<SessionRawArtifact | undefined>

/**
 * Register a new session's metadata. A backend MAY defer the physical write
 * until the first {@link append} (lazy materialization), in which case a
 * created-but-never-appended session is absent from {@link list}
 * — abandoned sessions leave nothing behind.
 * @param meta - the immutable header (id, version, cwd, lineage) to record.
 */
abstract create(meta: SessionHeader): Promise<void>

/**
 * Durably persist a batch of events. Honors the append-only and contiguous-
 * seq contracts: the first event's `seq` MUST equal the stored next-seq
 * (after `load` has durably closed any interrupted turn). Rejects non-JSON-
 * serializable `event.data` with an error naming the offending event type.
 * @param id - the session the batch belongs to.
 * @param events - the contiguous batch to persist, in seq order.
 */
abstract append(id: SessionId, events: readonly SessionEvent[]): Promise<void>

/**
 * Prepare the exact unpublished Session used by resume. Implementations may
 * reuse object graphs retained by an earlier {@link inspect} after confirming
 * their durable revision is still current; disposal releases an unpublished
 * reservation. Revision retries require the durable log to remain unchanged
 * for one read/check round trip; continuous external writers may delay completion.
 * @param id - persisted session to prepare.
 * @param signal - optional cancellation for preparation work.
 * @returns one owned unpublished Session preparation.
 */
async prepare(id: SessionId, signal?: AbortSignal): Promise<SessionPreparation>

/**
 * Load an immutable balanced logical view and commit any required cold
 * recovery. A complete interrupted final turn is preserved and durably
 * closed with missing tool errors plus any open step and turn boundaries;
 * only a torn final record is discarded. Unknown versions and corruption in
 * the committed prefix reject. Implementations MUST NOT crash-repair an
 * identity still bound to a live Session: a balanced live log may return as a
 * durable snapshot, while an open live turn rejects. Returned values may be
 * shared with immutable live or prepared state and must not be mutated.
 * Revision-based implementations may wait for one stable read/check round trip.
 * @param id - the persisted session to reload.
 * @returns the header and a log ending on a balanced `turn/end`.
 */
abstract load(id: SessionId): Promise<SessionInspection>

/**
 * Inspect an immutable logical session without committing recovery or
 * publishing it. A cold complete interrupted turn receives synthetic closers
 * in memory and a torn physical tail remains untouched. An already-live
 * Session instead yields its current immutable snapshot, which may contain an
 * open turn and its `session/end-seed` boundary. Coordinator-backed
 * implementations retain the exact cold unpublished Session for bounded
 * reuse by a later {@link prepare}. A stale ready source is reloaded; a source
 * already committing or reserved for resume remains exclusive, and inspection
 * may borrow its immutable view. Callers borrow only the immutable header and
 * log. Continuous external writers may delay revision convergence.
 * @param id - the persisted session to inspect.
 * @param signal - optional cancellation for queued and backend read work.
 * @returns the validated header and current logical event log.
 */
abstract inspect(id: SessionId, signal?: AbortSignal): Promise<SessionInspection>

/**
 * Read the stored events from `fromSeq` onward — the read-from-seq
 * primitive for read models that resume from a watermark (e.g. a persisted
 * projection cache folding only the tail past its checkpoint). Unlike
 * {@link inspect}, it is a detached physical suffix read: no preparation
 * cache, torn-tail truncation, synthetic closers, or coordinator-state
 * publication. Only events from the valid contiguous stored prefix are
 * returned, so a torn fragment never reaches the caller. `fromSeq` at or
 * beyond the stored prefix returns an empty event list (never an error).
 * Backends whose medium can seek by seq
 * (SQLite) read only the suffix; sequential media (JSONL, both encodings)
 * still parse the whole artifact and skip forward — the primitive bounds
 * what is RETURNED and refolded, not every backend's physical read.
 * @param id - the persisted session to read.
 * @param fromSeq - first event seq to include; a non-negative safe integer.
 * @param signal - optional cancellation for queued and backend read work.
 * @returns the header and the stored events with `seq >= fromSeq`.
 */
abstract readFrom(id: SessionId, fromSeq: number, signal?: AbortSignal): Promise<{ meta: SessionHeader; events: SessionEvent[] }>

/**
 * Lightweight listing from metadata, without a full-log parse.
 * @param signal - optional cancellation for backend listing work.
 * @returns one header per materialized session.
 */
abstract list(signal?: AbortSignal): Promise<SessionHeader[]>

/**
 * List materialized sessions with cheap per-log change tokens.
 *
 * Repeated observations of an unchanged log return the same revision. A
 * successful mutating {@link load} repair changes the next listed revision.
 * Revisions also distinguish independently backed stores so backend-local
 * counters cannot compare equal across different persistence sources.
 * @param signal - optional cancellation for backend snapshot-listing work.
 * @returns one header and opaque revision per materialized session without loading full logs.
 */
abstract listSnapshots(signal?: AbortSignal): Promise<SessionPersistenceSnapshot[]>
```

Types: [SessionEvent](session.md) · [SessionId](core.md)

Source: [`packages/session/session-persistence/src/index.ts:84`](../../packages/session/session-persistence/src/index.ts)
<!-- END GENERATED cordis-surface -->
