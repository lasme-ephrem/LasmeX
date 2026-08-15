# Informations d’authentification de l’utilisateur

Le seam d’informations d’authentification de [lasmex-credentials](../../packages/credentials/credentials) exclut les secrets de la configuration : les sections de réglages et les entrées de `cordis.yml` contiennent des *références*, c’est-à-dire des noms de variables d’environnement ; les fournisseurs comme [lasmex-credentials-local](../../packages/credentials/credentials-local) possèdent les valeurs ; les consommateurs résolvent une référence une fois par opération. Les adaptateurs LLM effectuent cette résolution une fois par requête au modèle, de sorte qu’un secret renouvelé s’applique à la requête suivante sans redémarrage. Une règle commune à tout le seam s’impose à chaque fournisseur : une valeur enregistrée vide est toujours considérée comme absente.

Source : [`packages/credentials/credentials/src/index.ts`](../../packages/credentials/credentials/src/index.ts)

## Identité

Une référence désigne une information d’authentification au moyen d’un nom de variable d’environnement au format POSIX. La marque empêche les appelants de confondre ces références avec d’autres chaînes transmises entre packages ou processus. La construction valide la syntaxe d’un identifiant de shell.

```ts type-equiv
/** Nominal reference to one credential: a POSIX-style environment-variable name. */
type CredentialRef = Branded<'CredentialRef'>
```

## Résolution

`resolve(ref)` renvoie la valeur et la couche source définie par le fournisseur qui l’a fournie, ou `undefined` tant que la référence n’est pas configurée. Les consommateurs la résolvent de nouveau à chaque opération et ne la mettent jamais en cache d’une opération à l’autre. Cette lecture par opération permet l’application immédiate des mises à jour.

```ts type-equiv
/** One resolved credential value and the source layer that supplied it. */
interface ResolvedCredential {
  /** The non-empty secret value. */
  value: string
  /** Provider-defined source layer id (the local provider uses `env`, `file`, `project-env`, and `user-env`). */
  source: string
}
```

## Description

`describe(ref)` renseigne les interfaces de configuration sans jamais exposer la valeur : il indique si la référence est résolue, depuis quelle couche et si `set` peut réussir dans l’état courant. Le fournisseur local attribue `writable: false` à une référence fournie par l’environnement du processus actif. Une écriture semblerait réussir, alors que la résolution continuerait de renvoyer la valeur prioritaire ; le seam la refuse donc et l’interface peut afficher la référence en lecture seule avant toute tentative.

```ts type-equiv
/** Source and writability facts for one reference, safe for configuration UIs — never the value. */
interface CredentialInfo {
  /** Whether {@link CredentialProvider.resolve} would currently return a value. */
  configured: boolean
  /** Source layer currently supplying the value; absent while unconfigured. */
  source?: string
  /** Whether {@link CredentialProvider.set} would currently succeed for this reference. */
  writable: boolean
}
```

## Validation des modifications

`credentials/updated (ref)` est émis après la validation d’une modification d’une source gérée par le fournisseur : un `set`, un `unset` ou une modification externe observée dans le stockage. Les changements ambiants de l’environnement du processus ne sont pas observables et n’émettent jamais cet événement. Les consommateurs n’en ont pas besoin, car ils résolvent de nouveau la référence à chaque opération. L’événement permet aux interfaces de configuration d’actualiser un badge « configuré ».

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Générée depuis les sources par `scripts/gen-cordis-catalog.ts` (sa fraîcheur est vérifiée par `pnpm run verify-cordis-catalog` dans doc-sync ; régénérez-la avec `pnpm run gen-cordis-catalog`) — cette section est identique octet pour octet dans les deux langues de la page. Les blocs de signature utilisent une clôture `ts cordis-catalog` et conservent la JSDoc source d’origine. Les modes de répartition sont définis dans le [guide d’introduction](../cordis-primer.md#dispatch-modes), et l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcredentials--credentialprovider-abstract-seam"></a>

### `ctx.credentials` — `CredentialProvider` (seam abstrait)

Service abstrait d’informations d’authentification. Les fournisseurs implémentent les quatre opérations sur leurs couches sources. Une règle commune à tout le seam s’impose à chacun : une valeur enregistrée vide est toujours absente. `resolve` l’ignore et `describe` la déclare non configurée, afin qu’une chaîne vide ne puisse jamais passer pour un secret configuré.

```ts cordis-catalog
/**
 * Resolve one reference to its current value. Resolution is per call:
 * consumers re-resolve at each operation and must not cache across
 * operations — that per-operation read is what makes a changed credential
 * reach the next operation without a restart.
 * @param ref - the reference to resolve.
 * @returns the value and its source, or `undefined` while unconfigured.
 */
abstract resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined>

/**
 * Describe one reference for configuration surfaces without exposing the
 * value.
 * @param ref - the reference to describe.
 * @returns configured state, supplying source, and writability.
 */
abstract describe(ref: CredentialRef): Promise<CredentialInfo>

/**
 * Durably store one value in the provider-managed writable source. Rejects
 * while a read-only source shadows the reference — the write would appear
 * to succeed while resolution keeps returning the shadowing value — and
 * rejects an empty value (use {@link unset}).
 * @param ref - the reference to store.
 * @param value - the non-empty secret value.
 */
abstract set(ref: CredentialRef, value: string): Promise<void>

/**
 * Remove one reference from the provider-managed writable source; removing
 * an absent reference is a no-op. Rejects while a read-only source shadows
 * the reference, like {@link set}.
 * @param ref - the reference to remove.
 */
abstract unset(ref: CredentialRef): Promise<void>
```

Source : [`packages/credentials/credentials/src/index.ts:60`](../../packages/credentials/credentials/src/index.ts)

<a id="credentials-events"></a>

### Événements `credentials/*`

<a id="credentialsupdated--emit"></a>

#### `credentials/updated` — emit

Modification validée d’une source d’informations d’authentification gérée par le fournisseur : un `set`, un `unset` ou une modification externe observée dans le stockage. Les changements ambiants de l’environnement du processus ne sont pas observables et n’émettent jamais cet événement. Les échecs des écouteurs sont confinés et journalisés, qu’il s’agisse d’une exception synchrone ou d’un rejet asynchrone, sans modifier le résultat de l’opération validée. Les échecs codés `INVARIANT` font exception : ils sont relancés après l’exécution de tous les écouteurs. Cette relance n’atteint l’émetteur que depuis un écouteur synchrone ; les vérifications de propriétés sur cet événement ne doivent donc pas être des fonctions asynchrones.

```ts cordis-catalog
/**
 * Committed change to a provider-managed credential source: a `set`, an
 * `unset`, or an external edit observed in storage. Ambient
 * process-environment changes are not observable and never emit. Listener
 * failures are contained and logged — a sync throw and an async rejection
 * alike — without changing the committed operation's outcome, except
 * `INVARIANT`-coded failures, which rethrow after every listener ran;
 * that rethrow reaches the emitter only from synchronous listeners, so
 * invariant checks on this event must not be async functions.
 * @param ref - the reference whose stored value changed.
 * @mode emit
 */
'credentials/updated'(ref: CredentialRef): void
```

Source : [`packages/credentials/credentials/src/types.ts:29`](../../packages/credentials/credentials/src/types.ts)
<!-- END GENERATED cordis-surface -->
