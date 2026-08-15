# Système d’événements

Les événements sont le principal mécanisme de communication entre les plugins Cordis. LasmeX les utilise largement pour offrir des points d’extension faiblement couplés.

## Utilisation élémentaire

### Écouter un événement

```ts ignore-check
ctx.on('event-name', (payload) => {
  // Handle the event.
})
```

### Émettre un événement

```ts ignore-check
ctx.emit('event-name', payload)
```

## Modes d’événement

Cordis propose plusieurs modes adaptés à différents contrats d’interaction.

### emit — diffusion

Tous les écouteurs s’exécutent de façon synchrone et leurs valeurs de retour sont ignorées :

```ts ignore-check
// Emit
ctx.emit('my-plugin/ready', { id: 'worker-1' })

// Listen
ctx.on('my-plugin/ready', ({ id }) => {
  console.log(`${id} is ready`)
})
```

### bail — arrêt anticipé

Les écouteurs s’exécutent dans l’ordre ; le premier résultat différent de `null`, `false` ou `undefined` devient le résultat final :

```ts ignore-check
// Dispatch
const result = ctx.bail('some-check', input)

// Listen: a returned value stops later listeners.
ctx.on('some-check', (input) => {
  if (shouldBlock(input)) return 'blocked'
  // Return null, false, or undefined to continue to the next listener.
})
```

### serial — exécution ordonnée

Les écouteurs s’exécutent dans leur ordre d’enregistrement et les résultats asynchrones sont attendus. Le premier résultat différent de `null`, `false` ou `undefined` interrompt l’exécution :

```ts ignore-check
await ctx.serial('setup-phase', context)
```

### waterfall — pipeline

Chaque écouteur peut envelopper le résultat en aval afin de former une chaîne de traitement. Un écouteur **doit appeler `next()` pour déléguer en aval** ; omettre cet appel interrompt le pipeline :

```ts ignore-check
// Dispatch
const output = await ctx.waterfall('my-plugin/transform', input, async () => input)

// Listen: next() is mandatory.
ctx.on('my-plugin/transform', async (_input, next) => {
  const downstream = await next()
  return downstream.trim()
})
```

::: warning
Un écouteur waterfall **doit appeler `next()`**. L’omettre interrompt volontairement le pipeline, ce qui permet les comportements d’interception et de passerelle.
:::

## Événements typés

LasmeX utilise la fusion de déclarations TypeScript pour typer les événements :

```ts
import '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'my-plugin/ready': (payload: { id: string }) => void
    'my-plugin/check': (input: string) => boolean | undefined
    'my-plugin/transform': (input: string, next: () => Promise<string>) => Promise<string>
  }
}

// ctx.on('my-plugin/ready', ...) and ctx.emit('my-plugin/ready', ...)
// are now inferred correctly.
```

## Événements Cordis et enregistrements de session

Les événements Cordis de LasmeX portent des noms `namespace/action`, notamment `agent/step`, `agent/request`, `agent/request-error`, `tools/result` et `session/event`. Les régions `cordis-surface` générées sur les [pages des sous-systèmes](../../../subsystems/core.md) décrivent leurs signatures et modes complets.

`turn/*`, `step/*`, `tool/call`, `tool/result` et `compaction/*` sont des types d’événements de session durables, pas des événements Cordis portant le même nom. Pour les observer, écoutez `session/event` et examinez `event.type`.

## Les écouteurs d’événements sont des effets

Un écouteur enregistré avec `ctx.on()` est automatiquement supprimé lors du déchargement de son plugin :

```ts ignore-check
export function apply(ctx: Context) {
  // This listener is removed when the plugin disposes.
  ctx.on('tools/result', handler)
}
```

## Exemple : plugin de journalisation

Ce plugin journalise les appels d’outils et leurs résultats :

```ts
import type { Context } from '@deepseek-ai/cordis'
import 'lasmex-tools'

export const name = 'tool-logger'

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    console.log(`[tool] ${exec.name}(${JSON.stringify(exec.arguments)})`)
    const text = result.content
      .map(block => block.type === 'text' ? block.text : '')
      .join('')
    console.log(`[tool result] ${text.slice(0, 100)}`)
  })
}
```

## Étapes suivantes

- [Découpage des capacités](../practice/) — comprendre le rôle des événements dans les interfaces de capacité
- [Adaptateurs LLM](../practice/llm-adapter.md) — implémenter un backend LLM complet
