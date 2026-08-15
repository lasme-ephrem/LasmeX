# Votre premier plugin

Ce tutoriel crée un plugin minimal pour LasmeX et le charge dans l’interface Web. Partez d’un checkout du dépôt sur lequel le [lancement depuis les sources](../../../../README.md#run-from-source) a été effectué.

## Créer un projet local

Depuis la racine du dépôt, créez un projet temporaire pour ce tutoriel :

```sh
mkdir -p scratch-plugin/src
```

## Qu’est-ce qu’un plugin ?

Dans LasmeX, un plugin est un module TypeScript qui exporte une fonction `apply`. Le framework appelle `apply` lors du chargement du plugin et lui transmet un objet de contexte `ctx`, par lequel le plugin enregistre ses capacités :

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'

export function apply(ctx: Context) {
  // Register capabilities here.
}
```

Cela constitue toute la configuration nécessaire.

## Créer le fichier du plugin

Créez `scratch-plugin/src/my-plugin.ts` :

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello-plugin'

export function apply(ctx: Context) {
  // Required dependencies are ready before apply runs.
  console.log('[hello-plugin] plugin loaded!')
}
```

## L’enregistrer dans cordis.yml

Exécutez `pwd` depuis la racine du dépôt, puis créez `scratch-plugin/cordis.yml` comme overlay Web qui insère le plugin local. Remplacez `/absolute/path/to/LasmeX` ci-dessous par le chemin affiché :

```yaml
- insert:
    - id: hello
      name: '/absolute/path/to/LasmeX/scratch-plugin/src/my-plugin.ts'
```

Le chemin du plugin doit être absolu. Un fichier patch ajoute de la configuration, mais ne change pas le répertoire du profil depuis lequel le chargeur résout les chemins de modules.

Lancez l’interface Web avec cet overlay :

```sh
pnpm lasmex web --patch ./scratch-plugin/cordis.yml
```

Ouvrez `http://127.0.0.1:3080`. Au démarrage, le terminal affiche `[hello-plugin] plugin loaded!`.

## Nettoyage automatique

Tout ce qui est enregistré par `ctx` — écouteurs d’événements, outils ou timers — est nettoyé lorsque le plugin est déchargé. Vous n’avez pas à appeler manuellement removeListener ou clearInterval.

Pour une ressource qui nécessite un nettoyage explicite, telle qu’une connexion réseau, utilisez `ctx.effect()` afin de fournir sa fonction de libération :

```ts
import type { Context } from '@deepseek-ai/cordis'

export function apply(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => {
      console.log('heartbeat')
    }, 5000)

    // The returned function runs when the plugin unloads.
    return () => clearInterval(timer)
  })
}
```

## Déclarer les dépendances

Si le plugin consomme un autre service, tel que `tools` ou `llm`, déclarez-le dans `inject` :

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-tool-plugin'
export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools is ready here.
  ctx.tools.register(/* ... */)
}
```

Le framework attend que tous les services requis soient disponibles avant de charger le plugin.

## Trois formes de plugin

Outre un module fonction, un plugin peut prendre la forme d’un objet ou d’une classe.

### Forme objet

```ts
import type { Context } from '@deepseek-ai/cordis'

export default {
  name: 'my-plugin',
  inject: ['tools'],
  apply(ctx: Context) {
    // ...
  },
}
```

### Forme classe

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MyService extends Service {
  static inject = ['tools']

  constructor(ctx: Context) {
    super(ctx, 'myService')
    // Perform synchronous initialization in the constructor.
  }
}
```

La forme fonction suffit dans la plupart des cas. Utilisez une classe lorsque le plugin fournit un service à d’autres plugins ; consultez [Services et dépendances](../framework/service.md).

## Étapes suivantes

- [Créer un outil](./tool.md) — découvrir le DSL de définition des outils
- [Configuration d’un plugin](./config.md) — accepter une configuration utilisateur
- [Tutoriel Cordis](../../../cordis-tutorial/index.md) — découvrir le framework de plugins sous-jacent depuis un répertoire vierge, sans clé API
