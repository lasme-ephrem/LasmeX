# Streaming LLM

Types de conversation et de streaming de [`packages/llm`](../../packages/llm/README.md) : variantes `Message`/`ContentBlock` communes à toutes les requêtes et aux historiques durables, requête au modèle entièrement assemblée, protocole brut `StreamChunk`, contrat que chaque adaptateur doit implémenter et assembleur partagé. Les [packages du cœur](core.md) conservent et journalisent ces valeurs à chaque tour ; cette page les déclare.

Source : [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

<a id="content-blocks-and-messages"></a>

## Blocs de contenu et messages

Une conversation est composée de `Message` ; chaque message est un tableau de **blocs de contenu** typés. L’union des blocs dérive de `ContentBlockMap`.

Source : [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

```ts type-equiv
/**
 * Merge-extensible content blocks keyed by `type`. New core blocks must land
 * with adapter, UI, and compaction support.
 */
interface ContentBlockMap {
  'text': TextBlock
  'reasoning': ReasoningBlock
  'image': ImageBlock
  'tool-call': ToolCallBlock
  'tool-result': ToolResultBlock
}
```

Les interfaces des blocs, dont les champs complets figurent dans la source, sont `TextBlock` (`text`), `ReasoningBlock` (raisonnement distinct du texte visible), `ImageBlock` ([pièce jointe image](attachment.md) durable), `ToolCallBlock` (`id: CallId`, `name`, `arguments` en JSON brut) et `ToolResultBlock` (`toolCallId`, `content: ContentBlock[]` imbriqué, `isError?`). `ContentBlock = ContentBlockMap[ContentBlockType]`. Une nouvelle modalité ne rejoint la table extensible par fusion que lorsque son adaptateur, son interface, sa compaction et ses chemins de rejeu durable la prennent en charge.

Source : [`packages/llm/llm/src/message.ts`](../../packages/llm/llm/src/message.ts)

Un `Message` est une valeur identifiée et immuable de rôle, de source et de contenu. Les messages d’assistant produits par un modèle indiquent le fournisseur et le modèle d’origine, puis contiennent dans leur source des données de rejeu facultatives et privées à l’adaptateur :

```ts type-equiv
/** Provider/model identity and adapter-private replay data for an assistant message. */
interface AssistantProvenance {
  /** Provider route that produced the message. */
  provider: string
  /** Provider model id that produced the message. */
  model: string
  /**
   * Lossless-JSON adapter state needed to replay the provider response.
   * `LlmRuntime` exposes it to a target adapter only when that adapter instance
   * currently owns both this historical provider and the target provider.
   */
  replayState?: unknown
}
```

```ts type-equiv
/** One immutable message representation shared by delivery, durable history, and model requests. */
interface Message {
  /** Stable identity preserved across every representation boundary. */
  readonly id: MessageId
  /** Provider-neutral conversation role. */
  readonly role: 'system' | 'user' | 'assistant'
  /** Exact model-facing blocks. */
  readonly content: ContentBlock[]
  /** Required source fields supplied by the producer. */
  readonly source: MessageSource
}
```

L’origine d’un message est elle-même un type somme extensible par fusion :

```ts type-equiv
/**
 * Where a message (or injected content) came from.
 * Merge-extensible sum type — plugins add their own `kind`s.
 */
interface MessageSourceMap {
  user: { kind: 'user' }
  plugin: { kind: 'plugin'; plugin: string } & ContextFormed
  model: ModelMessageSource
  tool: ToolMessageSource
}
```

L’identité du producteur et la forme de présentation sont indépendantes. `kind` indique *qui a produit la valeur* ; le champ facultatif `form` indique *le type d’information*, puis les consommateurs choisissent sa présentation. Plusieurs producteurs peuvent partager une forme, et un même producteur peut en émettre plusieurs au cours d’une session. Les valeurs sont sémantiques et s’ajoutent une par une. Une valeur absente ou inconnue utilise le comportement par défaut documenté et est présentée comme un contenu opaque :

```ts type-equiv
/**
 * The kind of information in producer-supplied context, declared by the
 * producer beside its provenance.
 *
 * `MessageSource.kind` answers *who produced this*; `form` answers *what kind
 * of thing it is*, and the two axes are deliberately independent — several
 * producers share one form, and one producer may emit more than one form over
 * a session.
 *
 * The vocabulary is SEMANTIC, never visual: a value states that the content is
 * a file's instructions or a catalog of available items, and a consumer decides
 * what that looks like. Colors, icons, ordering, and collapse defaults are the
 * consumer's business and must not enter this union. It grows one value at a
 * time as producers gain the structured fields their form needs; an absent or
 * unknown value is the documented default, presented as opaque content.
 */
type ContextForm =
  /** Instructions read out of workspace files the model is expected to follow. */
  | 'instructions'
  /** A catalog of items available in this session, republished as it changes. */
  | 'catalog'
  /** Current state, where a later snapshot from the same producer supersedes an earlier one. */
  | 'snapshot'
  /** A one-off account of something that just happened; it supersedes nothing. */
  | 'notice'
  /** A message another agent addressed to this one. */
  | 'relay'
  /** Material lifted out of another session's log, possibly reduced on the way in. */
  | 'recall'
```

```ts type-equiv
/** One named contribution to a `snapshot`-form context, in assembly order. */
interface ContextSnapshotSection {
  /** The contributing subsystem's name. */
  readonly name: string
  /** That contribution's model-facing text, exactly as assembled. */
  readonly text: string
}
```

```ts type-equiv
/**
 * Producer-declared {@link ContextForm} and the fields that form requires,
 * mixed into the source types that carry one.
 *
 * Discriminated by `form` so a producer cannot select a form without the
 * fields needed to present it: a `notice` must record its one-line
 * account, a `snapshot` its sections. Omitting `form` stays valid — an
 * undeclared context is the documented default.
 */
type ContextFormed =
  | { readonly form?: never }
  | { readonly form: 'instructions' }
  | { readonly form: 'catalog' }
  | {
    readonly form: 'snapshot'
    /** The named contributions this snapshot assembled, in order. */
    readonly sections: readonly ContextSnapshotSection[]
  }
  | {
    readonly form: 'notice'
    /** One-line account of what happened, shown without expanding the row. */
    readonly summary: string
  }
  | { readonly form: 'relay' }
  | { readonly form: 'recall' }
```

<a id="streamchunk--the-raw-protocol"></a>

## `StreamChunk` — le protocole brut

Une réponse en streaming entrelace plusieurs blocs typés : texte, raisonnement et appels d’outils multiples. `index` rattache chaque delta à son bloc. `block-end` contient le `ContentBlock` entièrement assemblé afin que les consommateurs n’aient pas à réunir eux-mêmes les deltas. Il s’agit d’une union discriminée **fermée** : un `switch` sur `type` se termine par `assertNever`. L’ajout d’une variante empêche ainsi la compilation de chaque consommateur qui doit la traiter.

```ts type-equiv
/**
 * Raw streaming protocol emitted by adapters.
 * Block indexes correlate interleaved deltas, and `block-end` carries the
 * assembled block. Adapters emit usage before the terminal finish and nothing
 * afterward; tool arguments remain raw JSON strings. An adapter implementation
 * may throw, but `LlmRuntime.stream()` normalizes that failure to a terminal
 * `error` or `aborted` finish before exposing it to consumers.
 */
type StreamChunk =
  | { type: 'block-start'; index: number; blockType: ContentBlockType }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: CallId; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: ContentBlock }
  | { type: 'usage'; usage: TokenUsage }
  | {
    type: 'finish'
    reason: FinishReason
    /** Adapter-private lossless-JSON state for replaying a successful response. */
    replayState?: unknown
  }
```

## `LlmFailure`

Chaque échec levé ou renvoyé dans la bande par l’adaptateur final est normalisé en une charge utile sérialisable et indépendante du fournisseur. `providerRetryAfterMs` est un délai positif validé demandé par le fournisseur, pas une décision de nouvelle tentative. `ProviderRequestId` est une chaîne opaque et marquée destinée au diagnostic.

```ts type-equiv
/** Serializable provider or transport failure facts; policy decides whether they are retryable. */
interface LlmFailure {
  /** Human-readable provider or transport failure. */
  readonly message: string
  /** Stable provider-neutral machine-routing code. */
  readonly code: string
  /** HTTP status returned by the provider, when available. */
  readonly status?: number
  /** Provider-requested delay in milliseconds, when valid and available. */
  readonly providerRetryAfterMs?: number
  /** Opaque provider-issued request identifier for diagnostics. */
  readonly requestId?: ProviderRequestId
}
```

## Le contrat de l’adaptateur

Chaque adaptateur DOIT respecter les règles suivantes, sur lesquelles tous les consommateurs peuvent compter :

- **`usage` précède `finish`, et rien ne suit `finish`.** Différez les deux jusqu’au marqueur de fin de flux du fournisseur, afin qu’un fragment final contenant uniquement l’utilisation ne puisse pas rompre cet ordre.
- **Les `arguments` d’un appel d’outil restent des chaînes JSON brutes de bout en bout.** Les fragments partiels sont diffusés par `argumentsDelta`. Un fournisseur qui renvoie des objets analysés les sérialise de nouveau à `block-end`.
- **Deux chemins d’erreur autorisés, un seul type `LlmFailure`.** Un échec peut soit être LEVÉ depuis `stream()` pour une erreur de transport ou de protocole, **soit** terminer le flux avec `finish {kind:'error'|'aborted', failure}` pour une erreur dans la bande d’un fournisseur dont l’adaptateur ne peut pas lever d’exception au milieu du flux. `LlmError.failure` contient le même `LlmFailure`. Après la sélection de l’adaptateur, le flux conserve l’objet `Error` exact qui a été levé et associe à l’appel des faits immuables ainsi que la politique immuable de nouvelle tentative de l’enregistrement qui le sert. La boucle ferme l’étape en échec, puis transmet l’erreur, les faits, les faits immuables des tentatives antérieures, la politique de service et le signal du tour à `agent/request-error`. Un écouteur qui traite l’échec renvoie `{ kind: 'retry' }` après sa réparation attendue. Sans récupération, l’échec structuré devient l’erreur du tour et la tentative ne valide aucun message ordinaire de l’assistant ni effet de bord d’outil.
- **Un appel d’adaptateur correspond à une tentative du fournisseur.** Les adaptateurs désactivent les nouvelles tentatives des bibliothèques. La récupération au niveau de l’agent ouvre un autre tour durable numéroté ; les appelants directs de `ctx.llm.stream()` n’effectuent qu’une tentative.
- **Les blocages du fournisseur sont bornés au niveau du transport.** Les deux adaptateurs distants livrés exposent un `streamIdleTimeoutMs` positif et fini, réglé par défaut sur cinq minutes. Le surveillant ne s’arme que pendant l’attente de `next()` sur l’itérateur, utilise un signal stable pour toute la requête, associe sa propre expiration à `TIMEOUT` et conserve une annulation antérieure de l’appelant sous `ABORTED`.
- **Le dépassement du contexte possède un code canonique unique.** Les deux adaptateurs DeepSeek classent les informations explicites du fournisseur avec `isContextWindowExceededError()` et exposent `CONTEXT_WINDOW_EXCEEDED`, que l’échec arrive sous forme de `LlmError` HTTP levée ou d’erreur de fin dans la bande. Les consommateurs effectuent leur routage à partir du code, jamais du texte du fournisseur.
- **Une réponse vide est une erreur qui autorise une nouvelle tentative, pas une réussite silencieuse.** Les deux adaptateurs transforment une fin terminale `stop` sans bloc de contenu en `finish {kind:'error'}` avec le code canonique `EMPTY_RESPONSE`. `lasmex-llm-retry` la retente par défaut ; voir [les réponses vides du modèle autorisent une nouvelle tentative](../../.agents/notes/implemented/bug-fix/2026-07-24-empty-model-response-is-retryable.md).
- **Chaque requête HTTP au fournisseur contient l’en-tête d’attribution de l’application.** Les adaptateurs envoient `attributionHeaders()` ci-dessous, avec la valeur de base `User-Agent`, et le prouvent par un test du protocole filaire.
- **L’état de rejeu appartient à l’adaptateur.** Un `finish` réussi peut contenir l’état JSON sans perte nécessaire à la reconstruction d’une réponse native du fournisseur. La boucle le stocke avec le message assemblé de l’assistant. Lors d’une requête ultérieure, `LlmRuntime` transmet cet état uniquement si le fournisseur historique et le fournisseur cible sont alors enregistrés sous la même instance exacte d’adaptateur. Cet adaptateur valide l’état et possède toute conversion entre modèles ou fournisseurs. Les autres adaptateurs reçoivent le contenu indépendant du fournisseur et les champs de fournisseur et de modèle, sans l’état privé.

## `ResolvedRetryPolicy`

La configuration du fournisseur est résolue avant l’enregistrement de la route sous forme d’union discriminée immuable. Le mode normal contient `mode: 'normal'`, un `maxRetries` fini, `retryableCodes` et les champs obligatoires `initialDelayMs`, `maxDelayMs` et `jitterRatio`. Le mode permanent contient `mode: 'always'` et les mêmes champs obligatoires de temporisation, sans maximum fini. `LlmRuntime.providerRetryPolicy(provider)` renvoie la valeur actuellement enregistrée et fournit les valeurs normales par défaut lorsque l’adaptateur n’en définit aucune. `llmRetryPolicyOf(stream)` renvoie la valeur capturée depuis l’enregistrement de service après sa sélection par l’appel. Le démontage ou le remplacement ultérieur de la route ne peut donc pas modifier la politique de récupération d’un échec en cours. Le [catalogue de configuration généré](../config-catalog.md) énumère les champs d’entrée facultatifs.

## `AppIdentity` — attribution de l’application

Identité publique statique de l’application que chaque adaptateur envoie aux fournisseurs ([`packages/llm/llm/src/attribution.ts`](../../packages/llm/llm/src/attribution.ts)). `attributionHeaders(identity?)` la transforme uniquement en en-tête standard `User-Agent`. Ce contrat ne prend volontairement pas en charge les en-têtes d’attribution propres à OpenRouter. La valeur `APP_IDENTITY` par défaut identifie LasmeX et lit sa version dans le manifeste du package. Une page d’accueil publique du produit est facultative et reste omise tant qu’elle n’existe pas ; aucune URL du projet source n’est présentée comme accueil de LasmeX. Chaque champ est une donnée publique du produit : aucun secret, chemin, identifiant de session ou identifiant propre à l’utilisateur, et aucune donnée par requête ne peut influencer ces valeurs. Justification : [attribution `User-Agent` obligatoire](../../.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md).

```ts type-equiv
/**
 * Static public application identity sent to LLM providers.
 *
 * Every field is a public product fact, safe on every request: no secrets,
 * local paths, session ids, prompt text, or per-user identifiers belong here,
 * and nothing per-request may influence the values.
 */
interface AppIdentity {
  /** `User-Agent` product token (lowercase, hyphenated). */
  product: string
  /** Product version; sourced from package metadata, never hand-copied. */
  version: string
  /** Public product home, used as the `User-Agent` comment when one exists. */
  url?: string
}
```

## `TokenUsage`

Comptage des jetons par appel. Les nombres sont **disjoints** : `inputTokens` contient uniquement l’entrée non mise en cache. Les entrées mises en cache sont signalées séparément, et l’entrée facturée est la somme des trois. Les adaptateurs dont les fournisseurs incorporent les résultats du cache dans un total unique de l’invite, comme `prompt_tokens` chez DeepSeek, les soustraient de nouveau. Lorsqu’il est présent, `reasoningTokens` est un détail informatif déjà inclus dans `outputTokens` ; les totaux ne doivent pas l’ajouter une seconde fois.

```ts type-equiv
/**
 * Token accounting for one model call (cache fields are optional).
 *
 * Counts are DISJOINT: `inputTokens` is uncached input only; cached input is
 * reported separately as `cacheReadTokens`/`cacheWriteTokens` (billed input =
 * sum of the three). Adapters whose providers fold cache hits into a total
 * prompt count (DeepSeek's `prompt_tokens`) subtract them out.
 */
interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}
```

## `BlockAssembler`

`BlockAssembler` ([`packages/llm/llm/src/assembler.ts`](../../packages/llm/llm/src/assembler.ts)) est l’unique implémentation partagée qui réduit un flux de `StreamChunk` en `ContentBlock`, utilisation, motif de fin et état de rejeu. La boucle journalise les fragments bruts tout en transmettant ces mêmes fragments à un assembleur, puis stocke le contenu assemblé de l’assistant avec le fournisseur et le modèle qui l’ont produit. Tout consommateur qui a besoin du résultat assemblé sans réimplémenter la réduction utilise ce composant.

```ts public-api
/**
 * Incrementally assembles raw {@link StreamChunk}s into complete
 * {@link ContentBlock}s and a final assistant {@link Message}.
 *
 * The agent loop feeds it while logging raw chunks for replay fidelity, then
 * reads `blocks()` / `message()` / `usage` / `finish` once the stream ends.
 *
 * Tolerant of delta-only protocols (no block-start/end); deltas arriving for
 * an index already closed by `block-end` are ignored (malformed stream) so a
 * misbehaving adapter cannot grow memory or corrupt a completed block.
 */
declare class BlockAssembler {
  /**
   * Feed one chunk into the assembly state.
   * @param chunk - the next raw chunk, in stream order.
   */
  push(chunk: StreamChunk): void;
  /**
   * Assemble all blocks seen so far, in stream order.
   * @returns one block per seen index, except that max-token truncation drops
   *   tool calls that cannot be executed safely; an open block assembles from
   *   its accumulated deltas (an unknown block type never closed by `block-end` throws).
   */
  blocks(): ContentBlock[];
  /** Usage from the `usage` chunk; undefined until one arrives. */
  get usage(): TokenUsage | undefined;
  /** Finish reason from the `finish` chunk; `{kind: 'stop'}` when the stream ended without one. */
  get finish(): FinishReason;
  /** Adapter-private replay state from the terminal finish chunk, if any. */
  get replayState(): unknown;
  /**
   * The assembled assistant message.
   * @param source - producer attribution for the assembled message.
   * @returns a frozen assistant-role message over `blocks()` (same open-block assembly rules).
   */
  message(source: MessageSource = { kind: 'plugin', plugin: 'lasmex-llm/assembler' }): Message;
}
```

<a id="the-model-request-and-result"></a>

## La requête au modèle

Un appel au modèle est un `GenerateOptions` entièrement assemblé. L’adaptateur répond avec un flux brut de [`StreamChunk`](#streamchunk--the-raw-protocol), que le consommateur assemble au moyen de [`BlockAssembler`](#blockassembler).

Source : [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

La découverte des fournisseurs et des modèles utilise de petits descripteurs indépendants des fournisseurs. Un catalogue de modèles est indicatif : le routage dépend toujours d’un fournisseur enregistré, et un adaptateur peut accepter des identifiants de modèles non répertoriés.

L’enregistrement d’un adaptateur renvoie un handle : sa fonction de nettoyage et le remplacement atomique de route nécessaire à un plugin dont l’ensemble de routes est configurable par l’utilisateur.

```ts type-equiv
/**
 * What {@link LlmRuntime.registerAdapter} returns: the disposer, plus an
 * atomic route replacement for the same adapter instance.
 */
interface AdapterRegistrationHandle {
  /** Release every route this registration currently holds. */
  (): void
  /**
   * Replace this registration's routes with `providers`, keeping the same
   * adapter instance. The candidate set is validated in full first — a
   * conflict with another adapter, an invalid name, or bad provider metadata
   * throws and leaves the current routes untouched — and the swap itself is
   * one synchronous section, so no request can observe a gap. An empty array
   * is legal here (a settings section that emptied holds zero routes while
   * staying registered), unlike an empty initial registration.
   *
   * Throws `LlmError` with code `REGISTRATION_DISPOSED` once the registration
   * has been released: its routes are gone and its disposer has already run,
   * so anything registered afterwards would have no owner left to release it.
   * @param providers - the complete next route set for this registration.
   */
  replace(providers: string[]): void
}
```

```ts type-equiv
/** Display metadata for one registered provider route. */
interface LlmProviderInfo {
  /** Provider route key used by {@link GenerateOptions.provider}. */
  id: string
  /** Human-readable provider name for selectors and diagnostics. */
  name: string
}
```

Les plugins d’adaptateurs déclarent en plus les routes qui *pourraient* s’exécuter avec `registerConfigurableProviders()`, en désignant la section de réglages utilisateur de chacune. Les interfaces de configuration peuvent ainsi proposer des fournisseurs inactifs avant l’enregistrement de toute route.

```ts type-equiv
/**
 * One provider route an adapter plugin can activate through configuration,
 * whether or not the route is currently registered. Configuration surfaces
 * merge this directory with `listProviders()` to offer every configurable
 * provider alongside its live/dormant state.
 */
interface LlmConfigurableProvider {
  /** Provider route key this entry activates when configured. */
  provider: string
  /** Human-readable provider name for configuration surfaces. */
  displayName: string
  /** User-settings namespace whose section configures this provider. */
  settingsNs: string
  /**
   * Path from that namespace's section root to this provider's profile
   * object; empty when the whole section is the profile.
   */
  settingsPath: readonly string[]
  /**
   * Whether the owning adapter knows this route only because configuration
   * declared it — a gateway or self-hosted server it ships nothing about.
   * Absent means the adapter draws no such distinction; false means it does
   * and this route is one of its own. Only the adapter can answer: a stored
   * profile is how a user-added route AND a corrected shipped one both look
   * from outside.
   */
  declared?: boolean
}
```

```ts type-equiv
/** One adapter-discovered model; catalog membership is advisory, not request validation. */
interface LlmModelInfo {
  /** Provider route that owns this model entry. */
  provider: string
  /** Model id passed to {@link GenerateOptions.model}. */
  id: string
  /** Human-readable model name for selectors. */
  name: string
  /** Optional user-facing distinction from otherwise similar models. */
  description?: string
  /** Accepted request modalities; absent means unknown, while an explicit omission is negative capability. */
  inputModalities?: readonly ModelModality[]
}
```

Les métadonnées nécessaires à la conformité sont résolues séparément du catalogue indicatif et appartiennent à l’adaptateur qui sert la route exacte. La capacité du contexte, les valeurs d’appel par défaut de l’adaptateur et les choix de raisonnement partagent un même résultat pour le modèle exact. Les consommateurs ne répètent donc pas la résolution du modèle qui fait autorité.

```ts type-equiv
/** Provider-owned context capacity for one exact provider/model route. */
interface LlmModelContext {
  /** Maximum combined request and response context in tokens. */
  contextWindow: number
}
```

L’effort de raisonnement est une autre fonctionnalité de la route exacte. Le cœur marque les identifiants sans énumérer leurs valeurs. Chaque adaptateur possède l’ensemble ordonné, les noms d’affichage et la valeur par défaut facultative du déploiement.

```ts type-equiv
/** Adapter-owned identifier for one model's selectable reasoning effort. */
type ReasoningEffortId = Branded<'ReasoningEffortId'>
```

```ts type-equiv
/** Display metadata for one adapter-owned reasoning effort. */
interface LlmReasoningEffortInfo {
  /** Opaque stable value accepted by {@link GenerateOptions.reasoningEffort}. */
  id: ReasoningEffortId
  /** Human-readable effort name for selectors and diagnostics. */
  name: string
  /** Optional user-facing distinction from otherwise similar efforts. */
  description?: string
}
```

```ts type-equiv
/** Selectable reasoning efforts for one exact provider/model route. */
interface LlmModelReasoningInfo {
  /** Supported efforts in adapter-preferred display order. */
  efforts: readonly LlmReasoningEffortInfo[]
  /**
   * Adapter-configured default materialized into requests when callers omit
   * an effort. Absence preserves the provider's own default.
   */
  defaultEffort?: ReasoningEffortId
}
```

```ts type-equiv
/** Exact-route model metadata resolved by its owning adapter. */
interface LlmResolvedModelInfo extends LlmModelInfo {
  /** Provider-owned context capacity when known. */
  context?: LlmModelContext
  /** Adapter-configured per-request output cap materialized when callers omit one. */
  defaultMaxTokens?: number
  /** Adapter-owned selectable reasoning levels when exposed. */
  reasoning?: LlmModelReasoningInfo
}
```

```ts type-equiv
/** A single model request, fully assembled. */
interface GenerateOptions {
  /** Registered provider route selecting the adapter instance. */
  provider: string
  model: string
  /** Adapter-owned reasoning effort selected for this exact model. */
  reasoningEffort?: ReasoningEffortId
  /**
   * Ordered conversation messages, exactly as the provider sees them (after
   * the `system` slot). A loop-built request assembles them as
   * the derived history (lasmex-agent-loop); a hand-built one-shot passes any list.
   */
  messages: Message[]
  /** System prompt text (adapters map to the provider's system slot). */
  system?: string
  /** Tool schemas (adapters map to the provider's `tools` field). */
  tools?: ToolSchema[]
  temperature?: number
  maxTokens?: number
  /**
   * Stop sequences: generation halts as soon as the model produces any one of
   * these strings (adapters map to the provider's stop field, e.g. OpenAI
   * `stop`). The stop string itself is not included in the output.
   */
  stop?: string[]
  signal?: AbortSignal
  /**
   * Session identity stamped by the loop for request routing. Replay uses it
   * to separate cursors; adapters may map it to model-hidden transport metadata.
   */
  sessionId?: Branded<'SessionId'>
  /**
   * Provider-neutral classification for an auxiliary model call. Adapters may
   * map the purpose to model-hidden transport metadata or purpose-specific
   * generation policy. Ordinary conversation requests leave it unset.
   */
  purpose?: 'compaction' | 'session-title'
}
```

Le motif de fin d’une réponse du modèle est extensible par fusion. Les échecs terminaux du fournisseur contiennent le [`LlmFailure`](#llmfailure) du contrat de streaming :

```ts type-equiv
/**
 * Why a model response stopped.
 * Merge-extensible so adapters can surface provider-specific reasons.
 */
interface FinishReasonMap {
  'stop': { kind: 'stop' }
  'tool-calls': { kind: 'tool-calls' }
  'max-tokens': { kind: 'max-tokens' }
  'aborted': { kind: 'aborted'; failure: LlmFailure }
  'error': { kind: 'error'; failure: LlmFailure }
}
```

`FinishReason = FinishReasonMap[keyof FinishReasonMap]`. `TokenUsage`, qui compte chaque appel avec des champs de cache disjoints, est détaillé [plus bas](#tokenusage).

`GenerateOptions.tools` contient `ToolSchema`, la description JSON Schema d’un outil envoyée au modèle. Ce type est déclaré dans lasmex-llm plutôt que dans lasmex-tools précisément parce qu’il appartient à la requête assemblée par la boucle à chaque étape :

```ts type-equiv
/**
 * JSON-schema description of a tool, as sent to the model.
 *
 * Declared here (not in lasmex-tools) because it is part of {@link GenerateOptions};
 * lasmex-tools' ToolDefinition and lasmex-system-prompt's PromptAssembly both import
 * it from this package.
 */
interface ToolSchema {
  name: string
  description: string
  /** JSON Schema object for the arguments. */
  parameters: Record<string, unknown>
}
```

Le `ToolSchema` destiné au modèle est le type filaire. La `ToolDefinition` enregistrée qui le produit, avec le schéma et `execute`, est décrite dans [tools.md](tools.md).

Un fournisseur encore en cours de configuration dans une interface ne possède ni route ni catalogue. Son interrogation est donc décrite séparément : la requête contient le brouillon modifié par l’utilisateur et la réponse fournit des candidats que l’interface peut adopter, plutôt qu’un catalogue qu’elle doit servir.

```ts type-equiv
/**
 * One interrogation of a provider endpoint that configuration has not stored
 * yet. Configuration surfaces send the draft a user is still editing, so the
 * request carries the endpoint and credential directly instead of naming a
 * route: a provider being added has no route to name.
 */
interface LlmModelDiscoveryRequest {
  /**
   * Route the draft is editing, when it edits an existing one. A route whose
   * adapter already knows its models answers from that knowledge instead of
   * asking the endpoint — the adapter's own registry is the better answer, and
   * it costs no network call.
   */
  provider?: string
  /**
   * Endpoint to interrogate. Optional because a route the adapter already
   * describes needs none; a route it does not must supply one.
   */
  baseURL?: string
  /** Wire protocol the endpoint speaks, when the draft names one. */
  api?: string
  /** Credential for this interrogation alone; the harness never stores it. */
  apiKey?: string
  /** Caller cancellation; implementations must settle promptly after it aborts. */
  signal?: AbortSignal
}
```

```ts type-equiv
/**
 * One model an endpoint reports about itself. Every field but the id is
 * optional because most provider listings disclose an id and nothing else;
 * a surface adopting one of these still owes the capacities its adapter needs.
 */
interface LlmDiscoveredModel {
  /** Model id the endpoint accepts. */
  id: string
  /** Human-readable name when the endpoint supplies one. */
  name?: string
  /** Maximum combined request and response context, when disclosed. */
  contextWindow?: number
  /** Maximum output tokens, when disclosed. */
  maxTokens?: number
}
```

### L’enveloppe de requête : `LlmCallConfig` et l’en-tête journalisé

La boucle construit chaque requête depuis l’état journalisé. `EpochHeader` enregistre la configuration de l’appel, marque les champs fournis par les valeurs par défaut de l’adaptateur et conserve l’invite rendue ainsi que l’ordre des outils renvoyé qui fait autorité, configuré par `toolOrder` ou lexicographique lorsqu’il est absent, au moyen d’instantanés `request/header` complets. Avec l’historique dérivé, ces données rendent la requête reconstructible depuis le journal de session. Voir [session.md](session.md#the-request-header-event-requestheader) et l’[Agent Note sur la reconstructibilité](../../.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md).

`agent/request` reçoit une configuration initiale figée et peut renvoyer un remplacement afin de changer de fournisseur, de modèle, d’effort de raisonnement ou d’échantillonnage. Avant la cascade, la boucle retire les valeurs marquées comme valeurs par défaut de l’adaptateur, afin que la préparation du modèle exact matérialise les valeurs courantes de la route choisie. Les réglages explicites non marqués restent dans la proposition. Après la cascade, la préparation rejette sans ajustement les identifiants explicites d’effort non pris en charge, puis journalise sous le signal du tour la configuration applicable et les champs fournis par les valeurs par défaut de l’adaptateur. L’appel préparé conserve un même enregistrement d’adaptateur pendant la répartition. Les requêtes qui atteignent `llm/stream` sont figées en profondeur ; toute modification lève donc une exception. Elles contiennent aussi l’identité de boucle propre au processus, afin que les observateurs ne confondent pas les appels auxiliaires figés et journalisés séparément avec les requêtes de conversation.

Sur le protocole filaire, une requête construite par la boucle lit d’abord l’emplacement `system`, c’est-à-dire l’assemblage rendu de l’invite, puis l’historique dérivé. L’instantané de requête journalisé se termine par le dernier `user/message` lors de la première étape d’un tour, puis par les résultats d’outils de l’étape précédente lors des étapes suivantes. La propriété vérifiée en développement recalcule exactement cette équation pour chaque requête construite par la boucle.

FIXME(call-config-shape) : réexaminer les champs restants qui relèvent réellement de l’époque pour les besoins du cache (`model` et l’effort de raisonnement appartenant au modèle sont explicites ; les valeurs scalaires d’échantillonnage se trouvent ici par prudence).

```ts type-equiv
/**
 * Provider, model, reasoning effort, and sampling scalars of one conversation's
 * requests. Every field maps 1:1 onto the same-named `GenerateOptions` field;
 * the loop builds requests from the logged header rather than accepting these
 * per call.
 */
interface LlmCallConfig {
  provider: string
  model: string
  reasoningEffort?: ReasoningEffortId
  temperature?: number
  maxTokens?: number
  stop?: string[]
}
```

```ts type-equiv
/**
 * Effective config fields supplied by exact-model adapter resolution rather
 * than by the caller's request proposal.
 */
interface LlmCallConfigAdapterDefaults {
  reasoningEffort?: true
  maxTokens?: true
}
```

## Contrats du service et des fournisseurs

`LlmAdapter` définit le contrat du fournisseur : créez une sous-classe, implémentez `stream()` et enregistrez une instance avec `ctx.llm.registerAdapter(providers, adapter)`. `GenerateOptions.provider` sélectionne l’adaptateur enregistré ; `GenerateOptions.model` lui est transmis et ne doit pas nécessairement être enregistré au début du cycle de vie. Les routes de fournisseurs en double échouent atomiquement. La méthode facultative `providerRetryPolicy()` est capturée pour chaque route avec les valeurs normales par défaut. `providerInfo()` et la méthode asynchrone `listModels()` alimentent `LlmRuntime.listProviders()` / `listModels()` avec des métadonnées de sélection détachées. Ce catalogue est indicatif, pas une liste blanche de requêtes : l’adaptateur fait autorité et peut accepter des identifiants de modèles absents du catalogue. Une requête asynchrone `resolveModel()` renvoie l’identité exacte du modèle, la capacité facultative du contexte nécessaire à la conformité, un `defaultMaxTokens` configuré par l’adaptateur et les identifiants ordonnés d’effort de raisonnement appartenant au modèle, avec une valeur par défaut facultative du déploiement. Un champ absent signifie que les métadonnées ne sont pas disponibles ou que le comportement appartient au fournisseur, pas que le modèle est exclu du catalogue. Le résolveur reçoit une annulation facultative et doit se terminer rapidement après celle-ci. `LlmRuntime.resolveModelInfo()` valide et détache le résultat agrégé. À la limite de l’adaptateur final, `resolveCallConfig()` matérialise la sortie par défaut uniquement lorsque `maxTokens` est absent, puis valide et matérialise le raisonnement. Les appels directs ne peuvent donc contourner aucun des deux comportements configurés ; la répartition directe capture un enregistrement avant d’attendre cette résolution. La boucle d’agent utilise plutôt `prepareCall()` pour conserver le même enregistrement pendant la résolution du modèle, la journalisation durable de l’en-tête et la répartition, garder les métadonnées de contexte détachées de cette recherche exacte et signaler les champs de configuration auxquels l’adaptateur a attribué une valeur par défaut. La recherche de l’adaptateur intervient dans la continuation terminale de la cascade `llm/stream`. Un écouteur peut donc interrompre l’appel ou router une requête ponctuelle modifiable avant cette recherche. AgentLoop observe une tentative de requête lorsque la cascade extérieure renvoie un handle de flux. Cette limite restreinte ne prouve pas qu’un adaptateur terminal différé a été construit ni qu’il a commencé ses entrées-sorties avec le fournisseur. La corrélation `block-start` / `block-end` par `index`, combinée à l’assembleur, signifie qu’un adaptateur doit uniquement émettre des fragments bien formés ; chaque adaptateur n’a pas à réassembler les blocs. [architecture.md](../architecture.md#turn-flow) situe `ctx.llm.stream()` et la cascade `llm/stream` dans un tour.

```ts type-equiv
/** One model call whose config and adapter registration were resolved together. */
interface PreparedLlmCall {
  /** Detached, deep-frozen config with any adapter-owned default materialized. */
  readonly config: LlmCallConfig
  /** Immutable retry policy captured with the adapter registration. */
  readonly retryPolicy: ResolvedRetryPolicy
  /** Detached context metadata resolved with the registration-bound call. */
  readonly context?: LlmModelContext
  /** Config fields materialized by the captured adapter rather than proposed by the caller. */
  readonly adapterDefaults: LlmCallConfigAdapterDefaults
  /**
   * Dispatch this call once through the registration captured during
   * preparation. The request's call-config fields must match {@link config};
   * reuse or mismatch fails with `INVALID_PREPARED_CALL`.
   * @param options - fully assembled request carrying the prepared config.
   * @returns the chunk stream, including the `llm/stream` waterfall.
   */
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}
```

```ts public-api
/**
 * Provider-wire adapter for the harness message and stream vocabulary. Register implementations
 * with `ctx.llm.registerAdapter(providers, adapter)`. Every provider HTTP request must include
 * `attributionHeaders()`; prove the headers are added in the wire request or library header hook. The direct-fetch
 * DeepSeek and library-backed pi-ai adapters meet this contract through different internals.
 */
declare abstract class LlmAdapter {
  /**
   * Describe one provider route owned by this adapter.
   * @param provider - a route passed to `registerAdapter()` for this instance.
   * @returns detached display metadata whose id must equal `provider`.
   */
  providerInfo(provider: string): LlmProviderInfo;
  /**
   * Return the provider-owned retry policy captured with this route.
   * @param _provider - a route passed to `registerAdapter()` for this instance.
   * @returns a resolved policy, or `undefined` to use the normal defaults.
   */
  providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined;
  /**
   * List models this adapter can currently advertise for one owned provider.
   * The result is advisory: an adapter may accept unlisted model ids, and
   * consumers must not turn absence into request rejection.
   * @param _provider - one provider route owned by this adapter.
   * @returns discoverable models in adapter-preferred order.
   */
  listModels(_provider: string): Promise<readonly LlmModelInfo[]>;
  /**
   * Resolve all metadata available for one exact model. This query is
   * independent of the advisory catalog and does not validate request routing.
   * @param provider - one provider route owned by this adapter.
   * @param model - exact model id passed to {@link GenerateOptions.model}.
   * @param _signal - cancellation for this exact-model lookup; asynchronous
   *   implementations must settle promptly after it aborts.
   * @returns provider/model identity plus any context, call-default, and reasoning metadata.
   */
  resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo>;
  /**
   * Stream one model call as raw chunks. The only required method.
   * @param options - the fully-assembled request; implementations must honor `options.signal`.
   * @returns the chunk stream, obeying the adapter contract documented on `StreamChunk`.
   */
  abstract stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
```

`ContentBlockType`, l’ensemble de clés transporté par les blocs corrélés par `index`, dérive de [`ContentBlockMap`](#content-blocks-and-messages) ci-dessus.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Générée depuis les sources par `scripts/gen-cordis-catalog.ts` (sa fraîcheur est vérifiée par `pnpm run verify-cordis-catalog` dans doc-sync ; régénérez-la avec `pnpm run gen-cordis-catalog`) — cette section est identique octet pour octet dans les deux langues de la page. Les blocs de signature utilisent une clôture `ts cordis-catalog` et conservent la JSDoc source d’origine. Les modes de répartition sont définis dans le [guide d’introduction](../cordis-primer.md#dispatch-modes), et l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxllm--llmruntime"></a>

### `ctx.llm` — `LlmRuntime`

Service abstrait `llm` : registre d’adaptateurs et API d’appel au modèle en streaming, interceptable au moyen de la cascade `llm/stream`.

```ts cordis-catalog
/**
 * Register an adapter for the given provider routes. Throws `LlmError` with code
 * `DUPLICATE_ADAPTER` if any provider already has an adapter (all-or-nothing).
 * Disposed with the fiber.
 * @param providers - every provider route this adapter should serve.
 * @param adapter - the adapter that streams calls for those providers.
 * @returns the disposer, carrying {@link AdapterRegistrationHandle.replace}.
 */
registerAdapter(providers: string[], adapter: LlmAdapter): AdapterRegistrationHandle

/**
 * Describe provider routes with a registered adapter.
 * @returns detached provider metadata in registration order.
 */
listProviders(): LlmProviderInfo[]

/**
 * Declare provider routes an adapter plugin can activate through
 * configuration. Registration is all-or-nothing: an empty list, invalid
 * entry, or a provider already declared by any registration throws
 * `LlmError` without registering the rest. Disposed with the fiber.
 * @param entries - every configurable provider this plugin owns.
 * @returns a handle that withdraws all of them, and can atomically replace them.
 */
registerConfigurableProviders(entries: readonly LlmConfigurableProvider[]): DirectoryRegistrationHandle

/**
 * List every declared configurable provider, registered or dormant.
 * @returns detached directory entries in declaration order.
 */
listConfigurableProviders(): LlmConfigurableProvider[]

/**
 * Offer to interrogate provider endpoints on behalf of the settings
 * namespace this plugin owns. The namespace is the key because that is what
 * a configuration surface already holds from the configurable-provider
 * directory, and because a provider being *added* has no route to name yet.
 * Disposed with the fiber.
 * @param settingsNs - the namespace whose profiles this discovery serves.
 * @param discover - interrogates one endpoint; must honor `request.signal`.
 * @returns the disposer that withdraws the offer.
 */
registerModelDiscovery( settingsNs: string, discover: (request: LlmModelDiscoveryRequest) => Promise<readonly LlmDiscoveredModel[]>, ): () => void

/**
 * Interrogate one provider endpoint for the models it advertises. The
 * request describes a draft, not a stored route, so nothing here reads or
 * writes settings or credentials — the caller owns both, and the reply is
 * candidate metadata a surface may offer for adoption.
 * @param settingsNs - namespace whose registered discovery serves this draft.
 * @param request - the endpoint, protocol, and one-shot credential to use.
 * @returns the advertised models, deduplicated in endpoint order.
 */
async discoverModels( settingsNs: string, request: LlmModelDiscoveryRequest, ): Promise<LlmDiscoveredModel[]>

/**
 * Resolve the retry policy captured when one provider route was registered.
 * @param provider - registered provider route to inspect.
 * @returns the provider-owned policy, with normal defaults already resolved.
 */
providerRetryPolicy(provider: string): ResolvedRetryPolicy

/**
 * Discover models advertised by one registered provider. Catalog membership
 * is advisory and never changes routing or request validation.
 * @param provider - registered provider route to inspect.
 * @returns detached model metadata in adapter-preferred order.
 */
async listModels(provider: string): Promise<LlmModelInfo[]>

/**
 * Resolve and validate all metadata from the adapter that owns one exact
 * route. The result is detached from adapter-owned objects; catalog
 * membership remains advisory and does not control request routing.
 * @param provider - registered provider route to inspect.
 * @param model - exact model id passed to the adapter.
 * @param signal - optional cancellation for adapter-owned asynchronous lookup.
 * @returns exact model identity plus available context and reasoning metadata.
 */
async resolveModelInfo( provider: string, model: string, signal?: AbortSignal, ): Promise<LlmResolvedModelInfo>

/**
 * Validate a conversation call config against its exact model capability and
 * materialize adapter-configured defaults. Unsupported explicit efforts
 * reject before provider I/O; no clamping or aliasing is performed. This
 * standalone query does not bind a later dispatch; use {@link prepareCall}
 * when logging and streaming must share one adapter registration.
 * @param config - provider/model route and optional request controls.
 * @param signal - optional cancellation for adapter-owned capability lookup.
 * @returns a detached config only when a default must be materialized.
 */
async resolveCallConfig(config: LlmCallConfig, signal?: AbortSignal): Promise<LlmCallConfig>

/**
 * Resolve one call under its current adapter registration. The returned
 * one-shot handle keeps that registration across header logging and dispatch,
 * so HMR cannot combine one adapter's capability result with another adapter.
 * @param config - provider/model route and optional request controls.
 * @param signal - optional cancellation for adapter-owned capability lookup.
 * @returns a prepared config and its registration-bound stream entry point.
 */
async prepareCall(config: LlmCallConfig, signal?: AbortSignal): Promise<PreparedLlmCall>

/**
 * Stream one model call as raw chunks (token-level deltas). Replay state is
 * retained only when the same adapter instance owns its historical provider
 * and the target provider. Final adapter selection remains fixed through
 * asynchronous exact-model resolution and dispatch. Adapter selection,
 * dispatch, and iteration failures become terminal `error` or `aborted`
 * finish chunks; middleware, nested-call, cleanup, and consumer failures
 * remain thrown.
 * @param options - the full request; `options.provider` selects the adapter.
 * @returns the chunk stream, possibly wrapped by `llm/stream` listeners.
 */
stream(options: GenerateOptions): AsyncIterable<StreamChunk>
```

Source : [`packages/llm/llm/src/index.ts:284`](../../packages/llm/llm/src/index.ts)

<a id="llm-events"></a>

### Événements `llm/*`

<a id="llmadapters-updated--emit"></a>

#### `llm/adapters-updated` — emit

La topologie des fournisseurs a changé : un adaptateur a enregistré ou retiré des routes, ou le répertoire des fournisseurs configurables a gagné ou perdu des entrées. Cette notification de registre sans charge utile est émise à chaque point de validation, y compris lors du démontage d’un enregistrement. Les consommateurs relisent `listProviders()`, `listModels()` ou `listConfigurableProviders()` pour obtenir le nouvel état. Les échecs des observateurs sont confinés et ne peuvent pas annuler la modification du registre.

```ts cordis-catalog
/**
 * The provider topology changed: an adapter registered or unregistered
 * routes, or the configurable-provider directory gained or lost entries.
 * This payload-free registry notification fires at each commit point
 * (including registration disposal); consumers re-read `listProviders()`,
 * `listModels()`, or `listConfigurableProviders()` for the new state.
 * Observer failures are contained and cannot veto the registry mutation.
 * @mode emit
 */
'llm/adapters-updated'(): void
```

Source : [`packages/llm/llm/src/types.ts:23`](../../packages/llm/llm/src/types.ts)

<a id="llmstream--waterfall"></a>

#### `llm/stream` — waterfall

Cascade autour de chaque appel au modèle en streaming, pour les nouvelles tentatives, le rejeu et le routage. Elle est liée à LlmRuntime. Appelez `next()` pour atteindre le flux de l’adaptateur résolu, ou produisez vos propres fragments pour interrompre la cascade.

```ts cordis-catalog
/**
 * Waterfall around every streaming model call (retry, replay, routing).
 * Bound to the {@link LlmRuntime}; call `next()` to reach the resolved
 * adapter's stream, or yield your own chunks to short-circuit.
 * @param options - the full request. A LOOP-built request carries the
 *   process-local {@link markAgentLoopRequest} identity and arrives deep-frozen
 *   (mutation throws): its content is a pure function of the session log (the
 *   reconstructability Agent Note), so listeners read it, never rewrite it.
 *   Hand-built calls do not carry that marker; their messages already obey
 *   the immutable creation contract.
 * @mode waterfall
 */
'llm/stream'(this: LlmRuntime, options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>
```

Source : [`packages/llm/llm/src/index.ts:64`](../../packages/llm/llm/src/index.ts)
<!-- END GENERATED cordis-surface -->
