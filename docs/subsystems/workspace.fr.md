# Espaces de travail

Un espace de travail est l’enregistrement persistant d’un répertoire dans lequel l’utilisateur travaille : un identifiant stable associé à un chemin canonique, un titre d’affichage et la liste ordonnée des sessions qui lui appartiennent. Le sous-système tient dans un seul package ([lasmex-workspace](../../packages/workspace/workspace), `ctx.workspaceRegistry`) : il s’agit d’une capacité facultative côté hôte, extérieure au cœur de la boucle d’agent et invisible pour les modèles, sans outil, texte de prompt ni événement de session. Il conserve ses enregistrements au moyen du [domaine de stockage](storage.md) et valide l’appartenance des sessions à partir de [`SessionHeader.cwd`](persistence.md#sessionheader--metadata-beside-the-log). `storageDomain` et `sessionPersistence` sont donc des dépendances de démarrage obligatoires : si le service de persistance n’est pas disponible, le plugin reste en attente au lieu de prendre cette absence pour un historique vide. Conception : [Agent Note sur le stockage clé-valeur par domaine](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md) ; amorçage et ordre dans l’interface graphique : [Agent Note sur le parcours produit de l’interface des espaces de travail](../../.agents/notes/implemented/feature/2026-07-25-workspace-ui-product-flow.md).

Source : [`packages/workspace/workspace/src/types.ts`](../../packages/workspace/workspace/src/types.ts)

## Identité

```ts type-equiv
/**
 * Identifies one workspace record. A generated uuid, never the path: path
 * normalization rewrites paths, and a reference anchor must stay stable.
 */
type WorkspaceId = Branded<'WorkspaceId'>
```

`WorkspaceId` est un [identifiant typé](core.md#branded-ids). L’identité du chemin est distincte : `realpathNormalize` — qui applique `fs.realpath` et résout les barres obliques finales, les segments `..` et les liens symboliques — constitue l’unique forme canonique utilisée pour l’unicité. Les chemins des espaces de travail sont enregistrés sous cette forme ; l’unicité correspond à l’égalité textuelle des chemins canoniques, de sorte qu’un lien symbolique vers un répertoire déjà possédé entre en conflit. Les contrôles du répertoire courant d’une session au moment de son rattachement utilisent la même normalisation.

## Entité d’espace de travail

Les consommateurs ne voient que l’interface `Workspace`; l’implémentation reste privée au package.

```ts type-equiv
/**
 * One workspace: a stable id over an existing directory, a display title, and
 * an ordered candidate account of sessions. Membership requires both an id in
 * that account and a session header whose canonical cwd equals the workspace
 * path. Consumers only see this interface; the implementation stays private.
 */
interface Workspace {
  /** Stable record id (generated uuid). */
  readonly id: WorkspaceId

  /**
   * Canonical directory path: the `fs.realpath` of the path given at create
   * time (trailing slashes, `..`, and symlinks all resolved). Never rewritten
   * afterwards, even when the directory disappears (see {@link status}).
   */
  readonly path: string

  /** Display title. Defaults to `basename(path)` at create; duplicates are allowed. */
  readonly title: string

  /** ISO-8601 creation instant, stamped at create and never rewritten. */
  readonly createdAt: string

  /** ISO-8601 instant of the last durable mutation (create counts as one). */
  readonly updatedAt: string

  /**
   * Header-validated sessions in manually owned order: a new session is
   * prepended at attach, explicit reordering goes through
   * `insertSessionBefore`, and activity never reorders. The durable candidate
   * account is filtered synchronously: missing headers, invalid cwd values,
   * and canonical cwd mismatches are never returned. A subsequent workspace
   * mutation prunes those filtered candidates durably.
   */
  readonly sessionIds: readonly SessionId[]

  /**
   * Replace the display title durably.
   * @param title - New title; any string, duplicates across workspaces allowed.
   * @returns resolution after durability.
   */
  setTitle(title: string): Promise<void>

  /**
   * Prepend a session to this workspace's candidate account. An already
   * accounted id resolves without writing, aside from the durable
   * filtered-candidate prune every accepted mutation performs. A new id's
   * live or persisted
   * header cwd must resolve to an existing directory equal to {@link path};
   * unknown ids, missing or invalid cwd values, and mismatches reject without
   * writing.
   * @param sessionId - The session to record.
   * @returns resolution after durability.
   */
  attachSession(sessionId: SessionId): Promise<void>

  /**
   * Move an accounted session within the manual order, DOM-insertBefore-like:
   * with an anchor the session lands before it, without one it appends to the
   * end. Only the moved id changes position. A session or anchor absent from
   * the account rejects without writing; a move to the current position
   * resolves without writing, aside from the durable filtered-candidate
   * prune every accepted mutation performs; decided on the domain write
   * chain.
   * @param sessionId - The accounted session to move.
   * @param beforeSessionId - Accounted anchor to insert before; omitted appends.
   * @returns resolution after durability.
   */
  insertSessionBefore(sessionId: SessionId, beforeSessionId?: SessionId): Promise<void>

  /**
   * Remove a session from this workspace's account. Idempotent: an id not on
   * the account resolves without writing, aside from the durable
   * filtered-candidate prune every accepted mutation performs; decided on
   * the domain write chain like attach. Never touches the session's own stored log.
   * @param sessionId - The session to remove.
   * @returns resolution after durability.
   */
  detachSession(sessionId: SessionId): Promise<void>

  /**
   * Live directory check, uncached: whether {@link path} currently exists and
   * is a directory. A missing directory never mutates the record — the
   * directory may only be temporarily moved.
   * @returns `'ok'` when the directory exists, `'missing-dir'` otherwise.
   */
  status(): Promise<'ok' | 'missing-dir'>
}
```

La source de vérité de la propriété est la liste ordonnée `sessionIds` de l’enregistrement, jamais une valeur déduite du répertoire courant de la session. L’appartenance exige toutefois les deux conditions : l’identifiant doit figurer dans la liste et l’en-tête doit posséder un répertoire courant canonique égal au chemin de l’espace de travail. Une session ne peut donc structurellement appartenir qu’à un espace de travail. Une écriture refusée rejette sa promesse — les erreurs de compte dans `insertSessionBefore` deviennent `WorkspaceMoveInvalidError`, tandis que les erreurs de stockage restent des erreurs ordinaires. Chaque mutation acceptée actualise `updatedAt` et supprime durablement les candidats qui ne satisfont plus le contrôle d’appartenance.

## Registre : `ctx.workspaceRegistry`

`WorkspaceRegistry` — voir ses [signatures](#ctxworkspaceregistry--workspaceregistry) — gère l’enregistrement et la résolution. `create(path, title?)` normalise le chemin, rejette un chemin inexistant en préservant l’erreur `ENOENT` d’origine ou un chemin qui ne désigne pas un répertoire, puis renvoie l’entité existante sans la modifier si le chemin canonique possède déjà un espace de travail. Sinon, il crée un enregistrement dont le titre vaut `title ?? basename(path)` et le place en tête de l’ordre durable ; un nouvel enregistrement ne peut pas reprendre un titre d’affichage existant (`WorkspaceNameConflictError`). `get(id)` et la méthode ordonnée `list()` sont des lectures synchrones du cache ; `resolveByPath(path)` applique la même normalisation par chemin réel sans créer d’entité. `delete(id)` supprime uniquement l’enregistrement, son entrée d’ordre et son compte de sessions : le répertoire, les fichiers utilisateur, les sessions actives et les journaux persistants ne sont jamais modifiés. Ces sessions deviennent donc non regroupées ([décision](../../.agents/notes/implemented/feature/2026-07-27-workspace-registration-deletion.md)); un identifiant inconnu renvoie `false`. La création et la suppression enregistrent un marqueur de mutation en attente avant que leurs deux écritures — enregistrement et ordre — puissent diverger. Au démarrage, le registre ne résout que la mutation marquée en supprimant la ligne marquée dans la table : cette opération termine une suppression interrompue ou annule une création interrompue, la possibilité de recréer l’enregistrement rendant cette annulation sûre. Une divergence entre l’ordre et la table sans marqueur provoque explicitement une erreur de corruption.

Le répertoire courant d’une session est défini lors de sa création par son créateur, et non par ce registre. La passerelle d’API choisit celui d’une nouvelle session à partir du `path` de l’espace de travail sélectionné, avec repli sur un répertoire courant explicite ou par défaut, puis crée la session afin d’inscrire ce chemin dans son [`SessionHeader`](persistence.md#sessionheader--metadata-beside-the-log) immuable. Elle appelle ensuite `attachSession`, qui valide de nouveau le répertoire courant enregistré par rapport au chemin de l’espace de travail. Lors du premier démarrage réussi, le registre initialise l’historique uniquement à partir des en-têtes persistants — `id`, `cwd`, `createdAt`, jamais le corps des événements — en regroupant par répertoire les sessions dont le répertoire courant canonique est valide, de la plus récente à la plus ancienne. Le marqueur d’initialisation est écrit en dernier afin qu’un amorçage interrompu puisse reprendre sans risque. Cet amorçage n’a lieu qu’une fois : les anciennes sessions sans répertoire courant restent non regroupées, et les sessions créées ensuite ne rejoignent un espace de travail que par `attachSession`.

## Consommateurs

[lasmex-host-apiproxy](../../packages/host/apiproxy) est le consommateur produit : il expose les opérations de création, lecture, mise à jour et suppression des espaces de travail aux clients graphiques par `ctx.workspaceRegistry`, puis applique le parcours de création de session et de rattachement décrit ci-dessus. Malgré son nom, [lasmex-agent-instructions](../../packages/context/agent-instructions) **n’est pas** un consommateur : il découvre les fichiers d’instructions de type AGENTS.md sous le répertoire courant propre de l’agent et ne consulte jamais `ctx.workspaceRegistry`. Le terme commun désigne ici le répertoire de travail de l’utilisateur, pas les entités de ce registre.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdirectorypicker--directorypicker-abstract-seam"></a>

### `ctx.directoryPicker` — `DirectoryPicker` (abstract seam)

Abstract directory-picking service. Subclass, implement `capability()`, and load the subclass as a plugin — it registers as `ctx.directoryPicker` (one implementation per context; loading a second throws, cordis' standard duplicate-service behavior). The capability object must be stable for the service lifetime: consumers may capture it across calls.

```ts cordis-catalog
/**
 * The backend's interaction capability.
 * @returns the discriminated capability consumers switch on.
 */
abstract capability(): DirectoryPickerCapability
```

Source: [`packages/host/directory-picker/src/index.ts:131`](../../packages/host/directory-picker/src/index.ts)

<a id="ctxworkspaceregistry--workspaceregistry"></a>

### `ctx.workspaceRegistry` — `WorkspaceRegistry`

Durable workspace registry. Startup waits for `sessionPersistence`, builds one canonical-cwd header index, and completes the one-time history bootstrap before the service becomes active. The persistence dependency is mandatory so an unavailable peer can never be mistaken for an empty history and commit the initialized marker.

```ts cordis-catalog
/**
 * Create or reuse a workspace for an existing directory. The path is
 * canonicalized through `fs.realpath`; a nonexistent path rejects with the
 * original error and a non-directory rejects. Repeated calls for the same
 * canonical path return the existing entity without changing its title.
 * A newly created workspace is prepended to the durable registry order.
 * Different canonical paths may share a display title.
 * @param path - Existing directory to own, in any path spelling.
 * @param title - Display title used only when a new record is created.
 * @returns the existing or newly durable workspace.
 */
async create(path: string, title?: string): Promise<Workspace>

/**
 * Look up a workspace by id.
 * @param id - Workspace id.
 * @returns the workspace, or `undefined` when unknown.
 */
get(id: WorkspaceId): Workspace | undefined

/**
 * Synchronous workspace projection in durable registry order. Every
 * entity's `sessionIds` getter is already filtered by the startup/live
 * canonical-cwd header index; this method performs no persistence reads.
 * @returns a fresh ordered array of workspace entities.
 */
list(): Workspace[]

/**
 * Delete one workspace registration while retaining its directory and every
 * session log. The durable order is updated before the table deletion; a
 * failed table write restores the prior order and keeps the entity
 * published. Unknown ids are an idempotent no-op for domain callers.
 * @param id - Workspace registration to remove.
 * @returns `true` when a record was deleted, `false` when it was unknown.
 */
delete(id: WorkspaceId): Promise<boolean>

/**
 * Move one workspace within the durable display order, DOM-insertBefore-like.
 * With an anchor it lands before that workspace; without one it appends.
 * @param id - Workspace to move.
 * @param beforeId - Workspace anchor; omitted appends.
 * @returns the complete committed workspace order.
 */
insertBefore(id: WorkspaceId, beforeId?: WorkspaceId): Promise<readonly WorkspaceId[]>

/**
 * Archive one session durably. The session must exist (live or in session
 * persistence); its workspace accounting — or lack of one — is irrelevant.
 * An already archived id resolves without writing.
 * @param sessionId - The session to archive.
 * @returns resolution after durability.
 */
archiveSession(sessionId: SessionId): Promise<void>

/**
 * Restore an archived session into every grouping surface by removing its
 * archive entry. Its workspace account was never touched, so the row
 * returns to its stored position. Idempotent: an unarchived id resolves
 * without writing; an unknown id rejects ({@link WorkspaceUnknownSessionError}).
 * @param sessionId - The session to restore.
 * @returns resolution after durability.
 */
unarchiveSession(sessionId: SessionId): Promise<void>

/**
 * Durably delete one session: its stored log, every workspace account,
 * and its archive entry. A live session rejects before any write
 * ({@link WorkspaceLiveSessionError} — close it first); an unknown id
 * rejects ({@link WorkspaceUnknownSessionError}). Idempotent: deleting a
 * session already absent from persistence and accounts resolves.
 * @param sessionId - The session to delete.
 * @returns resolution after every durable write.
 */
deleteSession(sessionId: SessionId): Promise<void>

/**
 * Resolve by canonical directory path without creating or mutating a
 * workspace. A missing path rejects during `realpath`; an existing unowned
 * directory returns `undefined`.
 * @param path - Existing directory path in any spelling.
 * @returns the workspace owning the canonical path, when one exists.
 */
async resolveByPath(path: string): Promise<Workspace | undefined>
```

Types: [SessionId](core.md)

Source: [`packages/workspace/workspace/src/index.ts:122`](../../packages/workspace/workspace/src/index.ts)

<a id="workspace-events"></a>

### Événements `workspace/*`

<a id="workspacesession-removed--emit"></a>

#### `workspace/session-removed` — emit

Une session a été supprimée durablement : son journal stocké a disparu, son compte d’espace de travail et son entrée d’archive sont effacés. Émis après la validation de chaque écriture du registre et de la persistance. Les sessions vivantes n’atteignent jamais ce point (elles rejettent d’abord WorkspaceLiveSessionError puis se défont via `session/disposed`).

```ts cordis-catalog
/**
 * A session was durably deleted: its stored log is gone, its workspace
 * account and archive entry are cleared. Emitted after every registry
 * and persistence write committed. Live sessions never reach this point
 * (they reject {@link WorkspaceLiveSessionError} first and dispose
 * through `session/disposed` instead).
 * @param payload - the deleted session id.
 * @mode emit
 */
'workspace/session-removed'(payload: { sessionId: SessionId }): void
```

Types: [SessionId](core.md)

Source: [`packages/workspace/workspace/src/index.ts:81`](../../packages/workspace/workspace/src/index.ts)
<!-- END GENERATED cordis-surface -->
