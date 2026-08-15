# 7. Entrer dans le harness

Ce chapitre enregistre auprès du service `tools` du harness un outil que le modèle peut appeler, l’exécute dans le pipeline d’outils du harness, puis observe l’événement de résultat. Il ne requiert aucune clé et n’appelle aucun modèle.

## Un plugin d’outil

Créez `greet-tool.ts` dans `tmp/cordis-tutorial` :

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from 'lasmex-tools'
import { CallId } from 'lasmex-llm'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))

  // Drive one call through the real execution pipeline, standing in for
  // the model. CallId brands the correlation id a provider would issue.
  void (async () => {
    const result = await ctx.tools.execute({
      callId: CallId('demo-1'),
      name: 'greet',
      arguments: { name: 'Cordis' },
      signal: new AbortController().signal,
    })
    console.log('tool replied:', JSON.stringify(result.content))
  })()
}
```

Chaque mécanisme présenté ici vient des chapitres précédents : `inject: ['tools']` ([chapitre 3](03-services.md)) maintient le plugin en attente jusqu’à ce que le registre d’outils existe ; `ctx.tools.register(...)` rattache le disposer de l’enregistrement au plugin ([chapitre 2](02-lifecycle-and-effects.md)), de sorte que le déchargement désenregistre l’outil. `defineTool` convertit la spécification `parameters` en JSON Schema présenté au modèle, infère le type de `args` et valide les arguments fournis par le modèle avant l’exécution de `execute`. L’outil renvoie la valeur canonique déclarée par `output.schema` ; `output.render` produit séparément le contenu Native et durable du résultat.

## Un plugin observateur

Créez `tool-logger.ts`, un plugin distinct qui observe chaque appel d’outil de l’application au moyen de l’événement `tools/result` du harness :

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from 'lasmex-tools'

export const name = 'tool-logger'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    const text = result.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
    console.log(`[tool-logger] ${exec.name} -> ${text}`)
  })
}
```

La ligne `import type {} from 'lasmex-tools'` charge les fusions de déclarations du package afin que `'tools/result'` et son payload soient typés : c’est le même procédé que l’import de `stats.ts` au chapitre 4, appliqué à l’échelle d’un package.

## Composer et exécuter

```yaml
- name: 'lasmex-system-prompt'
- name: 'lasmex-tools'
- name: './tool-logger.ts'
- name: './greet-tool.ts'
```

`lasmex-tools` injecte le service `systemPrompt`, car les outils ajoutent leurs schémas au prompt système ; la composition doit donc également déclarer son fournisseur. Sans lui, le plugin d’outils reste PENDING, comme l’explique le [chapitre 6](06-composition-and-hmr.md).

```sh
node --import tsx ../../vendor/cordis/bin.js
```

```
[tool-logger] greet -> Hello, Cordis!
tool replied: [{"type":"text","text":"Hello, Cordis!"}]
```

Le logger s’exécute en premier : `tools/result` est émis pendant la matérialisation du résultat, avant que la promesse de `execute` ne soit résolue pour l’appelant. Aucun de vos plugins ne connaît l’existence de l’autre ; le service de registre et l’événement les relient.

## Passer à un agent complet

Un véritable agent correspond à cette composition enrichie d’autres plugins : un adaptateur LLM, l’agent loop, la persistance et un point d’entrée. Comparez-la à [examples/headless-agent/cordis.yml](../../examples/headless-agent/cordis.yml), dont vous pouvez maintenant comprendre chaque entrée. Ajoutez votre `greet-tool.ts` à une copie de ce fichier.

Pour poursuivre :

- [Créer un outil](../user/develop/basic/tool.md) — approfondir `defineTool`, notamment la présentation et les schémas plus riches.
- [Conception de capacités en trois couches](../user/develop/practice/index.md) — comprendre comment le harness structure les capacités remplaçables.
- Les régions `cordis-surface` générées des [pages de sous-systèmes](../subsystems/core.md) — découvrir tout ce que vous pouvez injecter et écouter, sur la page qui en est propriétaire.
- [Architecture](../architecture.md) — consulter la carte du système dans lequel vivent ces plugins.

[![](https://img.shields.io/badge/powered_by-LasmeX-4D6BFE?style=flat-square)](https://github.com/lasme-ephrem/LasmeX)
