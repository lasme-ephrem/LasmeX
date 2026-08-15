# Invariants à l’exécution

[lasmex-invariants](../../packages/runtime-diagnostics/invariants) fournit le service de registre configurable (`ctx.invariants`) destiné aux contrôles d’invariants à l’exécution propres à chaque package. Il s’agit d’un seul package d’assistance, et non d’une capacité répartie sur trois packages ni d’un élément central de la boucle d’agent. Le registre gère la sélection, la réservation des noms, le cycle de vie des fibres enfants et l’attribution des défaillances aux packages ; chaque package de l’espace de travail publie parallèlement un plugin compagnon `./invariant` qui enregistre ses contrôles sous son nom npm exact. Les assertions autorisées — flux d’événements faisant autorité ou données mutables, jamais la simple présence d’un service ou d’une méthode — sont définies par la convention sur les invariants à l’exécution dans [AGENTS.md](../../AGENTS.md#conventions). La conception du registre relève de l’[Agent Note sur le service d’invariants](../../.agents/notes/implemented/architecture/2026-07-19-package-owned-invariant-service.md).

Source : [`packages/runtime-diagnostics/invariants/src/index.ts`](../../packages/runtime-diagnostics/invariants/src/index.ts)

## Sélection

```ts type-equiv
/** Runtime invariant selection configured on the service plugin. */
interface Config {
  /** Global switch; defaults to `true`. */
  readonly enabled?: boolean
  /** Case-sensitive JavaScript regex sources that admit package names; empty admits all. */
  readonly package_allowlist?: string[]
  /** Case-sensitive JavaScript regex sources that exclude package names after allowlist matching. */
  readonly package_blocklist?: string[]
}
```

Un package est sélectionné lorsque le service est activé, que la liste d’autorisation est vide ou qu’au moins un motif correspond à son nom npm complet, et qu’aucun motif de la liste d’exclusion ne correspond. Une correspondance dans la liste d’exclusion l’emporte sur une correspondance dans la liste d’autorisation. Chaque entrée est compilée avec `new RegExp(source)` : la recherche n’est pas ancrée sauf si la source contient `^` et `$`, et la syntaxe `/pattern/flags` n’est pas interprétée. La validation échoue explicitement au démarrage du service : une entrée vide, entourée d’espaces, dupliquée ou non valide provoque une erreur au lieu d’être ignorée. Un motif valide peut ne correspondre à aucun package actuellement chargé ; les chargements ultérieurs et le rechargement à chaud restent ainsi déterministes. Les filtres sont immuables pendant toute la durée de vie du service ([README](../../packages/runtime-diagnostics/invariants/README.md)).

## Programme d’installation

```ts type-equiv
/**
 * Throw a package-attributed invariant failure.
 * @param message - violated package contract without the standard prefix.
 * @returns never because reporting a violation throws.
 */
type InvariantFailure = (message: string) => never
```

```ts type-equiv
/** Install one package's checks into the registration's child context. */
interface InvariantInstaller {
  /**
   * Install the package contribution.
   * @param ctx - child context owned by this invariant registration.
   * @param fail - reporter bound to the registering package name.
   * @returns nothing, or a promise settling after asynchronous checks finish.
   */
  (ctx: Context, fail: InvariantFailure): void | Promise<void>
  /** Services the child installer fiber may access. */
  readonly inject?: Inject
}
```

Un programme d’installation activé s’exécute dans une fibre enfant Cordis dédiée. `installer.inject` déclare les services auxquels cette fibre peut accéder, et le succès de l’enregistrement attend la fin synchrone ou asynchrone du programme d’installation. `fail(message)` lève une `InvariantError` : cette erreur `extends Error`, possède le `code: 'INVARIANT'` stable et le `packageName` propriétaire, et son message commence par `invariant violated by "<package>": …`. Une violation peut donc être attribuée sans que le registre importe le moindre package produit.

## Service

`ctx.invariants.register(packageName, installer)` réserve un enregistrement actif sous le nom npm complet du package et renvoie son mécanisme de libération rattaché à l’effet. La réservation reste en vigueur même si les filtres désactivent le programme d’installation : deux plugins ne peuvent donc jamais revendiquer silencieusement le même nom de package. Un nom dupliqué, vide ou contenant des espaces provoque une erreur. En cas d’échec du programme d’installation, la fibre enfant est libérée et la réservation est annulée de manière atomique. Le service possède chaque fibre d’enregistrement, tandis que le mécanisme de libération renvoyé appartient aussi à la fibre du compagnon : le déchargement de l’un ou de l’autre supprime les écouteurs, l’état de trace et la réservation. Un compagnon rechargé peut ainsi réenregistrer le même nom sans conserver d’état résiduel.

## Contrat du compagnon

Chaque package de l’espace de travail possède un compagnon `./invariant` ([contrat des packages](../../packages/AGENTS.md)). La publication et l’enregistrement sont exhaustifs, mais les assertions ne sont jamais artificielles. Un compagnon n’installe un contrôle que si son package possède une relation observable entre des événements ou des données mutables. Dans le cas contraire, il exporte un programme d’installation vide dont le commentaire initial commence par `No runtime invariant:` et explique précisément pourquoi rien ne peut être contrôlé dans ce package. `pnpm run verify-package-invariants` rejette mécaniquement les marqueurs générés, les programmes d’installation vides sans explication, les programmes non vides qui omettent ou ignorent le rapporteur, les noms d’enregistrement incorrects et tout câblage incomplet des exports, de la publication, des dépendances ou des bundles ([Agent Note sur la règle mécanique](../../.agents/notes/implemented/architecture/2026-07-19-package-invariant-runtime-contracts.md)). Le catalogue des compagnons exécutables et la composition standard figurent dans le [README du package](../../packages/runtime-diagnostics/invariants/README.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxinvariants--invariantregistry"></a>

### `ctx.invariants` — `InvariantRegistry`

Package-owned invariant registry with global and regex-based selection.

```ts cordis-catalog
/**
 * Register one package's invariant installer. The package name is reserved
 * even when filtering disables its checks. Enabled installers run in a child
 * fiber; failure disposes that fiber and releases the reservation.
 * @param packageName - full npm package name that owns the contribution.
 * @param installer - listener or startup-check installer for the child context.
 * @returns an effect-scoped disposer for the registration.
 */
register(packageName: string, installer: InvariantInstaller): () => void
```

Source: [`packages/runtime-diagnostics/invariants/src/index.ts:94`](../../packages/runtime-diagnostics/invariants/src/index.ts)
<!-- END GENERATED cordis-surface -->
