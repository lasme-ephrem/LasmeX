# 2. Cycle de vie et effets

Un plugin Cordis peut être déchargé à la suite d’une modification de configuration, d’un rechargement à chaud, d’une libération explicite ou de la disparition d’un service requis. Les enregistrements effectués par les API Cordis sont des effets : Cordis les annule lorsque le plugin qui les possède est déchargé. Les ressources gérées en dehors de ces API doivent être encapsulées dans `ctx.effect()`.

## Effets

Pour une ressource que Cordis ne gère pas déjà — timer, connexion ou watcher — encapsulez-la dans `ctx.effect()` et renvoyez une fonction de libération.

Créez `lifecycle.ts` dans `tmp/cordis-tutorial` :

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'lifecycle-demo'

function heartbeat(ctx: Context) {
  console.log('heartbeat plugin loading')
  ctx.effect(() => {
    const timer = setInterval(() => console.log('tick'), 200)
    return () => {
      clearInterval(timer)
      console.log('heartbeat cleaned up')
    }
  })
}

export function apply(ctx: Context) {
  // Mount a child plugin and keep its fiber to dispose it later.
  const fiber = ctx.plugin(heartbeat)
  // The demo timer is itself an effect: if THIS plugin is unloaded first,
  // the pending callback is cancelled instead of firing on a dead app.
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      await fiber.dispose()
      console.log('disposed')
      process.exit(0)
    }, 700)
    return () => clearTimeout(timer)
  })
}
```

Faites pointer `cordis.yml` vers ce fichier :

```yaml
- name: './lifecycle.ts'
```

Exécutez la commande (`node --import tsx ../../vendor/cordis/bin.js`) pour obtenir :

```
heartbeat plugin loading
tick
tick
tick
heartbeat cleaned up
disposed
```

Trois points sont à retenir :

- `ctx.plugin(heartbeat)` monte une fonction **depuis le code** en tant que plugin, comme le Loader YAML le fait pour chaque entrée de configuration. Un plugin fonction n’a pas besoin de méthode `apply` : Cordis appelle directement la fonction et utilise son nom seulement dans les diagnostics. La méthode `apply` est requise uniquement pour la forme objet, `ctx.plugin({ apply(ctx) { /* ... */ } })`. L’appel renvoie une **fiber**, c’est-à-dire la référence d’exécution d’une instance de plugin chargée.
- Le corps de l’effet s’exécute pendant le chargement ; la fonction de libération qu’il renvoie s’exécute pendant le déchargement. Vous n’appelez jamais vous-même cette fonction pour une ressource liée au cycle de vie du plugin.
- `fiber.dispose()` se résout une fois toutes les ressources du plugin libérées, y compris par les fonctions de libération asynchrones, et décharge récursivement tous les plugins enfants qu’il a montés.

## La machine à états d’une fiber

Chaque instance de plugin chargée possède une fiber qui traverse les états suivants :

```
PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED
                 ↘ FAILED
```

- **PENDING** — le plugin est déclaré, mais un service requis (chapitre 3) n’est pas encore disponible.
- **LOADING / ACTIVE** — `apply` est en cours d’exécution ou s’est terminé.
- **FAILED** — `apply` ou la validation de la configuration a levé une exception.
- **UNLOADING / DISPOSED** — les fonctions de libération s’exécutent ou toutes les ressources ont été libérées.

Vous retrouverez l’état PENDING au [chapitre 6](06-composition-and-hmr.md), où il explique généralement pourquoi un plugin n’affiche rien.

## Ce qui constitue déjà un effet

Vous avez rarement besoin d’écrire vous-même `ctx.effect()`, car les API d’enregistrement intégrées sont déjà des effets :

- `ctx.on(event, listener)` — le listener est supprimé au déchargement ([chapitre 4](04-events.md)).
- `ctx.plugin(child)` — l’enfant est libéré avec son parent.
- Les enregistrements de services sont des effets. Les registres LasmeX comme `ctx.tools.register(...)` rattachent également les fonctions de libération qu’ils renvoient au plugin appelant, ce qui les annule automatiquement ([chapitre 7](07-into-the-harness.md)).

Pour une ressource que Cordis ne gère pas, obtenez-la à l’intérieur de `ctx.effect()` et renvoyez une fonction qui la libère. Cordis appelle alors cette fonction pendant le déchargement, y compris lors d’un remplacement à chaud.

Attention à l’ordre : les fonctions de libération commencent dans l’ordre inverse de leur enregistrement, mais plusieurs fonctions **asynchrones** s’exécutent simultanément. Lorsque les étapes du nettoyage doivent rester séquentielles, regroupez-les dans une seule fonction de libération et attendez-y chaque étape.

Suite : [Services](03-services.md) — la manière dont les plugins partagent des capacités.

[![](https://img.shields.io/badge/powered_by-LasmeX-4D6BFE?style=flat-square)](https://github.com/lasme-ephrem/LasmeX)
