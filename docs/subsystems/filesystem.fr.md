# Système de fichiers

La capacité facultative de système de fichiers comprend quatre parties : [lasmex-fs](../../packages/fs/fs) possède `ctx.fs` et les opérations textuelles atomiques avec protections facultatives, [lasmex-fs-local](../../packages/fs/fs-local) implémente le disque local, [lasmex-fs-observation-policy](../../packages/fs/fs-observation-policy) consigne la présence ou l’absence observée et ajoute des règles de fraîcheur au moyen d’événements plutôt que d’un service, et [lasmex-tool-fs](../../packages/fs/tool-fs) exécute directement les appels de lecture, écriture et modification visibles du modèle tout en rendant leurs fenêtres. Cette capacité se trouve hors de la structure centrale de l’agent loop ; remplacer le backend ne modifie ni la politique ni les schémas d’outils.

`lasmex-fs-observation-policy` est facultatif. Sans lui, la Service Definition `FileSystem`, un fournisseur et le Consumer `lasmex-tool-fs` forment le seam de système de fichiers complet et sans restriction : `write` crée ou écrase sans condition, et `edit` remplace du texte littéral sans condition. Le plugin de politique modifie ces opérations en décidant les waterfalls `fs/*`. Son retrait ne casse pas l’outil, car ce dernier appelle `ctx.fs` et distribue des événements ; il n’appelle aucune méthode de politique. Un déploiement qui charge `lasmex-tool-fs` est censé charger aussi `lasmex-fs-observation-policy`, afin que le comportement par défaut impose une lecture avant l’écriture ou la modification.

Source du fournisseur : [`packages/fs/fs/src/types.ts`](../../packages/fs/fs/src/types.ts) et [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts). Source de la politique : [`packages/fs/fs-observation-policy/src/types.ts`](../../packages/fs/fs-observation-policy/src/types.ts). Source du rendu des lectures : [`packages/fs/tool-fs/src/read-render.ts`](../../packages/fs/tool-fs/src/read-render.ts).

## Identité de cible et métadonnées — règles du fournisseur

Chaque opération commence par résoudre le chemin fourni par l’utilisateur en une cible opaque du backend. Les consommateurs peuvent afficher `displayPath`, mais ne doivent ni analyser `targetKey` — un identifiant opaque marqué — ni supposer qu’il s’agit d’un chemin absolu local.

Les consommateurs qui partagent le monde d’exécution du système de fichiers obtiennent leurs coordonnées inter-capacités par le fournisseur, sans interpréter cette identité : `processPath(target)` renvoie le chemin absolu canonique qu’un sous-processus peut ouvrir, `fileUrl(target)` son URI `file:` sur la plateforme du fournisseur, et `contains(parent, child)` vérifie l’identité canonique ou l’appartenance à la descendance.

```ts type-equiv
/**
 * A path resolved by a backend into a stable identity. `resolve()` produces
 * this; every other operation takes it.
 */
interface FsTarget {
  /** Opaque key for stale guards and target lookup. */
  targetKey: FsTargetKey
  /**
   * Path for model/UI-facing output. May be a local absolute path,
   * workspace-relative path, or remote URI depending on the backend.
   */
  displayPath: string
}
```

Le backend possède les jetons de version de fichier, c’est-à-dire la valeur de fraîcheur qu’une écriture ou modification protège. Le plugin de politique les stocke pour détecter l’obsolescence ; les consommateurs ne les interprètent pas. Les deux identifiants sont des chaînes opaques marquées.

```ts type-equiv
/**
 * Opaque key for stale guards and target lookup. The local backend uses a
 * realpath-like string; a remote backend might use a workspace URI or file id.
 * Consumers MUST NOT parse it or assume it is a local absolute path.
 */
type FsTargetKey = Branded<'FsTargetKey'>
```

```ts type-equiv
/**
 * Opaque file-version token — the freshness token a write/edit guards against.
 * The local backend derives it from high-resolution stat identity and freshness
 * fields; a remote backend might use a revision id. The policy layer records it
 * for stale checks; consumers may display related metadata but MUST NOT
 * interpret this token.
 */
type FsVersion = Branded<'FsVersion'>
```

`stat` renvoie des métadonnées, jamais le contenu, ou `undefined` si la cible est absente. `type` permet aux consommateurs de rejeter les répertoires et fichiers spéciaux avant la lecture ; `size` permet aux consommateurs de texte de choisir entre `readText` et `streamText` sans sonder par l’échec. Le consommateur de texte applique son propre plafond de rétention pendant la consommation de `streamText`. Les consommateurs d’octets bruts utilisent `readBytes(target, signal, maxBytes)` ; son plafond obligatoire sur le contenu complet fait échouer tout dépassement connu ou découvert avec `FS_TOO_LARGE`, au lieu de tronquer ou mettre en mémoire sans limite.

```ts type-equiv
/**
 * Metadata about a target — what {@link FileSystem.stat} returns. Lets the
 * policy layer reject directories/special files before reading and choose
 * `readText` vs `streamText` from `size` without probing by failure. `version`
 * is the freshness token. `undefined` from `stat` means the target is absent.
 */
interface FsInfo {
  /** Opaque freshness token of the target right now. */
  version: FsVersion
  /** Whether the target is a regular file, a directory, or something else. */
  type: 'file' | 'directory' | 'other'
  /** Byte size of a regular file, when the backend can report it. */
  size?: number
}
```

`lstat` est la primitive de métadonnées au niveau du chemin qui ne suit pas le dernier composant. Elle accepte un chemin plutôt qu’un `FsTarget`, car `resolve` suit volontairement les liens symboliques afin de produire une identité stable. Les consommateurs qui vérifient une limite de confiance peuvent appeler `lstat` d’abord et rejeter `symlink` avant la résolution.

```ts type-equiv
/**
 * Metadata about a path without following the final path component when it is a
 * symbolic link. Unlike {@link FsInfo}, this path-level probe can report
 * `symlink` so consumers with trust-boundary rules can reject repository-owned
 * links before resolving a target.
 */
interface FsPathInfo {
  /** Opaque freshness token of the path entry right now. */
  version: FsVersion
  /** Whether the path entry is a regular file, directory, symlink, or other. */
  type: 'file' | 'directory' | 'symlink' | 'other'
  /** Byte size of the path entry, when the backend can report it. */
  size?: number
}
```

`listDir` renvoie les enfants directs dans un ordre stable par nom. Chaque entrée contient le basename de l’enfant, son type, sa cible résolue et des métadonnées peu coûteuses lorsque le backend peut les fournir. L’opération ne doit pas lire le contenu des fichiers ; `size` ne concerne donc que les fichiers ordinaires et `version` provient des métadonnées. Un enfant cassé ou disparu peut être renvoyé sous le type `other` sans métadonnées. Un refus de permission ou une erreur d’E/S du backend pendant l’énumération ou la résolution des métadonnées d’un enfant fait échouer toute l’énumération avec `FS_PERMISSION_DENIED` ou `FS_IO_ERROR`.

```ts type-equiv
/**
 * One direct child returned by {@link FileSystem.listDir}. Listing returns
 * metadata and resolved targets only; it must not read file contents.
 */
interface FsDirEntry {
  /** Basename of the child inside the listed directory. */
  name: string
  /** Whether the child is a regular file, a directory, or something else. */
  type: 'file' | 'directory' | 'other'
  /** Resolved child target for follow-up operations. */
  target: FsTarget
  /** Opaque freshness token when the backend can report metadata cheaply. */
  version?: FsVersion
  /** Byte size of a regular file, when the backend can report it. */
  size?: number
}
```

## Protections d’écriture et de modification — règles du fournisseur

`writeText` et `editText` acceptent tous deux leur protection de version de manière FACULTATIVE : l’omettre produit une mutation inconditionnelle du fournisseur nu, la fournir active la protection. La protection de `writeText` est une `FsWriteIntent` : `createIfAbsent` crée une cible manquante et rejette une cible existante avec `FS_NOT_OBSERVED`, y compris si la cible apparaît après la sonde initiale du fournisseur, car la publication elle-même doit interdire le remplacement ; `replaceIfVersion` remplace uniquement une cible existante à la version observée, sinon elle renvoie `FS_STALE_VERSION`. Omettre `expected` crée ou écrase sans condition. L’union ne contient que les deux intentions protégées ; l’absence de protection s’exprime par l’omission, si bien que l’écriture et la modification emploient le même champ `expected` facultatif.

```ts type-equiv
/**
 * Guarded write intent. `createIfAbsent` rejects an existing target with
 * `FS_NOT_OBSERVED`; `replaceIfVersion` rejects absence or mismatch with
 * `FS_STALE_VERSION`. Omitting the intent from `writeText` means unconditional
 * create-or-overwrite, not a third union arm.
 */
type FsWriteIntent =
  | { kind: 'createIfAbsent' }
  | { kind: 'replaceIfVersion'; version: FsVersion }
```

```ts type-equiv
/** Outcome of a full-file write. */
interface FsWriteOutcome {
  /** Whether the write created a new file or replaced an existing one. */
  operation: 'create' | 'update'
  /** Opaque version of the file after the write. */
  version: FsVersion
  /**
   * The file's content BEFORE the write, or `null` when the file did not exist
   * (a create) or the backend declined a contextual basis (for example, a
   * binary/non-UTF-8 prior file or either overwrite side reaching its exclusive limit).
   * LF-normalized storage text (the diff basis), never a diff — a consumer
   * computes the result-time contextual diff from `before`/`after` when
   * `before` is present, else falls back to a whole-file diff.
   */
  before: string | null
  /** The file's content AFTER the write, LF-normalized to share `before`'s diff basis. */
  after: string
}
```

`editText` est une mutation du fournisseur, et non la composition externe d’une `read` et d’une `write`. Lorsqu’elle est protégée, elle vérifie la version attendue AVANT la correspondance littérale : une modification obsolète renvoie donc `FS_STALE_VERSION` plutôt qu’un échec de correspondance sur le nouveau contenu. Sans protection, elle modifie le contenu actuel. Dans les deux cas, elle applique le remplacement et écrit atomiquement, en conservant la correspondance, la gestion des fins de ligne, la vérification d’obsolescence et le remplacement atomique dans une seule section critique de mutation. Une cible manquante renvoie `FS_STALE_VERSION` dans les deux chemins.

```ts type-equiv
/** A literal-replacement edit request. */
interface FsEditRequest {
  /** Literal non-empty text to replace. Must match exactly (after line-ending normalization). */
  oldString: string
  /** Literal replacement text. An empty string deletes the matched text. */
  newString: string
  /** Replace every match instead of requiring exactly one. */
  replaceAll: boolean
}
```

```ts type-equiv
/** Outcome of a literal edit. */
interface FsEditOutcome {
  /** Opaque version of the file after the edit. */
  version: FsVersion
  /**
   * The file's content BEFORE the edit. Raw storage text (LF-normalized by the
   * backend), never a diff — a consumer computes the result-time contextual diff
   * (the applied hunk with context) from `before`/`after`.
   */
  before: string
  /** The file's content AFTER the edit. */
  after: string
}
```

## Événements de politique fs — vocabulaire du fournisseur

`lasmex-fs` possède trois événements distribués par l’outil et écoutés par le plugin de politique. L’émetteur (`lasmex-tool-fs`) et le listener (`lasmex-fs-observation-policy`) partagent ainsi un vocabulaire sans que l’émetteur dépende du plugin de politique. Ces événements transportent uniquement le vocabulaire de `lasmex-fs` et un acteur `object` opaque, sans concept visible du modèle ni structure propriétaire d’agent ou de session.

`fs/write-intent` et `fs/edit-intent` sont des **waterfalls de décision à emplacement unique** : l’outil les distribue avec un thunk par défaut qui renvoie `undefined`, c’est-à-dire le fournisseur nu, et un listener décide entièrement sans appeler `next()`. Le premier emplacement l’emporte selon l’ordre d’enregistrement ; le fait que le plugin de politique le possède relève d’une convention de déploiement, pas d’un invariant imposé. `fs/observed` est un événement d’enregistrement sans attente qui transporte une `FsObservation` : présence à une version donnée ou absence confirmée. Il est distribué par un simple `ctx.emit` et son listener DOIT être synchrone et se limiter aux effets de bord, car l’outil ne protège PAS l’émission. Un listener qui lève une exception peut remplacer une erreur de lecture ou devenir le résultat `isError` de l’outil après qu’une mutation a déjà réussi. La [surface Cordis](#cordis-surface) générée ci-dessous présente les signatures exactes.

```ts type-equiv
/**
 * One authoritative observation of a target. A present observation carries the
 * version used by guarded replacement; an absent observation authorizes only a
 * guarded create, never an edit.
 */
type FsObservation =
  | { readonly kind: 'present'; readonly version: FsVersion }
  | { readonly kind: 'absent' }
```

## Contexte d’exécution — plugin de politique

Le plugin de politique a uniquement besoin du contexte d’exécution nécessaire pour dériver le propriétaire de l’état observé en affinant l’acteur `object` opaque transporté par les événements `fs/*`. `ToolExecution` possède les champs requis ; `lasmex-tool-fs` transmet donc son objet d’exécution comme acteur sans obliger `lasmex-fs-observation-policy` à importer les packages d’outil, d’agent ou de session.

```ts type-equiv
/**
 * Minimal structural view of a tool execution the policy plugin needs to derive
 * an observed-state owner. `lasmex-tools`' `ToolExecution` contains
 * these fields, so the tool passes its `exec` straight through as the opaque
 * `object` actor on the `fs/*` events; this plugin narrows that actor to
 * `FsObservationActor` without importing `lasmex-tools`, `lasmex-agent`, or `lasmex-session`.
 *
 * The owner is `agent.session` when present. It is treated as an opaque object
 * identity (a `WeakMap` key); this package never reads any of its fields.
 */
interface FsObservationActor {
  /** The agent on whose behalf the call runs, when there is one. */
  agent?: {
    /** The session that owns observed-file state, used as an opaque key. */
    session?: object
  }
}
```

## Résultat de lecture — consommateur et rendu

Une lecture textuelle est limitée par une fenêtre de lignes, un plafond d’octets et les limites du backend. Une fois le plafond d’octets atteint, l’analyse continue sans conserver d’autres lignes, afin que `totalLines` reste exact. Le résultat rendu par l’outil `read` visible du modèle est purement présentatif ; il n’existe aucune vue `full`/`partial`. L’autorisation repose sur la fraîcheur — l’outil émet directement un `fs/observed` présent avec la version fournie par stat —, si bien que toute lecture par fenêtre peut autoriser une écriture ou modification ultérieure lorsque le fichier n’a pas changé. Une absence de métadonnées émet une observation d’absence avant que l’outil ne renvoie `FS_NOT_FOUND`, ce qui autorise une écriture protégée ultérieure à recréer une cible supprimée de l’extérieur sans autoriser sa modification. `lasmex-tool-fs`, l’exécuteur propriétaire de la lecture, implémente le fenêtrage et construit ce résultat ; le plugin de politique ne le fait pas.

```ts type-equiv
/** Outcome of a bounded text read — what {@link formatReadOutput} renders. */
interface FileReadOutcome {
  /** 1-based first line requested. */
  offset: number
  /** Returned lines, already numbered. */
  lines: FileTextLine[]
  /** Exact total line count in the file. */
  totalLines: number
  /** Whether selected output hit the byte cap. */
  truncatedByBytes?: true
}
```

## État des fichiers observés — plugin de politique

L’état observé est un `WeakMap<owner, Map<targetKey, FsObservation>>` conservé dans le plugin `lasmex-fs-observation-policy`. L’absence d’entrée signifie « jamais vu » ; `{ kind: 'absent' }` signifie qu’une absence a été confirmée par une `read` ou par un `str_replace_editor` dont l’opération `view`, `str_replace` ou `insert` n’a trouvé aucune métadonnée ; `{ kind: 'present', version }` signifie qu’une lecture, écriture ou modification a observé cette version. La décision d’écriture traduit les états jamais vu et absent en `createIfAbsent`, et l’état présent en `replaceIfVersion`. La décision de modification traduit l’état jamais vu en `FS_NOT_OBSERVED`, l’absence en `FS_NOT_FOUND` et la présence en sa protection de version. Le propriétaire est dérivé de l’acteur de l’événement — normalement `exec.agent.session` —, traité comme opaque et jamais lu. La libération supprime tout l’état pour assurer la sûreté HMR, et la politique n’effectue aucune E/S de système de fichiers.

## Taxonomie d’erreurs — règles du fournisseur

Les échecs du système de fichiers utilisent des chaînes `FsErrorCode` stables transportées par `FsError` (`HarnessError`). Le registre d’outils conserve `{ name, code }` dans les résultats d’erreur, afin que les couches de nouvelle tentative, de permission et d’interface puissent bifurquer sans analyser le texte.

```ts type-equiv
/**
 * Stable, machine-routable codes for filesystem failures. Carried on
 * {@link FsError}; the tool registry exposes `{ name, code }` on `isError`
 * results so retry/permission/UI layers can branch without parsing messages.
 */
type FsErrorCode =
  | 'FS_NOT_FOUND'
  | 'FS_NOT_DIRECTORY'
  | 'FS_NOT_TEXT'
  | 'FS_NOT_REGULAR_FILE'
  | 'FS_TOO_LARGE'
  | 'FS_PERMISSION_DENIED'
  | 'FS_SANDBOX_DENIED'
  | 'FS_IO_ERROR'
  | 'FS_STALE_VERSION'
  | 'FS_NOT_OBSERVED'
  | 'FS_AMBIGUOUS_EDIT'
  | 'FS_EDIT_NOT_FOUND'
  | 'FS_ABORTED'
```

`FS_NOT_DIRECTORY`, `FS_PERMISSION_DENIED` et `FS_IO_ERROR` servent à l’énumération d’un répertoire pour distinguer une cible existante qui n’est pas un répertoire, une énumération refusée et un échec d’E/S inattendu du backend. `FS_SANDBOX_DENIED` est un refus de POLITIQUE provenant d’un backend qui applique le bac à sable (`lasmex-fs-sandbox`) : la limite du mode a refusé une écriture ou modification. Il se distingue de `FS_PERMISSION_DENIED`, qui correspond à un refus du noyau hôte. `FS_NOT_OBSERVED` signifie que le plugin de politique ne possède aucune observation préalable pour ce propriétaire — ou qu’un `createIfAbsent` a rencontré un fichier existant. `FS_NOT_FOUND` représente également une modification rejetée en raison d’une absence confirmée. `FS_STALE_VERSION` signifie que la version du backend ne correspond plus à celle observée, ou que le fournisseur reçoit une modification portant sur une cible manquante. L’autorisation par fraîcheur ne distingue pas les observations partielles et complètes ; `FS_PARTIAL_OBSERVATION` n’existe donc pas.

## Aucun délai d’expiration pour les E/S de fichiers

`read`/`write`/`edit` n’acceptent **aucun** `timeoutMs`, et les règles du fournisseur n’arment aucun délai. Cette situation diffère de bash et web, qui consomment [`lasmex-timeout`](../../packages/util/timeout/README.md), ainsi que des opérations `glob`/`grep` adossées à un sous-processus, dont le `timeoutMs` déclaré est appliqué par `lasmex-tool-call-timeout-policy` : ces opérations reposent sur des processus dont le délai peut réellement arrêter le travail. Un appel système local n’est annulable que dans la mesure du possible ; un délai ne peut pas forcer un `fsync`/`rename` en cours à s’arrêter. Un `timeoutMs` constituerait donc ici une échéance que le seam ne peut pas appliquer, ainsi qu’une valeur implicite à l’endroit précis où la préférence pour l’explicite l’interdit. L’annulation se propage tout de même par le signal d’exécution de l’outil, pour une interruption dans la mesure du possible aux limites des appels système.

## Service et plugin

`FileSystem` (`ctx.fs`, abstrait) possède les primitives du fournisseur : `resolve`, `processPath`, `fileUrl`, `contains`, `stat`, `lstat`, `readText`, `streamText`, `readBytes`, `listDir`, `writeText` et `editText`. `lasmex-fs-observation-policy` n’enregistre **aucun service** : ce plugin ajoute une politique au moyen de l’événement `fs/*`. Il décide les waterfalls d’intention d’écriture et de modification à partir des états jamais vu, absent ou présent, et consigne les valeurs `FsObservation`. L’exécuteur est `lasmex-tool-fs` : il lit, écrit et modifie par `ctx.fs`, distribue les waterfalls et émet l’événement d’enregistrement. La [section `ctx.fs`](#ctxfs--filesystem-abstract-seam) générée ci-dessous donne les signatures exactes.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Cette section est générée depuis le code source par `scripts/gen-cordis-catalog.ts` ; `pnpm run verify-cordis-catalog` vérifie sa fraîcheur dans doc-sync et `pnpm run gen-cordis-catalog` la régénère. Les blocs de signatures utilisent une fence `ts cordis-catalog` et conservent le JSDoc original. Les modes de distribution sont définis dans le [primer](../cordis-primer.md#dispatch-modes), tandis que l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxfs--filesystem-abstract-seam"></a>

### `ctx.fs` — `FileSystem` (seam abstrait)

Fournisseur abstrait de système de fichiers. Les cibles doivent conserver leur identité entre les alias ; les lectures exposent du texte UTF-8 ordinaire ou des erreurs typées, les énumérations sont stables et dépourvues de contenu, et les mutations sont atomiques. Des protections facultatives ajoutent une vérification d’obsolescence sans modifier les règles du fournisseur non protégé.

```ts cordis-catalog
/**
 * Resolve a model/plugin-supplied path into a stable {@link FsTarget}. May perform I/O (a
 * remote/sandboxed backend may need a round-trip to map a path to a stable identity), hence
 * async even though the local backend only normalizes + realpaths.
 *
 * @param path - the path to resolve; relative paths resolve against `opts.cwd`.
 * @param opts - optional cwd override and cancellation signal.
 * @returns the stable target; the same file yields the same `targetKey`.
 */
abstract resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget>

/**
 * Return the canonical absolute path a subprocess in this filesystem's
 * execution world can open. The path is deliberately separate from
 * {@link FsTarget.targetKey}: consumers may pass this value to another OS
 * capability, but must continue treating the target key as opaque.
 * @param target - the resolved target whose process path is required.
 * @returns an absolute path in the backend's execution world.
 */
abstract processPath(target: FsTarget): string

/**
 * Return the canonical `file:` URI for a target in this filesystem's
 * execution world. Backends own URI encoding because the host platform may
 * differ from the execution platform.
 * @param target - the resolved target to encode.
 * @returns the target's canonical file URI.
 */
abstract fileUrl(target: FsTarget): string

/**
 * Test canonical containment without exposing or parsing backend target
 * keys. Both targets must come from this provider.
 * @param parent - canonical directory target.
 * @param child - canonical candidate target.
 * @returns true when `child` is `parent` or a descendant of it.
 */
abstract contains(parent: FsTarget, child: FsTarget): boolean

/**
 * Return target metadata, or `undefined` when the target does not exist.
 * @param target - the resolved target to stat.
 * @param signal - aborts the metadata round-trip.
 * @returns metadata only, never content; undefined for an absent target.
 */
abstract stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined>

/**
 * Return path metadata without following the final path component when it is a
 * symbolic link. This is intentionally path-shaped, not target-shaped:
 * {@link resolve} follows symlinks to produce the stable identity used by
 * normal reads/writes, while `lstat` lets a consumer reject the path itself
 * before that follow happens.
 *
 * `opts.cwd` follows {@link resolve}'s cwd rules. `undefined` means the path is
 * absent.
 * @param path - the path to inspect; relative paths resolve against `opts.cwd`.
 * @param opts - `cwd` overrides the backend's default base for relative paths.
 * @param signal - aborts the metadata round-trip.
 * @returns metadata only, never content; undefined for an absent path.
 */
abstract lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined>

/**
 * Read the whole regular text file as a single decoded string.
 * @param target - the resolved target to read.
 * @param signal - aborts the read.
 * @returns the full decoded UTF-8 content.
 */
abstract readText(target: FsTarget, signal?: AbortSignal): Promise<string>

/**
 * Stream the whole regular text file as decoded text chunks (same text
 * semantics as {@link readText}, for large files). The backend owns
 * cross-chunk UTF-8 decoding and binary rejection so the policy layer never
 * touches raw bytes.
 * @param target - the resolved target to read.
 * @param signal - aborts the stream, including between chunks.
 * @returns the chunk iterable, decoded and validated like {@link readText}.
 */
abstract streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>>

/**
 * Read the whole regular file as raw bytes with no decoding or binary
 * rejection. The bound lives at this seam so a backend can never buffer an
 * unbounded file: a target known or discovered to exceed `maxBytes` fails
 * with `FS_TOO_LARGE` instead of returning a truncated result.
 * @param target - the resolved target to read.
 * @param signal - aborts the read.
 * @param maxBytes - inclusive byte cap on the complete content.
 * @returns the full raw content, at most `maxBytes` long.
 */
abstract readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>

/**
 * List direct children of a directory in stable name order. Returns resolved
 * child targets plus cheap metadata only; never reads file contents.
 * @param target - the resolved directory target.
 * @param signal - aborts the listing.
 * @returns one entry per direct child, in stable name order.
 */
abstract listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]>

/**
 * Atomically create or replace UTF-8 text. `expected` guards intent and
 * staleness; omission allows unconditional overwrite.
 * @param target - the resolved target to write.
 * @param content - the full new file content.
 * @param expected - the write intent guarding the write; omit for unconditional.
 * @param signal - aborts before atomic publication takes effect.
 * @param sandboxPolicy - the per-call mode and workspace root this write
 *   runs under; a sandboxing backend fences the write by it, the bare backend
 *   ignores it. Omit to leave the backend its own default.
 * @returns the outcome, including the version the write produced.
 */
abstract writeText( target: FsTarget, content: string, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<FsWriteOutcome>

/**
 * Atomically edit literal text. When supplied, the version guard is checked
 * before matching so stale content reports `FS_STALE_VERSION`; omission edits
 * the current content without a freshness precondition.
 * @param target - the resolved target to edit.
 * @param edit - the literal search/replace request.
 * @param expected - the version guard; omit for an unconditional edit.
 * @param signal - aborts before atomic publication takes effect.
 * @param sandboxPolicy - the per-call mode and workspace root this edit runs
 *   under; a sandboxing backend fences the edit by it, the bare backend
 *   ignores it. Omit to leave the backend its own default.
 * @returns the outcome, including the version the edit produced.
 */
abstract editText( target: FsTarget, edit: FsEditRequest, expected?: { version: FsVersion }, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<FsEditOutcome>
```

Types : [SandboxExecutionPolicy](sandbox.md)

Source : [`packages/fs/fs/src/index.ts:86`](../../packages/fs/fs/src/index.ts)

<a id="fs-events"></a>

### Événements `fs/*`

<a id="fsedit-intent--waterfall"></a>

#### `fs/edit-intent` — waterfall

Décision à emplacement unique pour le prochain FileSystem.editText. Appeler `next()` produit une modification sans condition ; la première protection renvoyée l’emporte.

```ts cordis-catalog
/**
 * Single-slot decision for the next {@link FileSystem.editText}. Calling
 * `next()` yields an unconditional edit; the first returned guard wins.
 * @param target - the resolved target about to be edited.
 * @param actor - the opaque tool-execution context the decider keys off.
 * @mode waterfall
 */
'fs/edit-intent'(target: FsTarget, actor: object | undefined, next: () => { version: FsVersion } | undefined | Promise<{ version: FsVersion } | undefined>): Promise<{ version: FsVersion } | undefined>
```

Source : [`packages/fs/fs/src/index.ts:66`](../../packages/fs/fs/src/index.ts)

<a id="fsobserved--emit"></a>

#### `fs/observed` — emit

Enregistre une observation positive ou négative faisant autorité. Les listeners doivent être des enregistreurs synchrones : une exception fait échouer l’appel d’outil et les promesses renvoyées ne sont pas attendues.

```ts cordis-catalog
/**
 * Record an authoritative positive or negative observation. Listeners must
 * be synchronous recorders: throws fail the tool call and returned promises
 * are not awaited.
 * @param target - the target whose presence or absence was observed.
 * @param observation - present with its version, or confirmed absent.
 * @param actor - the observing tool-execution context; undefined records nothing useful.
 * @mode emit
 */
'fs/observed'(target: FsTarget, observation: FsObservation, actor: object | undefined): void
```

Source : [`packages/fs/fs/src/index.ts:76`](../../packages/fs/fs/src/index.ts)

<a id="fswrite-intent--waterfall"></a>

#### `fs/write-intent` — waterfall

Décision à emplacement unique pour le prochain FileSystem.writeText. Appeler `next()` produit l’écriture inconditionnelle du fournisseur nu ; le premier listener qui renvoie une intention possède la décision au lieu de la composer avec ses pairs.

```ts cordis-catalog
/**
 * Single-slot decision for the next {@link FileSystem.writeText}. Calling
 * `next()` yields the bare provider's unconditional write; the first listener
 * that returns an intent owns the decision rather than composing with peers.
 * @param target - the resolved target about to be written.
 * @param actor - the opaque tool-execution context the decider keys off.
 * @mode waterfall
 */
'fs/write-intent'(target: FsTarget, actor: object | undefined, next: () => FsWriteIntent | undefined | Promise<FsWriteIntent | undefined>): Promise<FsWriteIntent | undefined>
```

Source : [`packages/fs/fs/src/index.ts:58`](../../packages/fs/fs/src/index.ts)
<!-- END GENERATED cordis-surface -->
