# 3. Services

Un **service** est une capacité nommée qu’un plugin fournit et que d’autres plugins consomment par l’intermédiaire de `ctx`. Dans LasmeX, `ctx.tools`, `ctx.llm` et `ctx.agents` sont des services. Un consommateur nomme la capacité, par exemple `'tools'`, au lieu d’importer son fournisseur ; la configuration peut ainsi sélectionner un fournisseur sans modifier le consommateur.

## Fournir un service

Créez `greeter.ts` dans `tmp/cordis-tutorial` :

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}

export class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')
  }

  greet(who: string) {
    return `Hello, ${who}!`
  }
}

export const name = 'greeter'

export function apply(ctx: Context) {
  ctx.plugin(GreeterService)
}
```

Deux éléments fonctionnent ensemble :

- **À l’exécution** : `super(ctx, 'greeter')` enregistre l’instance sous le nom `greeter`. Dès lors, tous les plugins peuvent y accéder par `ctx.greeter`. L’enregistrement est un effet : le déchargement du fournisseur supprime le service.
- **À la compilation** : le bloc `declare module '@deepseek-ai/cordis'` utilise la fusion de déclarations TypeScript. Il ajoute `greeter` à l’interface `Context` afin que `ctx.greeter` soit correctement typé partout. Il ne génère aucun code : sans lui, le service fonctionne toujours à l’exécution, mais les consommateurs perdent la sûreté du typage.

Une sous-classe de `Service` est elle-même un plugin, sous la forme fondée sur une classe présentée au chapitre 1 ; `ctx.plugin(GreeterService)` la monte donc comme n’importe quel autre plugin.

## Consommer un service avec `inject`

Créez `consumer.ts` :

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'consumer'
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(ctx.greeter.greet('world'))
}
```

`inject` énumère les services requis par ce plugin. Cordis maintient le plugin dans l’état PENDING jusqu’à ce que tous les services indiqués existent ; dans `apply`, vous avez donc la garantie que `ctx.greeter` est prêt. L’ordre de chargement dans `cordis.yml` n’a aucune importance : ce sont les dépendances, et non l’ordre des fichiers, qui déterminent le démarrage des plugins.

Composez et exécutez l’application :

```yaml
- name: './greeter.ts'
- name: './consumer.ts'
```

```
Hello, world!
```

Inversez les deux lignes de `cordis.yml` et relancez la commande : le résultat est identique. Supprimez ensuite entièrement `./greeter.ts` : le consommateur reste dans l’état PENDING et n’affiche rien, sans planter ni s’exécuter partiellement. Une fiber PENDING ne maintient pas non plus la boucle d’événements de Node active ; une composition sans autre tâche se termine donc silencieusement avec un code de sortie égal à 0. Le [chapitre 6](06-composition-and-hmr.md) explique comment diagnostiquer cet état.

## Les dépendances restent suivies après le chargement

`inject` n’est pas une vérification ponctuelle au démarrage. Si un service requis disparaît pendant l’exécution de l’application — parce que son fournisseur est déchargé ou remplacé à chaud — tous les plugins qui en dépendent sont également déchargés, puis se rechargent lorsque le service revient. Combiné aux effets ([chapitre 2](02-lifecycle-and-effects.md)), ce mécanisme empêche un consommateur actif de conserver une référence vers un service indisponible : ses propres enregistrements sont annulés lorsque la dépendance disparaît.

C’est également ce qui permet de remplacer un service depuis la configuration : déchargez l’entrée `lasmex-bash-local`, montez un autre fournisseur de `shell`, et tous les plugins qui injectent `'shell'` redémarrent proprement avec la nouvelle implémentation.

## Dépendances facultatives

`inject` sert aux exigences strictes. Pour une capacité dont le plugin peut se passer, omettez `inject` et vérifiez sa présence au point d’utilisation :

```ts ignore-check
export function apply(ctx: Context) {
  // undefined when no provider is loaded; the plugin still runs.
  const greeter = ctx.get('greeter')
  console.log(greeter?.greet('maybe') ?? 'no greeter available')
}
```

## Nommage

Les noms de services occupent un seul espace de noms plat par application. Préfixez ou placez vos propres services dans un espace de noms distinctif, car LasmeX réserve des noms simples comme `tools` et `llm` ; les régions `cordis-surface` générées sur les [pages des sous-systèmes](../subsystems/core.md) recensent tous les noms enregistrés par LasmeX.

Suite : [Événements](04-events.md) — communiquer sans service partagé.

[![](https://img.shields.io/badge/powered_by-LasmeX-4D6BFE?style=flat-square)](https://github.com/lasme-ephrem/LasmeX)
