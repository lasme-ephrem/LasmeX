# Plugins et cycle de vie

Cette page décrit le modèle de plugin Cordis et sa machine à états de cycle de vie.

## Machine à états des fibers

Chaque plugin chargé possède une portée **Fiber** qui traverse les états suivants :

```
PENDING → LOADING → ACTIVE
                 ↘ FAILED
ACTIVE → UNLOADING → DISPOSED
```

| État | Signification |
|------|------|
| PENDING | Le plugin est déclaré, mais ses dépendances requises ne sont pas prêtes |
| LOADING | Les dépendances sont prêtes et `apply` est en cours d’exécution |
| ACTIVE | Le plugin est actif |
| FAILED | `apply` a levé une erreur |
| UNLOADING | Le plugin est en cours de déchargement et libère ses ressources |
| DISPOSED | Le plugin est entièrement déchargé |

## Chargement piloté par les dépendances

Un plugin doté de `inject` attend que chaque service requis soit disponible avant de se charger :

```ts ignore-check
export const inject = ['tools', 'llm']

export function apply(ctx: Context) {
  // ctx.tools and ctx.llm are ready here.
}
```

Si un service requis disparaît, par exemple lors du remplacement de son fournisseur, le plugin est automatiquement déchargé (ACTIVE → DISPOSED), puis rechargé lorsque le service revient.

## Nettoyage automatique

Chaque enregistrement effectué par `ctx` est annulé lorsque le plugin est déchargé :

```ts ignore-check
export function apply(ctx: Context) {
  // Event listener: removed automatically on unload.
  ctx.on('some-event', handler)

  // Custom resource: the returned disposer runs on unload.
  ctx.effect(() => {
    const connection = createConnection()
    return () => connection.close()
  })
}
```

Le framework suit et libère toutes les opérations suivantes :

- `ctx.on(event, handler)` — écouteur d’événement
- `ctx.tools.register(tool)` — enregistrement d’un outil
- `ctx.llm.registerAdapter(names, adapter)` — enregistrement d’un adaptateur LLM
- `ctx.effect(() => cleanup)` — ressource personnalisée

Lors du déchargement, l’appel des fonctions de libération commence dans l’ordre inverse de leur enregistrement. Plusieurs fonctions asynchrones s’exécutent toutefois en parallèle, sans garantie d’ordre de fin. Regroupez tout nettoyage ordonné dans la fonction de libération d’un unique `ctx.effect()`, puis attendez ses étapes l’une après l’autre.

## Contextes imbriqués

`ctx.plugin()` crée une fiber enfant qui hérite du contexte parent tout en possédant son propre cycle de vie :

```ts ignore-check
export function apply(ctx: Context) {
  // Register a child plugin.
  ctx.plugin(childPlugin)

  // The child has its own Fiber and unloads with its parent.
}
```

## Sémantique de dispose

Pour arrêter une instance de plugin avant son terme :

```ts
import type { Context } from '@deepseek-ai/cordis'

declare const ctx: Context
declare function myPlugin(ctx: Context): void

const fiber = ctx.plugin(myPlugin)

// Dispose it manually later.
await fiber.dispose()
```

`dispose` garantit les propriétés suivantes :

1. Tous les enregistrements appartenant au plugin sont supprimés.
2. Les plugins enfants sont déchargés récursivement.
3. La promesse renvoyée est résolue après la fin de tous les nettoyages asynchrones.

## Remplacement à chaud (HMR)

Lorsque `@deepseek-ai/cordis-plugin-hmr` est chargé depuis `cordis.yml`, la modification du fichier source d’un plugin déclenche :

1. le déchargement de l’ancien plugin et le nettoyage de ses enregistrements ;
2. le chargement du nouveau code ;
3. l’exécution du nouvel `apply`.

Comme les enregistrements d’un plugin se nettoient eux-mêmes, le remplacement à chaud ne conserve rien de l’ancienne instance.

## Exemple de cycle de vie

```ts ignore-check
export function apply(ctx: Context) {
  console.log('plugin loading')

  ctx.effect(() => {
    console.log('effect registered')
    return () => console.log('effect cleaned up')
  })
}
```

Le chargement affiche :

```
plugin loading
effect registered
```

Le déchargement affiche :

```
effect cleaned up
```

## Étapes suivantes

- [Services et dépendances](./service.md) — exposer une capacité à d’autres plugins
- [Système d’événements](./events.md) — faire communiquer les plugins
- [Tutoriel Cordis](../../../cordis-tutorial/index.md) — construire pas à pas le même cycle de vie, les mêmes services et les mêmes événements sur le runtime Cordis
