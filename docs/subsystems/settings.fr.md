# Réglages utilisateur

Le seam de réglages utilisateur de [lasmex-settings](../../packages/settings/settings) contient un document appartenant à l’utilisateur, divisé en sections par espace de noms. Il résout chaque espace enregistré en superposant les valeurs par défaut du schéma, la valeur `base` fournie par la composition du déclarant, puis la section de l’utilisateur. Des fournisseurs comme [lasmex-settings-file](../../packages/settings/settings-file) stockent le document brut et publient ses modifications externes. Les plugins consommateurs enregistrent un schéma, puis lisent ou observent la valeur résolue. La configuration de composition reste dans `cordis.yml` ; un espace de noms ne contient que la partie modifiable par l’utilisateur.

Source : [`packages/settings/settings/src/index.ts`](../../packages/settings/settings/src/index.ts)

## Identité

Un espace de noms désigne une section du document utilisateur appartenant à un plugin. La marque empêche de confondre les espaces de noms de réglages avec d’autres identifiants transmis entre packages ou processus. La construction vérifie une syntaxe kebab-case en minuscules.

```ts type-equiv
/** Nominal id of one registered settings namespace. */
type SettingsNamespace = Branded<'SettingsNamespace'>
```

## Enregistrement

L’enregistrement associe un schéma Schemastery à un espace de noms sur la fibre du plugin appelant. La libération de cette fibre retire l’espace de noms et ses observateurs. Les options contiennent la couche de composition, le moment d’application de l’effet du propriétaire et une validation facultative pour ce que le schéma ne peut pas exprimer.

```ts type-equiv
/** Registration options beyond the namespace schema. */
interface SettingsRegisterOptions<T> {
  /** Composition-layer values resolved below the user layer (entry-config subset). */
  base?: Partial<T>
  /** Owner's effect timing, surfaced to configuration UIs; defaults to `live`. */
  applies?: SettingsApplies
  /**
   * Reject a resolved section the owner could not act on, for constraints its
   * schema cannot express — a cross-field requirement, or one field's validity
   * depending on another's. Throwing here refuses the *write* that produced the
   * value, so a caller learns at `update`/`replace`/`mutate` instead of storing
   * something that would silently disable the owner.
   *
   * Kept separate from the schema because the schema is also what a
   * configuration surface renders and what an absent section resolves through;
   * folding a cross-field check into it would change both.
   *
   * Once the owner is registered, a stored section that fails this keeps the
   * namespace's last good value and warns, exactly as a schema failure does,
   * so an externally edited document cannot strand a running owner. At
   * registration there is no last good value yet, so a stored section that
   * already fails rejects the registration itself — again exactly as a schema
   * failure does.
   * @param value - the resolved section, schema-valid by construction.
   */
  validate?: (value: T) => void
}
```

`validate` s’exécute après l’acceptation d’une valeur par le schéma. Il voit donc les valeurs par défaut et la base de composition exactement comme le propriétaire. `lasmex-llm-pi-ai` l’utilise pour refuser, dès l’écriture qui le produirait, un profil de fournisseur impossible à servir, plutôt que de stocker une valeur qui désactiverait toutes les routes de son espace de noms.

`applies` est une indication pour l’interface, pas un mécanisme. Un propriétaire `restart` ne s’abonne tout simplement jamais : sa valeur est lue une fois à la construction et les interfaces de configuration peuvent signaler la modification en attente.

```ts type-equiv
/** When a namespace's changes take effect for its owner. */
type SettingsApplies = 'live' | 'restart'
```

## Portée du propriétaire

La portée est le handle destiné au propriétaire. `update` fusionne un patch partiel au-dessus de la seule section utilisateur, jamais dans `base`. `replace` remplace toute la section et sert de chemin de suppression ou de réinitialisation : les clés absentes héritent de nouveau de `base` et des valeurs par défaut du schéma. Les écritures sur un espace de noms sont sérialisées dans l’ordre des appels, et les valeurs résolues sont des instantanés profondément figés.

```ts type-equiv
/** Owner-facing handle for one registered namespace. */
interface SettingsScope<T> {
  /** Current resolved value: schema defaults, then `base`, then the user layer. */
  get(): T
  /**
   * Observe committed changes to this namespace's resolved value. Invocations
   * of one callback run asynchronously, one at a time, in commit order; a
   * rejection is contained and logged like a sync throw. After the disposer
   * returns, no further invocation starts — one already queued is skipped;
   * one already started still settles, and service disposal waits for it.
   * @param callback - invoked after each commit with the next and previous values.
   * @returns the disposer removing this observer.
   */
  watch(callback: (next: T, prev: T) => void | Promise<void>): () => void
  /**
   * Merge a partial patch into this namespace's user layer and persist it.
   * @param patch - plain-object patch over the user section; JSON-compatible data
   * only (non-JSON values reject with their path before anything persists).
   */
  update(patch: object): Promise<void>
  /**
   * Replace this namespace's user section wholesale; absent keys re-inherit
   * the composition `base` and schema defaults (`replace({})` resets all).
   * @param section - the complete next user section; JSON-compatible data only,
   * as for {@link update}.
   */
  replace(section: object): Promise<void>
}
```

## Descripteurs

`describe()` sérialise chaque espace de noms enregistré pour les interfaces de configuration. L’enveloppe Schemastery `toJSON()` pilote les formulaires rendus depuis le schéma, la valeur résolue les remplit, et les couches `base` et `user` détachées permettent de repérer par leur présence les champs remplacés par l’utilisateur. `describe({ redactSecrets: true })`, obligatoire sur toute surface filaire, retire les champs `role('secret')` des trois couches et énumère leurs emplacements `{path, set}`. Une page peut ainsi afficher des entrées réservées à l’écriture sans jamais recevoir un secret.

```ts type-equiv
/** One registered namespace as surfaced to configuration UIs. */
interface SettingsDescriptor {
  /** The registered namespace. */
  ns: SettingsNamespace
  /** Serialized schemastery schema (`schema.toJSON()`). */
  schema: unknown
  /** Current resolved value. */
  value: unknown
  /**
   * Monotonic revision of the raw user section this descriptor was read at.
   * Send it back as `expectedRevision` on a write to refuse a stale one.
   */
  revision: number
  /** Registrant's composition `base` layer (detached), when one was declared. */
  base?: unknown
  /**
   * Raw user section from the stored document (detached), when one exists and
   * is well-formed; a field's presence here is what marks it user-overridden.
   */
  user?: unknown
  /** Owner's declared effect timing. */
  applies: SettingsApplies
  /** Schema-declared secret positions; present only under `redactSecrets`. */
  secrets?: RedactedSecret[]
}
```

Un appelant qui ne possède que le descripteur masqué ne peut pas reconstruire une section sans risque. Les suppressions sont donc transmises sous forme d’opérations de chemin. Chaque descripteur transporte aussi une `revision` de la section brute. Une écriture peut la renvoyer comme `expectedRevision` ; si elle ne correspond plus, l’écriture est refusée au lieu d’écraser celle qui a été validée la première.

```ts type-equiv
/**
 * One path-addressed edit to a namespace's user section. Path mutation exists
 * for a caller holding an INCOMPLETE view of the section — a configuration UI
 * reads the redacted descriptor, which by construction never received the
 * `role('secret')` fields. Such a caller can name the field it means without
 * restating the section: a wholesale `replace` rebuilt from a redacted
 * document silently deletes every secret the wire never returned.
 */
type SettingsPathOp =
  | { op: 'set'; path: readonly string[]; value: unknown }
  | { op: 'unset'; path: readonly string[] }
```

```ts type-equiv
/** Options for {@link SettingsProvider.describe}. */
interface SettingsDescribeOptions {
  /**
   * Strip `role('secret')` fields from `value`/`base`/`user` and enumerate
   * them in each descriptor's `secrets`. Every wire surface MUST pass this;
   * the verbatim default exists for same-process configuration UIs only.
   */
  redactSecrets?: boolean
}
```

## Validation des modifications

Chaque modification validée — écriture dans le processus ou modification externe observée par le fournisseur — émet `settings/updated (ns, next, prev, source)` une fois la nouvelle valeur devenue l’autorité, et jamais lorsque la valeur résolue est profondément égale. L’étiquette de source distingue les deux chemins d’entrée.

```ts type-equiv
/** Origin of one committed settings change. */
type SettingsUpdateSource = 'update' | 'provider'
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Générée depuis les sources par `scripts/gen-cordis-catalog.ts` (sa fraîcheur est vérifiée par `pnpm run verify-cordis-catalog` dans doc-sync ; régénérez-la avec `pnpm run gen-cordis-catalog`) — cette section est identique octet pour octet dans les deux langues de la page. Les blocs de signature utilisent une clôture `ts cordis-catalog` et conservent la JSDoc source d’origine. Les modes de répartition sont définis dans le [guide d’introduction](../cordis-primer.md#dispatch-modes), et l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsettings--settingsprovider-abstract-seam"></a>

### `ctx.settings` — `SettingsProvider` (seam abstrait)

Service abstrait de réglages. Les fournisseurs implémentent le stockage du document brut par `load`/`persist` et publient les modifications externes par Settings.publish. La classe de base possède l’enregistrement des espaces de noms, la résolution, la validation, la détection des changements et l’événement de validation `settings/updated`.

```ts cordis-catalog
/**
 * Prepare the provider's user-editable document for a native editor. File
 * providers may materialize an absent document before returning its path;
 * non-file providers return undefined.
 * @returns the absolute local document path, or undefined for non-file storage.
 */
prepareDocument(): Promise<string | undefined>

/**
 * Register a namespace schema and receive its owner scope. The registration
 * is an effect on the calling plugin's fiber: disposing that fiber removes
 * the namespace and its observers. An invalid stored section fails the
 * registration itself — the earliest point where the schema can judge it.
 * @param ns - unique namespace; duplicate registration fails loud.
 * @param schema - schemastery schema resolving this namespace's value.
 * @param options - composition `base` layer and effect timing.
 * @returns the owner scope for reads, observation, and updates.
 */
register<T>(ns: SettingsNamespace, schema: z<T>, options?: SettingsRegisterOptions<T>): SettingsScope<T>

/**
 * Describe every registered namespace for configuration surfaces, including
 * the composition `base` and raw user layers so a form can mark which fields
 * the user overrode (presence in `user`) and what a reset returns to.
 * @param options - redaction switch; wire surfaces must redact.
 * @returns one descriptor per registered namespace, in registration order.
 */
describe(options?: SettingsDescribeOptions): SettingsDescriptor[]

/**
 * Read one registered namespace's resolved value.
 * @param ns - the namespace to read.
 * @returns the resolved value, or `undefined` while unregistered.
 */
get(ns: SettingsNamespace): unknown

/**
 * Merge a patch into one registered namespace's user layer, validate the
 * resolved candidate, persist through the provider, then commit and emit.
 * A validation failure rejects before anything is persisted. Writes to one
 * namespace are serialized: concurrent updates apply in call order, each
 * merging over the previous write's committed section.
 * @param ns - the registered namespace to update.
 * @param patch - plain-object patch over the user section.
 * @param expectedRevision - the descriptor `revision` the caller read; a
 *   namespace that moved past it rejects with {@link SettingsConflictError}.
 */
async update(ns: SettingsNamespace, patch: object, expectedRevision?: number): Promise<void>

/**
 * Replace one registered namespace's user section wholesale, validate,
 * persist, then commit and emit. Keys absent from `section` fall back to the
 * composition `base` and schema defaults — this is the removal/reset path a
 * merge-only patch cannot express (`replace({})` re-inherits everything).
 * @param ns - the registered namespace to replace.
 * @param section - the complete next user section.
 * @param expectedRevision - the descriptor `revision` the caller read; a
 *   namespace that moved past it rejects with {@link SettingsConflictError}.
 */
async replace(ns: SettingsNamespace, section: object, expectedRevision?: number): Promise<void>

/**
 * Apply path-addressed edits to one registered namespace's user section,
 * validate, persist, then commit and emit. The ops are applied to the
 * section as it stands when the write reaches the front of the queue, so a
 * caller never has to restate fields it did not touch — and, crucially,
 * cannot delete fields it never saw. This is the write path for any caller
 * holding a redacted view; `replace` remains the wholesale reset.
 * @param ns - the registered namespace to edit.
 * @param ops - ordered path edits; later ops observe earlier ones.
 * @param expectedRevision - the descriptor `revision` the caller read; a
 *   namespace that moved past it rejects with {@link SettingsConflictError}.
 */
async mutate(ns: SettingsNamespace, ops: readonly SettingsPathOp[], expectedRevision?: number): Promise<void>
```

Source : [`packages/settings/settings/src/index.ts:350`](../../packages/settings/settings/src/index.ts)

<a id="settings-events"></a>

### Événements `settings/*`

<a id="settingsdocument-updated--emit"></a>

#### `settings/document-updated` — emit

La section utilisateur BRUTE d’un espace de noms enregistré a changé, que la valeur résolue ait changé ou non. `settings/updated` est l’événement destiné aux consommateurs et reste conditionné par l’égalité profonde. Celui-ci sert aux interfaces de configuration, qui doivent savoir qu’un champ est passé d’hérité à remplacé par l’utilisateur — même valeur résolue, sens différent — et que la révision qu’elles détiennent est périmée. Le confinement des écouteurs correspond à celui de `settings/updated`.

```ts cordis-catalog
/**
 * One registered namespace's RAW user section changed, whether or not the
 * resolved value did. `settings/updated` is the consumer-facing event and
 * stays deep-equal-gated; this one exists for configuration surfaces,
 * which must learn that a field went from inherited to overridden (same
 * resolved value, different meaning) and that their held revision is
 * stale. Listener containment matches `settings/updated`.
 * @param ns - the namespace whose stored section changed.
 * @param revision - the namespace's new revision.
 * @mode emit
 */
'settings/document-updated'(ns: SettingsNamespace, revision: number): void
```

Source : [`packages/settings/settings/src/types.ts:48`](../../packages/settings/settings/src/types.ts)

<a id="settingsupdated--emit"></a>

#### `settings/updated` — emit

Modification validée de la valeur résolue d’un espace de noms enregistré. L’événement est émis après que le fournisseur a persisté, pour `update`, ou publié, pour `provider`, la modification. Il ne l’est jamais lorsque la valeur résolue est profondément égale. Les échecs des écouteurs sont confinés et journalisés, qu’il s’agisse d’une exception synchrone ou d’un rejet asynchrone, sauf les échecs codés `INVARIANT`, relancés après l’exécution de tous les écouteurs. Cette relance n’atteint l’émetteur que depuis un écouteur synchrone ; les vérifications de propriétés sur cet événement ne doivent donc pas être des fonctions asynchrones.

```ts cordis-catalog
/**
 * Committed change to one registered namespace's resolved value. Emitted
 * after the provider persisted (for `update`) or published (`provider`)
 * the change; never emitted when the resolved value is deep-equal.
 * Listener failures are contained and logged — a sync throw and an async
 * rejection alike — except `INVARIANT`-coded failures, which rethrow
 * after every listener ran; that rethrow reaches the emitter only from
 * synchronous listeners, so invariant checks on this event must not be
 * async functions.
 * @param ns - the namespace whose resolved value changed.
 * @param next - the new resolved value.
 * @param prev - the previous resolved value.
 * @param source - whether the change entered through `update()` or the provider.
 * @mode emit
 */
'settings/updated'(ns: SettingsNamespace, next: unknown, prev: unknown, source: SettingsUpdateSource): void
```

Source : [`packages/settings/settings/src/types.ts:35`](../../packages/settings/settings/src/types.ts)
<!-- END GENERATED cordis-surface -->
