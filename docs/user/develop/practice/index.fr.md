# Concevoir une capacité en trois rôles

Cette page comporte deux parties : une référence conceptuelle sur le modèle de capacité en trois rôles, puis un tutoriel avancé qui construit une capacité. Terminez d’abord le [parcours élémentaire sur les plugins](../basic/) et le [tutoriel sur les services](../framework/service.md).

## Référence conceptuelle

Lorsqu’une capacité est assez générale pour nécessiter des fournisseurs remplaçables, comme l’exécution Bash, LasmeX sépare trois rôles : une **Service Definition**, un **Service Provider** et un **Consumer**. Placez ces rôles dans des packages distincts lorsqu’ils doivent évoluer ou être remplacés indépendamment ; sinon, un même package peut posséder plusieurs rôles. L’ensemble de la capacité constitue le seam. Aucun rôle isolé ne constitue un seam.

## Exemple de Bash

La capacité d’exécution Bash se compose de :

- **Service Definition** (`lasmex-shell`) — définit le service Cordis et les types de requête et de résultat Bash
- **Service Provider** (`lasmex-bash-local`) — exécute les commandes sur la machine locale
- **Consumer** (`lasmex-tool-bash`) — expose la capacité sous forme d’outil appelable par le modèle

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  lasmex-shell   │────▶│  lasmex-bash-local  │     │ lasmex-tool-bash│
│(definition) │     │    (provider)     │     │(consumer/tool)│
└─────────────┘     └──────────────────┘     └──────────────┘
       ▲                                            │
       └────────────────────────────────────────────┘
                    inject: ['shell']
```

## Avantages de cette séparation

### Remplacer les fournisseurs

Une Service Definition peut avoir plusieurs fournisseurs sélectionnés dans `cordis.yml` :

```yaml
# Local execution
- name: 'lasmex-bash-local'

# Replace this row with another package that provides the same service.
```

La Service Definition et l’outil restent inchangés lorsque le fournisseur est remplacé.

### Évoluer indépendamment

- La Service Definition change rarement une fois que des appelants dépendent de son contrat.
- Les Service Providers peuvent améliorer indépendamment leurs performances et leur sécurité.
- Les Consumers peuvent modifier la manière dont ils présentent la capacité au modèle.

### Découpler les dépendances

- Le Service Provider dépend de la Service Definition.
- Le Consumer dépend de la Service Definition.
- Le Service Provider et le Consumer **ne dépendent pas l’un de l’autre**.

La [référence des capability seams](../../../capability-seams.md) recense les familles intégrées actuelles et les liens vers leurs packages.

## Tutoriel : développer une capacité en trois rôles

### Étape 1 : écrire la Service Definition

```ts ignore-check
// packages/my-cap/my-cap/src/index.ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    myCap: MyCapService
  }
}

export abstract class MyCapService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myCap')
  }

  /** Execute the capability. */
  abstract execute(request: MyCapRequest): Promise<MyCapResult>
}

export interface MyCapRequest {
  input: string
}

export interface MyCapResult {
  output: string
}
```

### Étape 2 : écrire un Service Provider

```ts ignore-check
// packages/my-cap/my-cap-local/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { MyCapService, type MyCapRequest, type MyCapResult } from 'lasmex-my-cap'

class MyCapLocal extends MyCapService {
  async execute(request: MyCapRequest): Promise<MyCapResult> {
    // Local provider behavior.
    return { output: request.input.toUpperCase() }
  }
}

export const name = 'my-cap-local'

export function apply(ctx: Context) {
  ctx.plugin(MyCapLocal)
}
```

### Étape 3 : écrire un Consumer

```ts ignore-check
// packages/my-cap/tool-my-cap/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from 'lasmex-tools'

export const name = 'tool-my-cap'
export const inject = ['tools', 'myCap']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'my_cap',
    description: 'Execute my capability.',
    parameters: {
      input: { type: 'string', required: true },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const result = await ctx.myCap.execute({ input: args.input })
      return result.output
    },
  }))
}
```

### Les composer dans cordis.yml

```yaml
- name: 'lasmex-my-cap-local'
- name: 'lasmex-tool-my-cap'
```

## Points de conception

- **Ne séparez pas les rôles par anticipation** — utilisez des packages distincts uniquement lorsqu’ils doivent évoluer indépendamment. Un plugin d’outil simple n’en a pas besoin.
- **La Service Definition possède les types Request/Result** — les Service Providers et Consumers dépendent uniquement du package de la Service Definition.
- **Explicite > implicite** — résolvez les valeurs par défaut dans une étape explicite `resolve(request): Spec`, au lieu de dissimuler des expressions `?? default` dans `run()`.

## Étape suivante

- [Adaptateur LLM](./llm-adapter.md) — implémenter un fournisseur LLM
