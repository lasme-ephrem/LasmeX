# Enregistrements limités à une portée

Le [package de gestion des portées](../../packages/core/scope) fournit les identités, les supports de routage et les couches de registre qui permettent à un même contexte d’enregistrement d’exprimer à la fois la visibilité propre à un agent et la propriété d’un cycle de vie partagé. Il s’agit d’une primitive de bibliothèque, pas d’un service Cordis. L’[Agent Note sur la conception du runtime agent-scope](../../.agents/notes/implemented/architecture/2026-07-12-agent-scope-runtime-design.md#scope-routing-one-opaque-key-selects-one-layer) explique le cycle de vie, l’[Agent Note sur le stockage partagé](../../.agents/notes/implemented/architecture/2026-07-12-scoped-layers-store.md) décrit le choix des couches de registre et le [README du package](../../packages/core/scope/README.md) présente l’API appelable et la sémantique du filtrage.

Sources : [`packages/core/scope/src/index.ts`](../../packages/core/scope/src/index.ts) et [`packages/core/scope/src/store.ts`](../../packages/core/scope/src/store.ts).

## Identité et support de routage

`ScopeKey` est une identité d’objet opaque. La boucle fournie utilise l’objet `Agent` actif comme propre clé, mais la primitive n’examine jamais cet objet.

```ts type-equiv
/** An opaque, identity-compared scope key. */
type ScopeKey = object
```

`Scoped<T>` est la marque statique appliquée au destinataire de routage opaque renvoyé par `scopeTarget(base, key)`. Les déclarations d’événements filtrés par portée exigent ce support comme type de `this`, tandis que le véritable sujet de l’événement reste un argument explicite.

```ts type-equiv
/**
 * A routing-only event receiver built by {@link scopeTarget}. The type
 * parameter records the subject type for dispatch checking; the carrier does
 * not expose the subject's properties. Event payloads carry the real subject.
 */
type Scoped<T extends object> = object & { readonly [ScopedBrand]: T }
```

## Contexte d’enregistrement propriétaire

`Scope` associe le contexte d’enregistrement étiqueté à deux mécanismes de nettoyage. `rawDispose` conserve l’identité exacte du disposer Cordis nécessaire à un effet composite ordonné. `dispose()` est le point d’attente public et partagé qui garantit la fin du nettoyage pour les appels directs ou concurrents.

```ts type-equiv
/** A minted registration scope and its quiescent disposal boundaries. */
interface Scope {
  /** Context through which scope-owned registrations are made. */
  ctx: Context
  /** Exact Cordis disposer, used when nesting this scope in an ordered composite effect. */
  rawDispose: () => Promise<void> | void
  /** Dispose every scope-owned registration; racing calls await the same completion. */
  dispose(): Promise<void>
}
```

## Couche de registre à portée limitée

`ScopeLayer` représente la contribution complète d’un registre au niveau global ou pour une portée exacte. Une couche concrète peut agréger plusieurs tables nommées et anonymes. Le fait de tester le vide sur la couche entière permet à `ScopedLayers` de récupérer l’état d’une portée sans supprimer une table sœur.

```ts type-equiv
/** One scope's aggregate contribution to a registry. */
interface ScopeLayer {
  /** Whether every table in this layer is empty. */
  isEmpty(): boolean
}
```

`ScopedLayers<L>` possède la couche globale créée immédiatement et les couches de portée exacte créées à la demande. Les lectures ne créent pas de couche : `peek(undefined)` signifie qu’il n’existe aucune surcouche, tandis que `merge()` matérialise d’abord les entrées globales nommées dans leur ordre d’insertion, puis leurs remplacements propres à la portée. Les enregistrements utilisent un seul contexte pour la visibilité et la propriété des effets Cordis, récupèrent une fonction d’annulation synchrone avant une éventuelle notification, renvoient le disposer Cordis exact et ne libèrent une couche de portée que lorsque son `ScopeLayer` complet est vide.

`NamedEntries<V>` fournit une recherche ordonnée par insertion et une itération en direct, les erreurs de doublon restant à la charge de l’appelant. `AnonymousEntries<V>` attribue une identité unique à chaque ajout afin que des valeurs égales restent indépendantes. L’itération reste en direct pendant une génération non vide d’une table ; vider la table détache les itérateurs existants des insertions ultérieures. Les deux renvoient des opérations d’annulation idempotentes limitées à l’entrée exacte. L’interface d’implémentation partagée `EntryValues` n’est pas publique.
