# 4. Événements

Les services permettent des appels directs. Les **événements** permettent à un plugin d’annoncer quelque chose sans connaître les plugins qui l’écoutent. LasmeX utilise des événements pour des interactions comme les résultats d’outils, les requêtes aux modèles et les décisions d’approbation.

## Déclarer, émettre et écouter

Créez `stats.ts` dans `tmp/cordis-tutorial` : ce service compte des éléments et annonce chaque modification.

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    stats: StatsService
  }
  interface Events {
    'stats/report'(name: string, count: number): void
  }
}

export class StatsService extends Service {
  private counts = new Map<string, number>()

  constructor(ctx: Context) {
    super(ctx, 'stats')
  }

  bump(name: string) {
    const next = (this.counts.get(name) ?? 0) + 1
    this.counts.set(name, next)
    this.ctx.emit('stats/report', name, next)
  }
}

export const name = 'stats'

export function apply(ctx: Context) {
  ctx.plugin(StatsService)
}
```

La fusion de `interface Events` est le pendant, pour le système d’événements, de la fusion de `interface Context` vue au chapitre 3. Elle déclare le nom de l’événement et la signature de son écouteur, de sorte que `ctx.emit` et `ctx.on` soient entièrement typés. La convention de nommage `namespace/action` conserve la lisibilité de l’espace de noms d’événements, qui reste plat.

Créez `reporter.ts` :

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type {} from './stats.ts'

export const name = 'reporter'
export const inject = ['stats']

export function apply(ctx: Context) {
  ctx.on('stats/report', (name, count) => {
    console.log(`[stats] ${name} -> ${count}`)
  })
  ctx.stats.bump('tool_call')
  ctx.stats.bump('tool_call')
  ctx.stats.bump('prompt')
}
```

La ligne `import type {} from './stats.ts'` n’importe rien à l’exécution ; elle permet à TypeScript de prendre en compte les fusions de déclarations. Composez puis exécutez :

```yaml
- name: './stats.ts'
- name: './reporter.ts'
```

```
[stats] tool_call -> 1
[stats] tool_call -> 2
[stats] prompt -> 1
```

Comme `ctx.on()` est un effet, l’écouteur disparaît avec le plugin. Aucun suivi manuel par `removeListener` n’est nécessaire.

## Modes de répartition

`emit` est l’un des cinq modes de répartition. Le mode employé par un événement fait partie de son contrat : il détermine si les écouteurs peuvent renvoyer des valeurs, s’exécuter en parallèle ou interrompre les écouteurs suivants.

| Mode | Appel | Sémantique |
|---|---|---|
| emit | `ctx.emit(name, ...args)` | Diffusion synchrone ; les promesses et valeurs renvoyées ne sont ni attendues ni collectées. |
| parallel | `await ctx.parallel(name, ...args)` | Tous les écouteurs s’exécutent simultanément, puis sont attendus ensemble. |
| serial | `await ctx.serial(name, ...args)` | Les écouteurs s’exécutent et sont attendus dans l’ordre ; la première valeur autre que `null`, `false` ou `undefined` l’emporte et arrête les suivants. |
| bail | `ctx.bail(name, ...args)` | Version synchrone de serial. |
| waterfall | `ctx.waterfall(name, ...args, next)` | Middleware englobant ; voir ci-dessous. |

Chaque événement de LasmeX documente son mode dans la référence générée de la [page du sous-système](../subsystems/core.md) auquel il appartient.

## Cascade : transformer ou interrompre

Le mode waterfall, ou cascade, permet l’interception. Chaque écouteur reçoit les arguments ainsi qu’une continuation `next()`. Il peut transformer la valeur renvoyée par `next()`, ou renvoyer directement sans appeler `next()` et interrompre le reste de la chaîne — ce que la documentation Cordis appelle le veto. Créez `waterfall-demo.ts` :

```ts
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'demo/transform'(input: string, next: () => Promise<string>): Promise<string>
  }
}

export const name = 'waterfall-demo'

export function apply(ctx: Context) {
  // Listener 1: wrap the downstream result.
  ctx.on('demo/transform', async (input, next) => {
    const downstream = await next()
    return downstream.toUpperCase()
  })

  // Listener 2: short-circuit when it owns the decision.
  ctx.on('demo/transform', async (input, next) => {
    if (input.includes('blocked')) return '** blocked **'
    return next()
  })

  void (async () => {
    console.log(await ctx.waterfall('demo/transform', 'hello', async () => 'hello'))
    console.log(await ctx.waterfall('demo/transform', 'blocked words', async () => 'blocked words'))
  })()
}
```

Faites pointer `cordis.yml` uniquement vers ce fichier, puis exécutez :

```
HELLO
** BLOCKED **
```

Suivons la seconde ligne. L’écouteur 1 s’exécute en premier et appelle `next()`, ce qui invoque l’écouteur 2. Celui-ci repère `blocked` et renvoie sa valeur sans appeler `next()` : l’implémentation par défaut la plus interne, passée à `ctx.waterfall`, n’est jamais exécutée. En remontant, l’écouteur 1 convertit le message de remplacement en majuscules.

La règle qui en découle est la suivante : **un écouteur waterfall qui se contente d’observer ou d’annoter doit appeler `next()`**. Un retour sans cet appel constitue une interruption volontaire. Oublier `next()` dans un écouteur de journalisation supprime silencieusement le comportement par défaut de tous les éléments en aval. C’est une règle permanente du dépôt ([sémantique waterfall](../cordis-primer.md#cordis-waterfall-semantics)).

LasmeX emploie les cascades pour les décisions que des plugins coopérants peuvent envelopper ou traiter : [`agent/request`](../subsystems/core.md#agentrequest--waterfall) permet à un plugin de remplacer la configuration de l’appel au modèle, et [`approval/request`](../subsystems/approval.md#approvalrequest--waterfall) permet à une politique de répondre à la place de l’utilisateur.

Suite : [Configuration](05-config.md) — les options de plugins provenant de `cordis.yml`.

[![](https://img.shields.io/badge/powered_by-LasmeX-4D6BFE?style=flat-square)](https://github.com/lasme-ephrem/LasmeX)
