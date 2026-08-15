# Créer un outil

Ce tutoriel ajoute un outil `greet` à l’interface Web. Terminez d’abord [Votre premier plugin](./) et conservez son répertoire `scratch-plugin`.

## Créer le plugin de l’outil

Remplacez le contenu de `scratch-plugin/src/my-plugin.ts` par :

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from 'lasmex-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',
    parameters: {
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))
}
```

`inject` demande à Cordis d’attendre le registre des outils. `defineTool` déduit et valide `args` à partir de `parameters` ; `execute` renvoie la valeur canonique déclarée par `output.schema`, puis `output.render` convertit cette valeur en contenu destiné au modèle.

## Lancer et appeler l’outil

Relancez la commande de développement si elle n’est plus active :

```sh
pnpm lasmex web --patch ./scratch-plugin/cordis.yml
```

Ouvrez `http://127.0.0.1:3080` et demandez : `Use the greet tool to greet Ada.` Le modèle peut appeler `greet` et reçoit `Hello, Ada!` comme résultat de l’outil.

## Étapes suivantes

- [Configuration d’un plugin](./config.md) — rendre le message d’accueil configurable.
- [Référence de création des outils](../../../cookbook/adding-a-tool.md) — consulter les schémas imbriqués, valeurs canoniques, tâches en arrière-plan, contrôles de politique, Code Mode et cartes d’interface.
- [Découpage des capacités](../practice/) — répartir une capacité remplaçable entre des packages Service Definition, Service Provider et Consumer.
