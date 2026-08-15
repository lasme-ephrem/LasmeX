# Adaptateurs LLM

Ce guide connecte un nouveau fournisseur LLM à LasmeX.

## Vue d’ensemble

Un adaptateur LLM étend `LlmAdapter` et implémente `stream()`. Il traduit la requête indépendante du fournisseur de LasmeX en appel à l’API du fournisseur, puis reconvertit sa réponse en fragments de flux LasmeX.

## Implémentation minimale

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from 'lasmex-llm'

class MyAdapter extends LlmAdapter {
  private apiKey: string

  constructor(apiKey: string) {
    super()
    this.apiKey = apiKey
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // 1. Convert options.messages to the provider format.
    // 2. Call the streaming API.
    // 3. Convert the response into StreamChunk values.
  }
}

export interface Config {
  apiKey: string
  providers: string[]
}

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string().required(),
  providers: Schema.array(Schema.string()).required(),
})

export const name = 'my-llm-adapter'
export const inject = ['llm']

export function apply(ctx: Context, config: Config) {
  const adapter = new MyAdapter(config.apiKey)
  ctx.llm.registerAdapter(config.providers, adapter)
}
```

## Protocole StreamChunk

`stream()` produit des fragments selon le protocole suivant :

```ts
import { CallId, type StreamChunk } from 'lasmex-llm'

async function* exampleChunks(): AsyncIterable<StreamChunk> {
  // 1. Start each content block with block-start.
  yield { type: 'block-start', index: 0, blockType: 'text' }

  // 2. Stream text through text-delta.
  yield { type: 'text-delta', index: 0, text: 'Hello' }
  yield { type: 'text-delta', index: 0, text: ' world' }

  // 3. End each content block with block-end and the complete block.
  yield {
    type: 'block-end',
    index: 0,
    block: { type: 'text', text: 'Hello world' },
  }

  // 4. Tool-call block.
  yield { type: 'block-start', index: 1, blockType: 'tool-call' }
  yield {
    type: 'tool-call-delta',
    index: 1,
    id: CallId('call-123'),
    name: 'bash',
    argumentsDelta: '{"command":"ls"}',
  }
  yield {
    type: 'block-end',
    index: 1,
    block: {
      type: 'tool-call',
      id: CallId('call-123'),
      name: 'bash',
      arguments: '{"command":"ls"}',
    },
  }

  // 5. Token usage.
  yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 50 } }

  // 6. Finish reason.
  yield { type: 'finish', reason: { kind: 'stop' } }
  // Alternatively, { kind: 'tool-calls' } requests tool execution.
}
```

### Règles principales

- Chaque `block-start` possède un `block-end` correspondant.
- `index` part de 0, augmente et identifie l’ordre des blocs de contenu.
- Un `tool-call-delta` transporte le texte JSON brut dans `argumentsDelta`, en une seule fois ou sur plusieurs fragments.
- `finish` est le dernier fragment.
- Émettez `usage` avant `finish`.

## GenerateOptions

`stream()` reçoit le type exporté `GenerateOptions`. Il contient le modèle, l’identifiant d’effort de raisonnement appartenant à l’adaptateur, l’historique de conversation, le prompt système, les schémas d’outils, les paramètres de génération, les séquences d’arrêt et le signal d’annulation ; considérez le type TypeScript exporté par `lasmex-llm` comme l’autorité. Transmettez à l’API du fournisseur tous les champs pris en charge. Si le fournisseur ne peut pas respecter un champ, levez une `LlmError` dotée d’un code stable au lieu de l’ignorer silencieusement.

Surchargez `resolveModel(provider, model, signal?)` pour renvoyer l’identité exacte du fournisseur et du modèle, ainsi que les éventuelles métadonnées `context` et `reasoning`, en une seule résolution. Les métadonnées de raisonnement comprennent une liste ordonnée d’identifiants opaques et de noms affichés, plus une valeur par défaut facultative ; conservez la liste sélectionnable dont l’adaptateur fait autorité, y compris `off` lorsque l’API de capacité amont la renvoie, au lieu de transformer ces valeurs en énumération du noyau. Respectez le signal facultatif lors d’une résolution asynchrone afin que l’annulation et la libération atteignent un état de repos. Le service valide l’ensemble et rejette les efforts explicites non pris en charge avant `stream()` ; l’absence de `reasoning` signifie que le modèle n’offre aucun effort de raisonnement sélectionnable.

## Enregistrer un adaptateur

```ts ignore-check
ctx.llm.registerAdapter(['my-provider'], adapter)
```

Le premier argument liste les routes de fournisseur prises en charge par l’adaptateur. `GenerateOptions.provider` sélectionne l’adaptateur enregistré, tandis que `GenerateOptions.model` transmet un identifiant de modèle appartenant à l’adaptateur, sans enregistrement dans le cycle de vie. Surchargez `listModels()` si l’adaptateur peut annoncer des modèles aux sélecteurs.

## L’utiliser depuis cordis.yml

```yaml
- id: my-llm
  name: './src/my-llm-adapter.ts'
  config:
    apiKey: !!js process.env.MY_API_KEY
    providers:
      - my-provider

- id: agent-loop
  name: 'lasmex-agent-loop'
  config:
    agents:
      - id: main
        provider: my-provider
        model: my-model-v1
```

## Implémentations de référence

Le dépôt contient des implémentations complètes :

- `packages/llm/llm-deepseek/` — adaptateur pour l’API DeepSeek au format compatible OpenAI
- `packages/llm/llm-pi-ai/` — adaptateur Pi AI qui utilise un autre format d’API

Comparez ces deux adaptateurs livrés pour observer le même contrat LasmeX implémenté sur des SDK de fournisseurs différents.

## Gestion des erreurs

Les adaptateurs signalent les échecs de transport et de protocole en levant des `LlmError` dotées de codes stables. La boucle de l’agent conserve l’erreur et son code pour le diagnostic et la politique ; elle ne convertit pas automatiquement une `Error` ordinaire. Chaque requête HTTP au fournisseur doit également fusionner `attributionHeaders()` et transmettre `options.signal`.

```ts
import {
  attributionHeaders,
  LlmAdapter,
  LlmError,
  type GenerateOptions,
  type StreamChunk,
} from 'lasmex-llm'

class HttpAdapter extends LlmAdapter {
  constructor(private readonly endpoint: string) {
    super()
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...attributionHeaders(),
      },
      body: JSON.stringify({ model: options.model, messages: options.messages }),
      ...options.signal ? { signal: options.signal } : {},
    })
    if (!response.ok) {
      throw new LlmError(`Provider API error: ${response.status}`, 'PROVIDER_HTTP_ERROR')
    }
    // A real adapter parses the response and emits the complete chunk sequence.
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
```
