# Stockage

Le sous-système de stockage persiste tout ce qui n’est pas un journal d’événements de session ; les journaux de session possèdent leur propre seam dans [persistence.md](persistence.md). Il s’agit d’une fonctionnalité facultative, distincte du cœur de la boucle d’agent, répartie comme un [seam de fonctionnalité](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md) : le concentrateur et la définition de service ([lasmex-storage](../../packages/storage/storage), `ctx.storage`), les fournisseurs de service ([lasmex-storage-json](../../packages/storage/storage-json), enregistré sous `json`, et [lasmex-storage-sqlite](../../packages/storage/storage-sqlite), enregistré sous `sqlite`) et la forme de données consommatrice ([lasmex-storage-domain](../../packages/storage/storage-domain), `ctx.storageDomain`, également accessible sous `ctx.storage.domain`). Cette dernière est l’unique consommateur du contrat du backend et l’API typée employée par tous les autres composants. Le concentrateur n’effectue lui-même aucune entrée-sortie : les backends possèdent les supports, les formes de données possèdent la sémantique et les packages du produit n’accèdent jamais directement aux backends. Décision de conception : [Agent Note sur le stockage clé-valeur par domaine](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md).

Sources : [`packages/storage/storage/src/backend.ts`](../../packages/storage/storage/src/backend.ts) · [`packages/storage/storage-domain/src/spec.ts`](../../packages/storage/storage-domain/src/spec.ts) · [`packages/storage/storage-domain/src/events.ts`](../../packages/storage/storage-domain/src/events.ts)

## Le concentrateur : `ctx.storage`

`Storage` ([signatures](#ctxstorage--storage)) est un point de rencontre, pas un magasin. `ctx.storage.backend` est une table nom → backend : plusieurs backends restent montés côte à côte. Le backend qui sert chaque consommateur relève de la configuration de ce consommateur, c’est-à-dire de la table de routage de la couche domaine, et jamais d’un choix global du concentrateur. `register(name, backend)` renvoie la fonction de nettoyage ; les noms en double et les recherches inconnues lèvent une `StorageError`. Le démontage retire uniquement le nom du registre. Le plugin propriétaire ferme le backend après ce retrait. Chaque plugin de backend publie aussi une clé de service réservée au cycle de vie (`storageBackendServiceKey(name)`), que les fournisseurs de formes injectent afin que leur activation ne puisse pas devancer l’enregistrement du backend.

Les formes de données se montent sur le concentrateur sous une table de clés extensible par fusion :

```ts type-equiv
/**
 * Data forms mountable on the hub, keyed by form name. Form owners extend
 * this map via declaration merging (the domain layer merges
 * `domain: DomainFacility`) and mount the facility in their `apply`.
 */
interface StorageForms {}
```

`mount(form, facility)` est un effet dont la fonction de nettoyage démonte la forme. Un second montage de la même clé lève `duplicate-mount`. `form(form)` résout une fonctionnalité montée et lève `form-not-mounted` jusqu’au chargement du plugin propriétaire. Les assemblages ordonnent leurs plugins en conséquence au lieu de différer silencieusement. La couche domaine fusionne `domain: DomainFacility` ; `ctx.storage.domain` et `ctx.storageDomain` désignent donc le même objet.

## Le contrat du backend

```ts type-equiv
/**
 * One registered backend. A backend owns exactly one medium and shares its
 * lifecycle across all facets; facets are optional members — a backend that
 * cannot serve a data kind simply omits it, and resolution fails loud instead.
 */
interface StorageBackend {
  /** Key-value operations; absent when this backend cannot serve them. */
  readonly kv?: KvFacet

  /**
   * Drain in-flight writes across all open units and release the medium.
   * Idempotent; concurrent and repeated calls resolve once teardown finishes.
   * @returns resolution after the medium is released.
   */
  close(): Promise<void>
}
```

Un backend possède un seul support, comme la racine d’une arborescence de fichiers ou un fichier de base de données, et expose des groupes d’opérations facultatifs. `kv` est aujourd’hui le seul groupe. `KvFacet.open(descriptor)` ouvre une unité nommée ; `KvUnitDescriptor` contient le nom, la version du format, les noms des tables et l’existence éventuelle d’un emplacement singleton global. La méthode renvoie une `KvUnit` dotée de `loadAll`, `putRecord`, `deleteRecord`, `setGlobal` et `close`. Les noms d’unités et de tables doivent respecter `UNIT_NAME_RE`, afin d’être sûrs comme noms de fichiers et segments d’identifiants SQL. Les clés d’enregistrement sont des chaînes arbitraires qui n’atteignent jamais les chemins de fichiers. Une unité ne sérialise pas les écritures concurrentes : leur ordre appartient à l’appelant. Chaque appel reste toutefois atomique sur le support et durable lorsqu’il est résolu. Un support marqué par une version différente rejette avec `version-mismatch`. S’il ne peut pas être analysé comme l’unité attendue, il rejette avec `malformed-medium` ; aucune migration n’est prévue avant la publication. Le fichier [`backend.ts`](../../packages/storage/storage/src/backend.ts) définit le contrat normatif clause par clause, et la suite de conformité partagée dans [`tests/contract.ts`](../../packages/storage/storage/tests/contract.ts) vérifie chaque clause sur chaque backend. Le [backend JSON](../../packages/storage/storage-json/README.md) republie atomiquement un fichier entier, lisible par un humain, pour chaque unité. Le [backend SQLite](../../packages/storage/storage-sqlite/README.md) conserve un document par ligne dans une base unique destinée aux données fréquemment modifiées.

## Déclarer un domaine

Le package propriétaire déclare une seule fois son domaine dans un objet de spécification. Cet objet est l’unique source de l’identité, de l’organisation et des schémas d’enregistrements du domaine. Les schémas utilisent zod afin que `z.infer` préserve les types des consommateurs sans les dupliquer :

```ts type-equiv
/** Static declaration of one domain: identity, version, and record layout. */
interface DomainSpec {
  /** Domain name; must match `UNIT_NAME_RE` (doubles as the backend unit name). */
  readonly name: string
  /** Domain format version; a medium stamped with a different version rejects at open. */
  readonly version: number
  /** Optional global singleton slot. */
  readonly global?: DomainGlobalSpec<unknown>
  /** Table declarations keyed by table name; each name must match `UNIT_NAME_RE`. */
  readonly tables: Record<string, DomainTableSpec>
}
```

`defineDomain(spec)` fixe les types littéraux de la spécification et échoue explicitement au chargement du module propriétaire, avant tout accès à un support. Un nom de domaine ou de table qui ne respecte pas `UNIT_NAME_RE`, une version qui n’est pas un entier positif ou nul, ou un schéma global qui accepte `null` provoque une exception. `null` est le marqueur « jamais écrit » du support ; une valeur globale nullable ne pourrait donc pas effectuer un aller-retour fidèle. `domainTable<K, V>(schema)` déclare une table dont le type de clé, uniquement statique, est généralement un [identifiant marqué](core.md#branded-ids). `descriptorOf(spec)` projette le descripteur d’unité destiné au backend.

## Le domaine ouvert

```ts type-equiv
/** One open domain, typed by its spec. */
interface Domain<S extends DomainSpec> {
  /** Domain name from the spec. */
  readonly name: string
  /** Global singleton handle; a spec without `global` has no usable handle (`never`). */
  readonly global: DomainGlobalHandleOf<S>
  /**
   * Resolve one declared table handle. Handles are stable — repeated calls
   * return the same instance.
   * @param name - Declared table name.
   * @returns the typed table handle.
   */
  table<N extends keyof S['tables'] & string>(name: N): KvTable<TableKeyOf<S, N>, TableValueOf<S, N>>

  /**
   * Close this domain: reject new writes immediately, drain already-queued
   * writes (their events still emit), release the backend unit, then free
   * the domain name for a later open. Idempotent — repeated calls share one
   * teardown. The consumer owns this call (typically as its own `ctx.effect`
   * disposer); the facility closes any domain left open when it unmounts.
   * @returns resolution after the unit is released.
   */
  close(): Promise<void>
}
```

Les lectures sont synchrones et proviennent de l’état en mémoire qui fait autorité. `KvTable` expose `get`/`entries`/`keys`/`size` ; ses itérateurs d’instantanés restent stables pendant l’application des écritures en file. La méthode `get()` du singleton global renvoie la valeur `initial` de la spécification jusqu’à ce qu’un premier `set` matérialise l’emplacement sur le support. Chaque écriture — `put`, `delete`, `update`, `global.set` — rejoint une chaîne propre au domaine. Elle devient d’abord durable dans le backend, modifie ensuite la mémoire, puis émet `domain/changed`. Une écriture rejetée par le backend laisse la mémoire intacte ; les lectures ne divergent donc jamais du support. `update(key, fn)` effectue une lecture-modification-écriture atomique à sa place dans la chaîne ; une clé absente rejette avec `missing-key`. Un `delete` sur une clé absente renvoie `false` sans écriture ni événement. Les enregistrements renvoyés sont les objets stockés eux-mêmes, pas des copies : remplacez-les avec `put`/`update` et ne les modifiez jamais sur place.

## La fonctionnalité de domaine : `ctx.storageDomain`

`DomainFacility` ([signatures](#ctxstoragedomain--domainfacility)) ouvre les domaines déclarés sur les backends sélectionnés. Le routage appartient à la configuration du plugin de domaine, jamais au concentrateur : `backend` nomme la route par défaut obligatoire et `routes` la remplace selon le nom du domaine. `open(spec)` exécute une séquence stricte dont chaque étape peut faire échouer l’appel entier : la méthode refuse un nom déjà ouvert ou en cours de fermeture (`already-open`), résout la route (`backend-not-found`), exige la face `kv` du backend (`facet-unsupported`), ouvre l’unité en propageant les erreurs `version-mismatch` ou `malformed-medium` du backend, puis valide chaque enregistrement et la valeur globale avec les schémas zod de la spécification. Une valeur invalide produit `invalid-record` avec la table et la clé concernées. L’appelant possède le handle renvoyé et le libère avec `Domain.close()`. Les domaines encore ouverts au démontage du plugin sont fermés par la fonctionnalité ; le nom d’un domaine fermé ne peut être réutilisé qu’après la fin complète du nettoyage. `get(name)` est une recherche de diagnostic non typée vers le runtime privé au package `DomainImpl`, qui sous-tend chaque handle typé. `closeAll()` est le chemin de démontage.

## L’événement de modification : `domain/changed`

Chaque écriture durable émet un événement après l’accusé de durabilité du backend, dans l’ordre de la chaîne d’écriture du domaine ([entrée de l’événement](#domainchanged--emit)) :

```ts type-equiv
/** Shared location fields of one durable domain change. */
interface DomainChangedBase {
  /** Owning domain name. */
  readonly domain: string
  /** Table name; `''` for a global-singleton write. */
  readonly table: string
  /** Record key; `''` for a global-singleton write. */
  readonly key: string
}
```

```ts type-equiv
/** One durable domain change; a closed union — switch on `operation`. */
type DomainChanged = DomainChangedPut | DomainChangedDeleted
```

`put`, qu’il s’agisse d’une insertion, d’un remplacement ou d’une écriture globale, contient le nouvel instantané dans `value`, jamais l’ancienne valeur. Un consommateur qui calcule une différence conserve son propre instantané précédent. `deleted` est un marqueur de suppression sans valeur. L’événement est une notification et ne participe pas à la transaction : le point de validation est déjà passé lors de son émission. Un écouteur qui lève une exception de manière synchrone est donc confiné avec un avertissement journalisé, sans rejeter l’écriture déjà durable. Les valeurs émises correspondent à l’état en mémoire au moment de l’émission. L’événement reste limité au processus ; la diffusion des modifications entre processus est une limite documentée dans le [README du package](../../packages/storage/storage-domain/README.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Générée depuis les sources par `scripts/gen-cordis-catalog.ts` (sa fraîcheur est vérifiée par `pnpm run verify-cordis-catalog` dans doc-sync ; régénérez-la avec `pnpm run gen-cordis-catalog`) — cette section est identique octet pour octet dans les deux langues de la page. Les blocs de signature utilisent une clôture `ts cordis-catalog` et conservent la JSDoc source d’origine. Les modes de répartition sont définis dans le [guide d’introduction](../cordis-primer.md#dispatch-modes), et l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxstorage--storage"></a>

### `ctx.storage` — `Storage`

Service concentrateur du stockage. Les backends s’enregistrent sous `backend`. Les formes de données se montent sous leur clé `StorageForms` et sont accessibles sous `ctx.storage.<form>`.

```ts cordis-catalog
/**
 * Mount a data-form facility on the hub. Mounting is an effect: the
 * returned disposer unmounts the form.
 * @param form - Form key declared in {@link StorageForms}.
 * @param facility - The facility instance to expose.
 * @returns the disposer that unmounts the form.
 */
mount<K extends keyof StorageForms>(form: K, facility: StorageForms[K]): () => void

/**
 * Resolve a mounted data form.
 * @param form - Form key declared in {@link StorageForms}.
 * @returns the mounted facility.
 */
form<K extends keyof StorageForms>(form: K): StorageForms[K]
```

Source : [`packages/storage/storage/src/index.ts:47`](../../packages/storage/storage/src/index.ts)

<a id="ctxstoragedomain--domainfacility"></a>

### `ctx.storageDomain` — `DomainFacility`

Fonctionnalité de domaines montée. Elle ouvre les domaines déclarés sur les backends sélectionnés. Une instance possède la table des domaines ouverts et impose une seule ouverture par nom de domaine.

```ts cordis-catalog
/**
 * Open one declared domain. Steps, each failing the whole call: reject a
 * name that is already open (`already-open`); resolve the backend route
 * (`backend-not-found` passes through from the hub); require its `kv` facet
 * (`facet-unsupported`); open the unit projected from the spec (backend
 * `version-mismatch`/`malformed-medium` pass through); load and validate
 * every stored record against the spec's zod schemas (`invalid-record`
 * with the offending table and key); construct the domain.
 *
 * Lifecycle: the CALLER owns the returned handle and closes it via
 * `Domain.close()` (typically as its own `ctx.effect` disposer) — the
 * facility does not tie the domain to any consumer fiber. Domains still
 * open when the facility unmounts are closed by the plugin disposer.
 * @param spec - The domain declaration, typically from `defineDomain`.
 * @returns the opened domain handle, typed by the spec.
 */
async open<S extends DomainSpec>(spec: S): Promise<Domain<S>>

/**
 * Look up an open domain by name, untyped. Diagnostic surface (the package
 * invariant cross-checks change events against live domain state); typed
 * consumers hold the handle returned by {@link open}.
 * @param name - Domain name.
 * @returns the open domain runtime, or `undefined` when not open.
 */
get(name: string): DomainImpl | undefined

/**
 * Close every domain still open on this facility. The unmount path for
 * consumers that never called `Domain.close()` themselves; closing is
 * idempotent, so double-closing an already-closed domain is harmless.
 * @returns resolution after every unit is released.
 */
async closeAll(): Promise<void>
```

Source : [`packages/storage/storage-domain/src/index.ts:69`](../../packages/storage/storage-domain/src/index.ts)

<a id="domain-events"></a>

### Événements `domain/*`

<a id="domainchanged--emit"></a>

#### `domain/changed` — emit

Un enregistrement du domaine ou le singleton global a changé. L’événement est émis une fois par écriture, strictement après l’accusé de durabilité du backend. Les événements d’un domaine arrivent dans l’ordre de sa chaîne d’écriture.

```ts cordis-catalog
/**
 * A domain record or the global singleton changed, emitted once per write
 * strictly after the backend acknowledged durability. Events of one
 * domain arrive in its write-chain order.
 * @param change - domain, table (`''` for global), key (`''` for global),
 * operation discriminant, and on `put` the new snapshot.
 * @mode emit
 */
'domain/changed'(change: DomainChanged): void
```

Source : [`packages/storage/storage-domain/src/events.ts:46`](../../packages/storage/storage-domain/src/events.ts)
<!-- END GENERATED cordis-surface -->
