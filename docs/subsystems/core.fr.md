# Cœur

Le sous-système **cœur** se trouve dans [`packages/core`](../../packages/core/README.md). Chaque composition démarre ses packages : journal de session fondé sur les événements, assemblage de l’invite système, registre d’outils, types d’agents et boucle concrète qui les pilote. Cette page décrit les déclarations de la paire `agent`/`agent-loop` : la création et la propriété d’un agent, les contrats de livraison, d’annulation et d’interception du handle `Agent`, ainsi que les deux modèles de types suivis par tous les sous-systèmes. Les pages spécialisées de ce groupe et le reste du dossier sont indexés dans le [README des sous-systèmes](README.md).

## L’ossature, package par package

Un tour traverse les six packages dans une même boucle. Le pilote de [`agent-loop`](../../packages/core/agent-loop) réclame une invite en file, ouvre un tour dans le [journal de session](session.md) (`ctx.sessions`), assemble le préfixe de la requête avec [system-prompt](system-prompt.md) (`ctx.systemPrompt`) et dérive l’historique du journal, reçoit la réponse en streaming par le [seam LLM](llm-streaming.md), répartit les appels d’outils par le [registre d’outils](tools.md) (`ctx.tools`), puis ajoute au journal chaque donnée visible par le modèle avant que l’étape suivante n’en dérive. Le vocabulaire de conversation transporté par la boucle — `Message`, `ContentBlock`, `StreamChunk` et la requête au modèle — est déclaré dans [`packages/llm`](../../packages/llm/README.md) et documenté dans [llm-streaming.md](llm-streaming.md).

| Package | Responsabilité | Page |
|---|---|---|
| `session/` | Journal `SessionEvent` en ajout seul et stockage en mémoire, qui constituent l’unique source faisant autorité (`ctx.sessions`) | [session.md](session.md) |
| `system-prompt/` | Assemblage des sections d’invite et des schémas d’outils (`ctx.systemPrompt`) | [system-prompt.md](system-prompt.md) |
| `tools/` | Registre d’outils limité à une portée et pipeline d’exécution protégé (`ctx.tools`) | [tools.md](tools.md) |
| `agent/` | Interface `Agent`, registre actif, portée de l’initiateur et vocabulaire des événements `agent/*` (`ctx.agents`) | cette page |
| `agent-loop/` | Pilote concret qui implémente le contrat public `Agent` (`ctx.agentLoop`) | cette page |
| `scope/` | Primitive d’enregistrement par portée sur laquelle les registres et la boucle fondent la portée propre à chaque agent | [scope.md](scope.md) |

`scope/` est l’unique package qui n’est pas un service : cette bibliothèque sans dépendance (`createScope`/`scopeOf`/`scopeTarget`) se place sous `session/` et `system-prompt/` dans le graphe des modules afin qu’ils puissent la consommer sans cycle. `agent-loop` est l’unique implémentation concrète du contrat public `Agent`. Elle se trouve ici parce qu’elle constitue la boucle produit par défaut de LasmeX et exécute chaque pilote dans `ctx.agents.withInitiator()`. Les plugins d’extension dépendent de `agent`, y compris lorsqu’ils ont besoin de l’agent initiateur, et jamais directement de `agent-loop`. La boucle reste ainsi remplaçable. La composition par défaut qui relie cette ossature en un agent exécutable est [`examples/agent-spine-demo`](../../packages/examples/agent-spine-demo/README.md).

## Création et propriété

Les consommateurs créent les agents au moyen de `ctx.agents`. `create()` construit une nouvelle session et un nouvel agent sous un `SessionId` fourni par l’appelant, tandis que `resume()` charge d’abord une session persistée. Ils peuvent aussi les déclarer dans les entrées de configuration de la boucle. La création par programmation renvoie le handle du propriétaire :

Source : [`packages/core/agent/src/index.ts`](../../packages/core/agent/src/index.ts)

```ts type-equiv
/**
 * An owned agent plus its disposer, returned by {@link AgentRegistry.create} /
 * {@link AgentRegistry.resume}. The disposer is a CAPABILITY: among consumers,
 * only the holder can tear this agent down. The registered factory provider is
 * also a structural owner because the scoped agent depends on that provider's
 * service API; provider unload stops and drains every live handle it made.
 * `dispose()` stops the loop, awaits its exit, unregisters the agent, removes
 * its session from the store, and finally unwinds its scoped world.
 *
 * `ctx.agents.get(id)` still returns a bare {@link Agent} — the handle is
 * exposed only to the consumer owner that created it; the structural provider
 * reaches the same teardown internally. Config-created agents (the loop's own
 * startup) are owned by the loop fiber and never need a handle.
 */
interface AgentHandle {
  agent: Agent
  dispose(): Promise<void>
}
```

`CreateAgentOptions` contient l’identité partagée et tout ce dont un nouvel agent a besoin avant sa publication : métadonnées de session (`meta` — `cwd` validé, lignée du fork, limite de la graine, classification de l’origine et profondeur de délégation), préfixe de rejeu `seed` facultatif pour les forks, `AgentOptions` propres à l’agent, `signal` d’annulation réservé à la création et `setup`. `ResumeAgentOptions` est son équivalent pour une identité persistée : `resumeSessionId`, `agentOptions`, `signal` et `setup`. Le rappel `setup` (`AgentSetup`) compose l’environnement limité à l’agent alors que les deux identifiants ne sont pas encore publiés. Tout ce qui est enregistré par `agentCtx` existe avant `agent/created` et le premier assemblage d’invite. Le rappel peut renvoyer une validation synchrone invoquée juste avant la publication. Un rejet de la configuration, une exception de la validation ou le démontage par le propriétaire annule la transaction sans publier aucun des deux identifiants.

`AgentFactory` est l’interface de création derrière le registre. La boucle enregistre sa fabrique avec `ctx.agents.setFactory()` ; les consommateurs utilisent ainsi `ctx.agents` sans dépendre du package concret de la boucle. Les signatures exactes de `create`/`resume` et les contrats d’annulation de transaction figurent dans la [section générée](#ctxagents--agentregistry) ci-dessous.

## Le handle de l’agent
<a id="the-agent-handle"></a>

`Agent` est l’interface programmée par chaque plugin, qu’il s’agisse d’une interface utilisateur, de hooks ou d’un orchestrateur. `ctx.agents.get(id)` la renvoie et la [portée de l’initiateur](#initiating-agent) la transporte. L’implémentation concrète reste interne au package lasmex-agent-loop ; aucun composant extérieur à la boucle n’en dépend. La méthode unifiée `send` expose directement la cible et le comportement de réveil. `followup`, `steer` et `inject` sont des alias aux paramètres fixes.

Source : [`packages/core/agent/src/types.ts`](../../packages/core/agent/src/types.ts)

```ts type-equiv
/** Public live-agent handle. */
interface Agent {
  /** The single identity shared with {@link session}. */
  readonly id: SessionId
  /** The provider route and model this agent's requests use. */
  readonly options: AgentOptions
  /** The live session this agent drives; its log is the durable source of truth. */
  readonly session: Session
  /** The agent-owned projection of durable pending work. */
  readonly inbox: Inbox
  /** The current lifecycle state, mirrored on every `agent/status` transition. */
  readonly status: AgentStatus
  /** Agent-scoped context; its contributions are agent-local, unwind on disposal, and reject registration afterward. */
  readonly ctx: Context

  /**
   * Clear queued and steering work — unless `keepInbox` — and abort the active
   * turn or between-turn task. The first cause wins for that activity. With no
   * active activity, cancellation is a no-op and does not arm later work.
   * @param cause - the stable caller intent carried by the active operation signal.
   * @param options - cancellation options; `keepInbox` preserves pending work.
   */
  cancel(cause: AgentCancelCause, options?: CancelOptions): void

  /**
   * Resolve after the current whole-agent activity reaches quiescence. This
   * follows replacement work started before the observed driver retires,
   * but does not identify the settlement of any particular message.
   * @returns fulfillment after no active driver or maintenance task remains.
   */
  whenIdle(): Promise<void>

  /**
   * Run one non-turn maintenance task from the true idle phase. The task starts
   * synchronously after claiming that phase; later waking input remains in the
   * inbox until the task settles, while public status stays `idle`.
   * `whenIdle()` follows both the task and any waking work released behind it.
   * @param task - operation whose fulfillment or rejection is preserved, with a signal aborted by {@link cancel}.
   * @throws synchronously when turn-driving or another maintenance task already owns the agent.
   * @returns the task promise.
   */
  runMaintenance<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T>

  /**
   * Route identified input to an inbox boundary and optionally wake the driver.
   * Waking input submitted after active cancellation is queued for the next
   * turn and runs when the aborted activity converges to idle; a `disposed`
   * cancel leaves it parked. A wake submitted while already idle always opens
   * its turn boundary, even when its message is cleared before the driver
   * claims ([cancel-convergence wake latch](../../../../.agents/notes/implemented/bug-fix/2026-08-07-cancel-convergence-wake-latch.md)).
   * @param message - identified content and the source that supplied it.
   * @param target - the preferred next-turn or next-step inbox boundary.
   * @param wakeup - whether delivery may wake the driver.
   */
  send(message: UserMessage, target: InboxTarget, wakeup: boolean): void

  /**
   * Queue an ordinary follow-up turn and wake the driver. The item becomes the
   * sole ordinary message of its own turn.
   * @param message - identified prompt content and the source that supplied it.
   */
  followup(message: UserMessage): void

  /**
   * Submit steering for the nearest step. An idle driver starts a turn;
   * a running driver consumes it at its next step boundary.
   * A rejected step leaves steering parked in the inbox until the next
   * wake; cancellation or disposal may discard pending steering.
   * @param message - identified steering content and the source that supplied it.
   */
  steer(message: UserMessage): void

  /**
   * Queue model-facing context for the next pre-step without waking the
   * driver. A running driver claims it at the nearest later step boundary;
   * idle drivers leave it pending until follow-up or steering
   * wakes them. It may miss a request whose pre-step already claimed its
   * batch. Cancellation or disposal may discard pending context.
   * @param message - identified injected context and the source that supplied it.
   */
  inject(message: UserMessage): void
}
```

```ts type-equiv
/**
 * An agent's lifecycle state, emitted on every transition as `agent/status`:
 * `idle` means no driver is active; `running` begins when waking input starts
 * cancellable pre-step processing and lasts while the driver drains,
 * closes, or checkpoints turns. Disposal removes the agent from its registry;
 * it is not a third observable status.
 */
type AgentStatus = 'idle' | 'running'
```

`running` décrit tout l’intervalle pendant lequel le pilote vide le travail et peut couvrir plusieurs tours consécutifs en file ; il ne prouve pas qu’un tour reste ouvert. Le démontage retire l’agent du registre et émet `agent/disposed` ; il ne s’agit pas d’un état terminal. `followup()` ne renvoie aucun handle : son `MessageId` identifie les faits durables d’insertion, de réclamation et d’abandon dans la boîte de réception, pas une sortie ultérieure de l’assistant ni la fin d’un tour. `whenIdle()` observe l’agent entier. Les appelants ne peuvent donc appeler exécution l’intervalle entre un reçu et l’inactivité que s’ils possèdent explicitement cet intervalle ([décision](../../.agents/notes/implemented/architecture/2026-07-30-followup-enqueue-and-owned-runs.md)).

```ts type-equiv
/** Merge-extensible agent creation options. Persona belongs to system-prompt sections. */
interface AgentOptions {
  /** Provider route (must have a registered adapter at call time). */
  provider?: string
  /** Model id interpreted by the selected provider adapter. */
  model?: string
  /** Maximum output tokens for each conversation-model request. */
  maxTokens?: number
}
```

La répartition exige `provider` et `model` après `agent/request`. Lorsqu’il est présent, `maxTokens` doit être un entier positif sûr et limite chaque requête au modèle de conversation. Son omission permet à la valeur par défaut de l’adaptateur du modèle exact de se matérialiser avant l’en-tête de la requête, ou laisse autrement le comportement du fournisseur inchangé. Une section d’invite `deployment:persona` limitée à l’agent peut masquer la personnalité globale par défaut.

La boîte de réception définit le vocabulaire de livraison : deux listes ordonnées de messages en attente, que l’agent possède sous forme de projection durable :

```ts type-equiv
/** One of the two ordered pending-message lists owned by an agent. */
type InboxTarget = 'next-turn' | 'next-step'
```

Chaque occurrence en attente est son propre `UserMessage` ; `MessageId` en est l’unique identité. `Inbox.append`, `prepend`, `replace`, `remove`, `clear`, `splice` et `claim` enregistrent des modifications durables normalisées `agent/inbox/spliced` et refusent les identifiants en attente en double. `replace(messageId, newMessage)` et `remove(messageId)` recherchent le message en attente dans les deux listes. Le remplacement peut changer son identité ; il émet alors l’ancien message comme abandonné, puis le nouveau comme inséré. Les suppressions ordinaires et `clear()` sont des annulations. `claim(target)` retire le lot proposé pour l’étape — toutes les entrées `next-step` et, à la limite d’un tour, un message `next-turn` — au moyen de modifications de suppression pure, sans notification d’abandon. La boucle émet séparément une notification de réclamation pour chaque message. Les consommateurs de la file entière, comme les projections d’interface, reconstruisent `nextTurn` et `nextStep` depuis les modifications durables. Ceux qui suivent un message emploient les notifications exactes `agent/inbox/inserted`, `claimed` et `discarded`.

Annulation :

```ts type-equiv
/** Options for {@link Agent.cancel}. */
interface CancelOptions {
  /**
   * Preserve queued and steering inbox items instead of discarding them. The
   * active turn is still aborted, but un-started and pending work survives for a
   * later turn and no canceled inbox splice is logged.
   */
  keepInbox?: boolean | undefined
}
```

```ts type-equiv
/** Why an active agent driver was cancelled. */
type AgentCancelCause =
  | { readonly kind: 'user' }
  | { readonly kind: 'parent' }
  | { readonly kind: 'hook'; readonly reason: string }
  | { readonly kind: 'disposed' }
```

La cause est une entrée limitée au même processus et imposée par TypeScript. Le détenteur d’une annulation active la copie dans `AbortSignal.reason`, disponible uniquement au runtime. Un signal n’accorde aux écouteurs coopératifs aucun droit de classification. L’événement durable `turn/end` conserve le résultat général `{ kind: 'aborted' }`. Enregistrer l’auteur de la demande d’annulation exigerait un événement durable distinct au lieu de surcharger le résultat terminal.

La [taxonomie des événements](../architecture.md#events) définit les contrats de cycle de vie, de point de contrôle et de cascade de `agent/*`. Les limites des tours et des étapes sont des événements de session durables plutôt que des émissions de l’agent.

<a id="initiating-agent"></a>

## Agent initiateur

L’initiateur propre au processus transporté par `ctx.agents` est l’`Agent` exact décrit ci-dessus, pas une structure distincte ni une identité copiée. Sa présence ambiante ne prouve ni qu’il est actif ni qu’il est autorisé. La [décision sur la portée de l’initiateur](../../.agents/notes/implemented/architecture/2026-07-15-agent-initiator-scope.md) définit son cycle de vie et ses règles de portée.

## Décisions d’interception

Les décisions précédant une étape emploient le même type identifié `UserMessage` que l’entrée durable de rôle utilisateur. Le lot admis fait autorité et conserve l’`id` et la `source` de chaque message. Les ponts de hooks associent leurs champs de décision natifs à ce résultat typé.

Source : [`packages/core/agent/src/types.ts`](../../packages/core/agent/src/types.ts)

`agent/pre-step` reçoit une charge utile contenant le lot réclamé de manière exclusive (`messages`), les coordonnées de l’étape proposée (`turn`, `step`) et le `signal` d’annulation du tour courant. La proposition initiale s’exécute dans un tour ouvert avant toute étape. Une continuation d’outil peut soumettre un lot réclamé vide entre deux étapes :

L’événement renvoie une `PreStepDecision`. Un rejet n’ouvre aucune étape. Une admission fournit le lot complet de messages ajouté après `step/start`. Les messages réclamés qu’omet la décision finale restent retirés, tandis que les entrées insérées après la réclamation demeurent en attente :

```ts type-equiv
/** Whether and with which messages the loop enters a proposed step. */
type PreStepDecision =
  | { kind: 'reject' }
  | { kind: 'enter'; messages: UserMessage[] }
```

`agent/request-error` s’exécute après la fermeture d’une étape de modèle en échec et avant celle de son tour. Les écouteurs peuvent réparer l’état durable ou attendre une politique tant que le signal du tour en échec reste actif. Un écouteur qui traite l’erreur renvoie `{ kind: 'retry' }` sans appeler `next()`. La valeur par défaut `undefined` laisse l’échec terminal.

```ts type-equiv
/** Action returned by a listener that owns model-request recovery. */
type RequestErrorAction = { kind: 'retry' } | undefined
```

`agent/pre-step` est l’unique chaîne d’écouteurs en série avant la dérivation de la requête. `agent/turn-stopping` s’exécute lorsqu’un tour ne possède plus de continuation d’outil ni de pilotage, avant un dernier vidage du pilotage.

`agent/session-start` transporte un `SessionStartSource`, qui indique pourquoi le cycle de vie de la session a commencé. Un pont l’utilise pour indexer sa correspondance SessionStart :

```ts type-equiv
/** Why a session lifecycle began; seeded creates are `startup`, while persisted loads are `resume`. */
type SessionStartSource = 'startup' | 'resume' | 'clear' | 'compact'
```

## Sessions

Une `Session` est un **journal en ajout seul** de `SessionEvent` typés qui constitue l’unique source faisant autorité. L’historique des messages LLM est *dérivé* du journal avec `deriveMessages()` plutôt que stocké séparément. Chaque entrée contient un `seq` monotone, un `time`, une charge utile discriminée par `type` et des données `data`. Les variantes de surface peuvent aussi énumérer les événements antérieurs cités dans `sourceEventSeqs` et contenir un `surfaceOp`.

Les champs conditionnels exacts de l’enveloppe `SessionEvent`, les douze variantes d’événements (`turn/start`, `turn/end`, `step/start`, `step/end`, `user/message`, `assistant/chunk`, `assistant/message`, `tool/call`, `tool/result`, `steering/message`, `todo/write`, `request/header`), les règles de projection de `deriveMessages()`, les motifs `TurnTrigger`/`TurnEndReason` et les règles d’inclusion des exécutions et des événements autonomes figurent dans **[session.md](session.md)**. La durabilité du journal — interface `SessionPersistence`, backends JSONL et SQLite, point de contrôle `session/flush`, récupération après incident et `SessionHeader` — est décrite dans **[persistence.md](persistence.md)**.

## `ToolDefinition`

Le type de création du pipeline qui appartient au cœur décrit ce qu’*est* chaque outil enregistré : un `ToolSchema` destiné au modèle, une fonction `execute` et des rappels facultatifs pour le contenu final et l’interface. L’auteur d’un outil le construit rarement à la main, car le DSL `defineTool` le produit avec des arguments typés. Il s’agit néanmoins du contrat conservé par le registre et utilisé par la boucle pour la répartition.

Ses champs complets, le DSL de schéma typé `defineTool`/`ValueSchemaSpec`/`ParameterSchemaSpec`, les types de cascade `ToolExecution`/`ToolExecutionResult` et les types d’interface pour la présentation des outils figurent dans **[tools.md](tools.md)**.

## Modèles de types communs au dépôt

Deux modèles reviennent dans tous les sous-systèmes et sont documentés une seule fois, ici.

<a id="the-map--derived-union-pattern"></a>

### Le modèle `…Map → derived-union`

Presque tous les types somme extensibles de LasmeX suivent le même modèle : une interface indexée par une balise discriminante, la `…Map`, dont l’union est dérivée avec `keyof`. Les plugins ajoutent des variantes par **fusion de déclarations**, sans modifier le package propriétaire.

```ts ignore-check
// The pattern, schematically:
interface ThingMap {
  'a': { kind: 'a'; /* … */ }
  'b': { kind: 'b'; /* … */ }
}
type ThingKind = keyof ThingMap          // 'a' | 'b'
type Thing = ThingMap[keyof ThingMap]    // the discriminated union

// A plugin extends it without touching the source package:
declare module 'lasmex-llm' {
  interface ThingMap {
    'c': { kind: 'c'; /* … */ }
  }
}
```

Six tables canoniques emploient ce modèle ; les auteurs de plugins étendent celles-ci :

| Table | Package | Type dérivé | Catalogue |
|---|---|---|---|
| `ContentBlockMap` | lasmex-llm | `ContentBlock` | [llm-streaming.md](llm-streaming.md#content-blocks-and-messages) |
| `MessageSourceMap` | lasmex-llm | `MessageSource` | [llm-streaming.md](llm-streaming.md#content-blocks-and-messages) |
| `FinishReasonMap` | lasmex-llm | `FinishReason` | [llm-streaming.md](llm-streaming.md#the-model-request-and-result) |
| `TurnTriggerMap` | lasmex-session | `TurnTrigger` | [session.md](session.md) |
| `TurnEndReasonMap` | lasmex-session | `TurnEndReason` | [session.md](session.md) |
| `SessionEventMap` | lasmex-session | `SessionEvent` | [session.md](session.md) |

Les consommateurs appliquent le plus souvent un `switch` sur deux grandes unions discriminées : **`StreamChunk`**, le protocole de streaming, et **`SessionEvent`**, l’entrée du journal. Conformément à la convention du dépôt, effectuez le `switch` sur la balise plutôt que d’enchaîner des `if`, afin que chaque branche réduise le type et qu’une faute dans une balise empêche la compilation.

### Identifiants marqués
<a id="branded-ids"></a>

Les identifiants transmis entre packages sont **marqués**. Leur structure est celle d’une chaîne, mais leurs types ne sont pas interchangeables : un `SessionId` ne peut pas remplacer un `CallId`. Leur construction passe par une fabrique propre au type ; la comparaison, la journalisation et le JSON se comportent comme pour des chaînes ordinaires.

La primitive `Branded<B>` se trouve dans son propre package réservé aux types, [lasmex-brand](../../packages/util/brand), sans code d’exécution ni dépendance envers un package de LasmeX. Chaque package peut ainsi marquer les identifiants qu’il possède sans dépendre d’un package de fonctionnalité sans rapport.

Source : [`packages/util/brand/src/index.ts`](../../packages/util/brand/src/index.ts)

```ts type-equiv
/** A string carrying a compile-time-only brand `B`. */
type Branded<B extends string> = string & { readonly [BRAND]: B }
```

Les deux identifiants du cœur sont `CallId`, qui corrèle un appel d’outil avec son résultat dans lasmex-llm, et `SessionId`, identité partagée par l’agent actif et la session durable dans lasmex-session. Les packages de fonctionnalités marquent aussi leurs propres identifiants, comme `JobId` dans [jobs.md](jobs.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Générée depuis les sources par `scripts/gen-cordis-catalog.ts` (sa fraîcheur est vérifiée par `pnpm run verify-cordis-catalog` dans doc-sync ; régénérez-la avec `pnpm run gen-cordis-catalog`) — cette section est identique octet pour octet dans les deux langues de la page. Les blocs de signature utilisent une clôture `ts cordis-catalog` et conservent la JSDoc source d’origine. Les modes de répartition sont définis dans le [guide d’introduction](../cordis-primer.md#dispatch-modes), et l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxagentdefaultmodel--agentdefaultmodelconfig"></a>

### `ctx.agentDefaultModel` — `AgentDefaultModelConfig`

Possède la sélection du modèle par défaut indépendamment de tout hôte ou transport. L’entrée de composition reste utilisable sans fournisseur de réglages. Lorsqu’un fournisseur est monté, sa couche utilisateur est lue en direct.

```ts cordis-catalog
/**
 * Read the current default model selection.
 * @returns a detached provider, model, and optional reasoning selection.
 */
currentSelection(): ModelSelection

/**
 * Save the complete default model selection. A deployment without a settings
 * provider keeps its composition entry.
 * @param next - resolved selection accepted by an entry point.
 * @returns fulfillment after the optional settings write settles.
 */
async saveSelection(next: ModelSelection): Promise<void>
```

Source : [`packages/core/agent-default-model/src/index.ts:64`](../../packages/core/agent-default-model/src/index.ts)

<a id="ctxagentloop--agentloop"></a>

### `ctx.agentLoop` — `AgentLoop`

Fabrique concrète des agents et service de pilotage.

```ts cordis-catalog
/**
 * Create an agent and session under one caller-supplied identity, owned by
 * the accessing fiber. Constructor-driven config calls mint a fresh combined
 * id before entering this boundary.
 * @param id - shared agent/session identity.
 * @param options - concrete loop options.
 * @param meta - optional fresh-session workspace metadata.
 * @returns the published running agent.
 */
create(id: SessionId, options: AgentOptions = {}, meta: Pick<SessionHeader, 'cwd'> = {}): Agent

/**
 * Create an owned agent on a caller-supplied session id.
 * @param ownerCtx - caller context that structurally owns the lifecycle.
 * @param options - identities, session seed/metadata, loop options, setup, and cancellation.
 * @returns the published handle.
 */
async createAgent(ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle>

/**
 * Resume an owned agent from the configured persistence service.
 * @param ownerCtx - caller context that owns load, setup, and the live lifecycle.
 * @param options - persisted identity, loop options, setup, and cancellation.
 * @returns the published handle.
 */
async resume(ownerCtx: Context, options: ResumeAgentOptions): Promise<AgentHandle>
```

Types : [SessionHeader](persistence.md)

Source : [`packages/core/agent-loop/src/index.ts:310`](../../packages/core/agent-loop/src/index.ts)

<a id="ctxagentpresets--agentpresets"></a>

### `ctx.agentPresets` — `AgentPresets`

Registre des préréglages d’agents du déploiement.

La découverte n’est pas mémorisée : `list()` et `resolve()` relisent les racines à chaque appel. Un préréglage créé pendant l’exécution du processus devient donc immédiatement visible, et un préréglage supprimé sous un sélecteur disparaît à la lecture suivante.

```ts cordis-catalog
/**
 * Every preset the configured roots currently supply.
 * @returns the presets, first-root-wins per id.
 */
async list(): Promise<AgentPreset[]>

/**
 * Resolve one preset by id.
 *
 * A broken preset resolves — deleting one, reading one, and reporting one
 * all need the row — and the mounting paths refuse it AFTER resolution
 * through {@link resolveMountable}.
 * @param id - the preset id, or `undefined` for {@link defaultId}.
 * @returns the resolved preset.
 * @throws when no configured root supplies that id.
 */
async resolve(id?: string): Promise<AgentPreset>

/**
 * Compose one agent from a preset: ensure the preset's standing mount, then
 * parent the agent's scope key to it so the mount's registrations and
 * listeners cover this agent.
 *
 * Call from the agent factory's `setup(agentCtx)`; a rejection there rolls
 * the agent creation back, so a broken preset never yields a half-composed
 * session.
 * @param agentCtx - the agent's scope context.
 * @param id - the preset id, or `undefined` for {@link defaultId}.
 * @returns the preset that was composed, for the caller to record.
 * @throws when the preset is unknown or its composition is unusable.
 */
async mount(agentCtx: Context, id?: string): Promise<AgentPreset>

/**
 * Join one agent to the SAME standing composition another already runs on.
 *
 * This is how a child agent inherits its parent's capabilities. It is a bind,
 * not a mount: the parent's generation is already composed, so the child gets
 * that exact instance — the same plugin objects, the same tool registrations,
 * the same prompt sections. Re-resolving the parent's preset by id instead
 * would re-read the roster, and a composition file edited since the parent
 * started would hand the child a DIFFERENT generation than the one its
 * parent's history was produced under (and a preset deleted since would fail
 * the child outright while its parent keeps running).
 *
 * Synchronous, and with no composition failure mode of its own — it reads no
 * roster, mounts nothing, and touches no file — which is what lets a child
 * creation window use it: the two in-process subagent drivers compose their
 * children inside a synchronous `setup`. It still rejects a caller error, as
 * the `@throws` below record.
 *
 * A parent that joined no preset — a rosterless deployment — yields no join
 * and no error: there, the model-facing rows sit in the host composition and
 * the child already sees them through the global layer.
 * @param agentCtx - the joining agent's scope context.
 * @param parentCtx - the scope context of the agent whose composition to join.
 * @returns the preset id joined, or undefined when the parent joined none.
 * @throws when `agentCtx` carries no scope, or has already joined a preset.
 */
composeFrom(agentCtx: Context, parentCtx: Context): string | undefined

/**
 * The preset one live agent runs on.
 *
 * Read from the live scope chain rather than from the session, so it answers
 * for an agent whose session has not recorded a preset yet — a child agent
 * whose durable header is being built from its parent's composition.
 * @param agentCtx - the agent's scope context.
 * @returns the preset id, or undefined when the agent joined none.
 */
composedPreset(agentCtx: Context): string | undefined

/**
 * Read one preset's composition text.
 * @param id - the preset id.
 * @returns the composition exactly as stored.
 * @throws when no configured root supplies that id.
 */
async read(id: string): Promise<string>

/**
 * Create a locally authored preset by copying an existing one whole.
 *
 * Copy is the only authoring write. Composition text never crosses this
 * seam: the source is named by id and its directory is copied as it stands,
 * so the copy is exactly as loadable as its source and authoring grants no
 * capability the roster did not already carry. The copy is NOT mounted to
 * validate — a source that mounts today yields a copy that mounts today.
 * @param from - the preset the copy starts from; shipped presets are the
 * primary source, so any trust is accepted.
 * @param id - the new preset's id, which becomes its directory name.
 * @param name - display name for the copy; absent falls back to the id.
 * @throws when the source is unknown, the id is unusable or already taken,
 * or the deployment configures no writable root.
 */
async copy(from: string, id: string, name?: string): Promise<void>

/**
 * Delete a locally authored preset.
 * @param id - the preset id.
 * @throws when the preset is unknown or ships with the deployment.
 */
async remove(id: string): Promise<void>

/**
 * One agent's instance of a service its preset mounted.
 *
 * A preset publishes services behind `isolate` realms, which are invisible
 * outside the group that declares them — including to the host. This is how a
 * caller holding the agent reads one anyway: a request that is ABOUT a
 * session but arrives from outside it, which is every browser RPC.
 *
 * Read addressing only. A host row that `inject`s a service cannot use this,
 * because injection resolves before any session exists and has no agent to
 * key by; such a service belongs on the host plane instead.
 * @param agent - the agent whose composition to look inside.
 * @param name - the service name as the preset's rows resolve it.
 * @returns the agent's instance, or undefined when its preset mounts none.
 */
serviceFor<K extends string & keyof Context>(agent: { ctx: Context }, name: K): Context[K] | undefined

/**
 * Re-link one agent to a different preset's standing composition.
 *
 * Only valid while the agent has produced nothing: swapping tools mid
 * conversation would leave logged tool calls the new composition cannot
 * make. The CALLER owns that check — this method does not read session
 * history.
 *
 * The swap is a parent re-link, not an unmount: standing mounts are shared
 * and permanent, so the old composition stays for its other agents and the
 * new one is ensured BEFORE the link moves. An unknown or unusable preset
 * therefore throws with the agent exactly as it was — there is no torn-down
 * state to restore. The re-link runs through the binding this roster kept
 * from the agent's mount — lasmex-scope's only re-link authority. An agent
 * that never composed one has nothing to re-link: the switch is then the
 * agent's first bind, exactly a mount.
 * @param agentCtx - the agent's scope context.
 * @param id - the preset to compose the agent from instead.
 * @returns the preset now installed.
 * @throws when the preset is unknown or its composition is unusable.
 */
async recompose(agentCtx: Context, id: string): Promise<AgentPreset>

/**
 * The standing scope key of one preset, for a host reader with no agent.
 *
 * A cold transcript read resolves tool presenters against the composition
 * the session recorded, and the standing mount makes that possible without
 * resuming anything: ensuring the mount composes plugins but starts no
 * agent, no session, and no turn.
 * @param id - the preset id, or `undefined` for {@link defaultId}.
 * @returns the standing scope key readers pass as a registry view scope.
 * @throws when the preset is unknown or its composition is unusable.
 */
async standingKeyFor(id?: string): Promise<ScopeKey>
```

Types : [ScopeKey](scope.md)

Source : [`packages/preset/agent-presets/src/index.ts:82`](../../packages/preset/agent-presets/src/index.ts)

<a id="ctxagents--agentregistry"></a>

### `ctx.agents` — `AgentRegistry`

Service des agents (`ctx.agents`) : suit les agents actifs et transporte l’agent initiateur dans une chaîne de pilotage asynchrone propre au processus. La *création* d’un agent est fournie par le plugin qui implémente AgentFactory (`lasmex-agent-loop`) et s’enregistre au moyen de setFactory.

Les méthodes d’initiateur fournissent uniquement une attribution causale dans le même processus. La présence ambiante ne prouve ni l’activité ni l’autorisation ; les sujets et propriétaires restent explicites, tout comme l’identité aux limites des workers, des processus, de la persistance et du protocole filaire. Les promesses renvoyées sont attendues au démontage, à l’exception d’une lignée imbriquée qui déclenche le démontage de sa propre fibre propriétaire et ne peut pas s’attendre elle-même.

```ts cordis-catalog
/**
 * Read the Agent that initiated the inherited asynchronous driver chain.
 * Use this optional form for logging, tracing, metrics, or host attribution
 * that also supports agentless calls. When a parent creates a child, setup
 * reports the causal parent while `agentCtx.agent` identifies the child.
 * @returns the inherited Agent, or `undefined` outside an initiator boundary
 *   and inside an explicit clearing boundary.
 * @throws when this service instance has been disposed.
 */
currentInitiator(): Agent | undefined

/**
 * Read the initiating Agent and fail when no initiator boundary is active.
 * Use this for private helpers contractually below a driver, or for a
 * deployment-owned outbound request whose contract forbids agentless calls.
 * Generic or direct-call paths use optional lookup or explicit request fields.
 * @returns the inherited Agent.
 * @throws when no initiator is active or this service instance has been disposed.
 */
requireInitiator(): Agent

/**
 * Run an operation with one exact Agent as its process-local initiator. The
 * exact synchronous value or Promise returned by the operation is preserved.
 * Custom drivers and test harnesses wrap their complete returned foreground
 * lifetime.
 * A queue or wire receiver may establish this boundary only after validating
 * explicit identity and resolving the exact live Agent; this method does neither.
 * Detached work remains owned by the subsystem that starts it.
 * @param agent - initiating Agent to inherit; presence is neither liveness proof nor authorization.
 * @param operation - synchronous or asynchronous operation to invoke.
 * @returns the exact value returned by `operation`.
 * @throws when the initiator scope is closing/disposed, or when `operation` throws.
 */
withInitiator<T>(agent: Agent, operation: () => T): T

/**
 * Run an operation inside a boundary that hides any inherited initiating
 * Agent. The exact synchronous value or Promise is preserved.
 * Use this while creating lazy shared timers, queue pumps, pool maintenance,
 * watchers, or exporters so they do not inherit the first Agent that happens
 * to initialize them. It clears only initiator attribution, not explicit
 * fields, and does not own or drain detached resources.
 * @param operation - synchronous or asynchronous operation to invoke without an initiator.
 * @returns the exact value returned by `operation`.
 * @throws when the initiator scope is closing/disposed, or when `operation` throws.
 */
withoutInitiator<T>(operation: () => T): T

/**
 * Register the agent-creation factory (the loop calls this on construction,
 * effect-scoped). A traced Cordis service is canonicalized to its concrete
 * target; each create/resume call is then traced through that caller's
 * context so ownership follows the caller without stacking proxy layers.
 * Throws if a factory is already registered. Returns the disposer; on
 * dispose the factory slot is cleared.
 * @param factory - the loop-owned factory {@link create}/{@link resume} delegate to.
 * @returns the disposer that clears the factory slot. The exact
 *   Cordis effect disposer (single-shot): composite (generator) effects may
 *   yield it directly — exact identity nests the teardown in order.
 */
setFactory(factory: AgentFactory): () => void

/**
 * Create and publish a new agent through the registered factory.
 * Distinct from {@link register} (which records an already-constructed
 * agent): this constructs the agent and its session. Rejects if no factory is
 * registered or creation/setup fails. The resolved {@link AgentHandle} lets
 * the owner tear down exactly this agent.
 * @param options - shared identity, session seed/metadata, and agent options.
 * @returns the handle after setup, rollback-covered publication, and loop start complete.
 */
async create(options: CreateAgentOptions): Promise<AgentHandle>

/**
 * Load a persisted session and resume an agent on it through the registered
 * factory. Rejects if no factory is registered; the factory rejects if
 * session persistence is not configured or persistence/setup fails.
 * @param options - persisted identity, configuration, and optional setup.
 * @returns the handle after setup, rollback-covered publication, and loop start complete.
 */
async resume(options: ResumeAgentOptions): Promise<AgentHandle>

/**
 * Register a live agent. Throws if an agent with the same id is already
 * registered. Emits `agent/created` on registration and `agent/disposed`
 * when the calling fiber is disposed — both with the agent's scope carrier
 * (`scopeTarget(agent, agent)`): the subject is the agent in hand, so the
 * emits are scope-filtered regardless of which context invoked `register`
 * (calling through `agent.ctx` scopes EFFECTS; dispatch scoping always
 * requires passing the carrier). Returns the disposer.
 * @param agent - the already-constructed agent to record in the store.
 * @returns the EXACT Cordis effect disposer (single-shot; a repeat call
 *   returns undefined without awaiting an in-flight teardown). Exact
 *   identity is load-bearing: a composite (generator) effect that owns a
 *   teardown ORDER — the agent factory's lifecycle chain — must yield THIS
 *   function so Cordis nests the unregistration at that yield position;
 *   yielding a wrapper would leave it disposing as a concurrent sibling on
 *   owner unload, unregistering the agent (and emitting `agent/disposed`)
 *   while its final turn is still draining.
 */
register(agent: Agent): () => void

/**
 * Insert an already-constructed agent without announcing it. This is the
 * advanced ordered-lifecycle primitive used by the async agent factory: it
 * first completes setup while the agent is unpublished, then assigns the
 * returned detach closure into its pre-installed composite teardown before
 * calling {@link announce}. Ordinary callers use {@link register}.
 * @param agent - the prepared, unpublished agent.
 * @param owner - live agent whose scoped context created this agent, or
 *   undefined for a top-level runtime root. This is runtime ownership, not
 *   the resumed session's durable parent lineage.
 * @returns an idempotent closure that removes this exact entry and emits
 *   `agent/disposed` with listener failures contained. When called from a
 *   synchronous `agent/created` listener, removal and disposal wait until
 *   that creation dispatch unwinds.
 */
enter(agent: Agent, owner: Agent | undefined): () => void

/**
 * Announce an agent previously inserted with {@link enter}.
 * @param agent - the live inserted agent to announce.
 * @throws if `agent` is not the exact live registry entry for its id, or its
 *   creation announcement already began (including a reentrant call from a
 *   creation listener).
 */
announce(agent: Agent): void

/**
 * Look up a live agent.
 * @param id - the shared agent/session id to look up.
 * @returns the agent, or undefined when no live agent has that id.
 */
get(id: SessionId): Agent | undefined

/**
 * Test whether a live agent was created through one exact parent agent's
 * scoped context. Runtime ownership is independent of durable session
 * lineage and remains unambiguous when unrelated providers reuse an id.
 * @param id - the candidate child agent's shared agent/session id.
 * @param owner - the expected runtime creator agent.
 * @returns true only while the exact child entry is live under that owner.
 */
isOwnedBy(id: SessionId, owner: Agent): boolean

/**
 * All live agents, in registration order.
 * @returns a fresh array; mutating it does not affect the registry.
 */
list(): Agent[]

/**
 * All live top-level agents in registration order. A top-level agent was
 * created without an owning agent context; durable session lineage does not
 * affect this runtime relation, so a resumed fork may still be a root.
 * @returns a fresh array; mutating it does not affect the registry.
 */
roots(): Agent[]
```

Source : [`packages/core/agent/src/index.ts:256`](../../packages/core/agent/src/index.ts)

<a id="agent-events"></a>

### Événements `agent/*`

<a id="agentcreated--emit"></a>

#### `agent/created` — emit

Un agent entièrement configuré et une session active ont été publiés. La configuration appartient uniquement à la composition ; `agent/session-start` est le premier point d’extension qui pilote le démarrage. L’échec synchrone d’un écouteur empêche la publication, tandis que le rejet d’une promesse renvoyée est signalé. Un détachement demandé pendant la répartition attend que tous les écouteurs de création aient observé l’entrée stable.

```ts cordis-catalog
/**
 * A fully configured agent and live session were published. Setup is
 * composition-only; `agent/session-start` is the first startup-driving extension point.
 * Synchronous listener failure vetoes publication, while returned-promise
 * rejection is reported. Detach requested during dispatch waits until every
 * creation listener has observed the stable entry.
 * @param payload.agent - the newly registered agent with its live session and completed setup.
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/created'(this: Scoped<Agent>, payload: { agent: Agent }): void
```

Types : [Scoped](scope.md)

Source : [`packages/core/agent/src/runtime-types.ts:159`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentdisposed--emit"></a>

#### `agent/disposed` — emit

Un agent a quitté le registre. AgentLoop émet cet événement après l’arrêt complet du pilote et le démontage des enregistrements limités à sa portée, mais avant le détachement de la session. Les utilisateurs d’un registre personnalisé possèdent le contrat d’ordre de leur pilote.

```ts cordis-catalog
/**
 * An agent left the registry; AgentLoop emits this after driver quiescence
 * and scoped-registration unwind, but before session detachment. Custom
 * registry users own their driver-ordering contract.
 * @param payload.agent - the exact agent removed from the registry.
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/disposed'(this: Scoped<Agent>, payload: { agent: Agent }): void
```

Types : [Scoped](scope.md)

Source : [`packages/core/agent/src/runtime-types.ts:168`](../../packages/core/agent/src/runtime-types.ts)

<a id="agenterror--emit"></a>

#### `agent/error` — emit

Une étape ou un tour a échoué. La machine signale ici l’échec même lorsque l’erreur ne possède aucune position dans le tour permettant un enregistrement durable.

```ts cordis-catalog
/**
 * A step or turn errored. The machine reports a failure here even when
 * the error has no in-turn position for a durable record.
 * @param payload.agent - the agent whose turn errored.
 * @param payload.turn - the turn in which the failure surfaced.
 * @param payload.step - the step at which the failure surfaced.
 * @param payload.error - the failure, verbatim.
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/error'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; step: number; error: unknown }): void
```

Types : [Scoped](scope.md)

Source : [`packages/core/agent/src/runtime-types.ts:290`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentinboxclaimed--emit"></a>

#### `agent/inbox/claimed` — emit

Un message a quitté la boîte de réception dans son tour ouvert. Si l’étape proposée est rejetée, le message réclamé s’arrête ici : il n’est ni abandonné ni réémis comme user/message, et le tour se ferme sans étape.

```ts cordis-catalog
/**
 * One message left the inbox inside its open turn. If the proposed step
 * is rejected, the claimed message ends here: it is neither discarded nor
 * re-emitted as a user/message, and the turn closes without a step.
 * @param payload.agent - the agent whose inbox changed.
 * @param payload.message - the claimed message.
 * @param payload.turn - the owning turn.
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/inbox/claimed'(this: Scoped<Agent>, payload: { agent: Agent; message: UserMessage; turn: number }): void
```

Types : [Scoped](scope.md) · [UserMessage](session.md)

Source : [`packages/core/agent/src/runtime-types.ts:197`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentinboxdiscarded--emit"></a>

#### `agent/inbox/discarded` — emit

Un message a été abandonné dans la boîte de réception active.

```ts cordis-catalog
/**
 * One message was discarded from the live inbox.
 * @param payload.agent - the agent whose inbox changed.
 * @param payload.message - the discarded message.
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/inbox/discarded'(this: Scoped<Agent>, payload: { agent: Agent; message: UserMessage }): void
```

Types : [Scoped](scope.md) · [UserMessage](session.md)

Source : [`packages/core/agent/src/runtime-types.ts:205`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentinboxinserted--emit"></a>

#### `agent/inbox/inserted` — emit

Un message est entré dans la boîte de réception active.

```ts cordis-catalog
/**
 * One message entered the live inbox.
 * @param payload.agent - the agent whose inbox changed.
 * @param payload.message - the inserted message.
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/inbox/inserted'(this: Scoped<Agent>, payload: { agent: Agent; message: UserMessage }): void
```

Types : [Scoped](scope.md) · [UserMessage](session.md)

Source : [`packages/core/agent/src/runtime-types.ts:186`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentpre-step--waterfall"></a>

#### `agent/pre-step` — waterfall

Rejette une étape proposée ou remplace les messages qui y entrent. Appeler `next()` conserve les messages courants.

```ts cordis-catalog
/**
 * Reject a proposed step or replace the messages that enter it. Calling
 * `next()` preserves the current messages.
 * @param payload.agent - the agent proposing the step.
 * @param payload.messages - messages removed from the inbox for this step.
 * @param payload.turn - the turn that will own the step.
 * @param payload.step - the step proposed by the loop.
 * @param payload.signal - the current turn's cancellation signal.
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent.
 * @mode waterfall
 */
'agent/pre-step'(this: Scoped<Agent>, payload: { agent: Agent; messages: UserMessage[]; turn: number; step: number; signal: AbortSignal }, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>
```

Types : [Scoped](scope.md) · [UserMessage](session.md)

Source : [`packages/core/agent/src/runtime-types.ts:231`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentrequest--waterfall"></a>

#### `agent/request` — waterfall

Remplace la configuration figée de l’appel. `await next()` renvoie la configuration que la machine utiliserait, c’est-à-dire les options de l’agent pour la première requête puis l’en-tête journalisé. Renvoyez une autre valeur pour la remplacer. Le contenu visible par le modèle doit emprunter des canaux journalisés ; cette cascade ne peut pas modifier les messages.

```ts cordis-catalog
/**
 * Replace the frozen call configuration. `await next()` yields the config
 * the machine would use (agent options on the first request, the logged
 * header afterwards); return a replacement to switch. Model-visible
 * content must use logged channels; this waterfall cannot mutate messages.
 * @param payload.agent - the agent making the model call.
 * @param payload.turn - the open turn number.
 * @param payload.step - the step whose request this is.
 * @param payload.signal - the current turn's explicit abort signal.
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent.
 * @mode waterfall
*/
'agent/request'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; step: number; signal: AbortSignal }, next: () => Promise<LlmCallConfig>): Promise<LlmCallConfig>
```

Types : [LlmCallConfig](llm-streaming.md) · [Scoped](scope.md)

Source : [`packages/core/agent/src/runtime-types.ts:244`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentrequest-error--waterfall"></a>

#### `agent/request-error` — waterfall

Traite une tentative de requête au modèle en échec avant que la boucle ne réessaie ou ne ferme l’étape. Un écouteur renvoie `{ kind: 'retry' }` sans appeler `next()` lorsqu’il possède la récupération, ou appelle `next()` pour déléguer. La valeur par défaut `undefined` laisse l’échec terminal.

```ts cordis-catalog
/**
 * Handle one failed model-request attempt before the loop retries or closes
 * its step. A listener returns `{ kind: 'retry' }` without calling `next()`
 * when it owns recovery, or calls `next()` to delegate. The default
 * `undefined` leaves the failure terminal.
 * @param payload.agent - the agent whose request failed.
 * @param payload.turn - the turn containing the failed request.
 * @param payload.step - the step containing the failed request attempt.
 * @param payload.provider - the provider selected for the failed request.
 * @param payload.failure - serializable facts normalized at the final adapter boundary.
 * @param payload.retryPolicy - the policy of the adapter registration that served the failed request.
 * @param payload.signal - the turn abort signal.
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent.
 * @mode waterfall
 */
'agent/request-error'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; step: number; provider: string; failure: LlmFailure; retryPolicy: ResolvedRetryPolicy | undefined; signal: AbortSignal }, next: () => Promise<RequestErrorAction>): Promise<RequestErrorAction>
```

Types : [LlmFailure](llm-streaming.md) · [ResolvedRetryPolicy](llm-streaming.md) · [Scoped](scope.md)

Source : [`packages/core/agent/src/runtime-types.ts:260`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentsession-start--emit"></a>

#### `agent/session-start` — emit

Le cycle de vie de la session a commencé, une seule fois avant le premier tour. Utilisez `agent.inject()` pour initialiser le contexte destiné au modèle. Il s’agit d’une notification, pas d’un veto. Un démontage demandé par un propriétaire du cycle de vie est vérifié de nouveau avant le démarrage du pilote.

```ts cordis-catalog
/**
 * The session lifecycle began, once before the first turn. Use
 * `agent.inject()` to seed model-facing context. This is a notification, not
 * a veto; disposal requested by a lifecycle owner is rechecked before the
 * driver starts.
 * @param payload.agent - the agent whose session lifecycle began.
 * @param payload.source - why the session started (fresh startup, resume, …).
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/session-start'(this: Scoped<Agent>, payload: { agent: Agent; source: SessionStartSource }): void
```

Types : [Scoped](scope.md)

Source : [`packages/core/agent/src/runtime-types.ts:217`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentstatus--emit"></a>

#### `agent/status` — emit

L’état de l’agent a changé (`idle` ⇄ `running`). Une livraison qui réveille l’agent passe en `running` de manière synchrone après avoir réservé l’annulation. `idle` signifie qu’aucun pilote ne reste planifié ni actif.

```ts cordis-catalog
/**
 * Agent status changed (`idle` ⇄ `running`). A waking delivery enters
 * `running` synchronously after reserving cancellation; `idle` means no
 * driver remains scheduled or active.
 * @param payload.agent - the agent whose status flipped.
 * @param payload.status - the status just entered (the transition's destination).
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/status'(this: Scoped<Agent>, payload: { agent: Agent; status: AgentStatus }): void
```

Types : [Scoped](scope.md)

Source : [`packages/core/agent/src/runtime-types.ts:178`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentturn-stopping--serial"></a>

#### `agent/turn-stopping` — serial

Le tour est sur le point de se fermer : le modèle ne doit plus aucune réponse, car aucun appel d’outil n’est actif et aucun nouveau pilotage n’existe. L’événement est attendu avant la validation de la limite. Un écouteur qui s’y oppose pilote l’agent avec `agent.steer(...)`, puis la machine relit sa boîte de réception : un nouveau pilotage exécute une étape supplémentaire ; son absence ferme le tour. Les données déterminent le résultat, de sorte que l’ordre des écouteurs ne peut pas le modifier. Le contrôle inverse, arrêter tôt une boucle d’outils, est également représenté par les données : un résultat d’outil contenant `concludesTurn` termine le tour à son étape. Cette conclusion n’interrompt jamais le travail déjà soumis pour l’étape suivante. Des `additionalContexts` de la même étape ou un pilotage concurrent s’exécutent encore, et le tour ne se ferme qu’après le vidage de cette boîte de réception.

```ts cordis-catalog
/**
 * The turn is about to close: the model owes no response (no live tool
 * calls, no fresh steering). Awaited before the boundary commits — a
 * listener that objects steers (`agent.steer(...)`) and the machine
 * re-reads its inbox: fresh steering runs another step, none closes the
 * turn. Data decides, so listener order cannot change the outcome. The
 * inverse control (stop a tool loop early) is data too: a tool result
 * carrying `concludesTurn` ends the turn at its step. The conclusion
 * never short-circuits already-submitted next-step work: same-step
 * `additionalContexts` or racing steering still runs, and the turn
 * closes only when that inbox drains.
 * @param payload.agent - the agent whose turn is at its stop boundary.
 * @param payload.turn - the turn about to close.
 * @param payload.signal - the current turn's explicit abort signal.
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent.
 * @mode serial
 */
'agent/turn-stopping'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; signal: AbortSignal }): Promise<void> | void
```

Types : [Scoped](scope.md)

Source : [`packages/core/agent/src/runtime-types.ts:278`](../../packages/core/agent/src/runtime-types.ts)

<a id="agent-loop-events"></a>

### Événements `agent-loop/*`

<a id="agent-loopconfig-start-failed--emit"></a>

#### `agent-loop/config-start-failed` — emit

Une entrée d’agent déclarative a échoué avant de pouvoir publier un agent actif. Les consommateurs qui mettent du travail en attente pour l’identité configurée utilisent ce signal transitoire afin de le refuser plutôt que d’attendre indéfiniment. Le démontage normal de la fabrique masque les échecs de la tentative de démarrage annulée.

```ts cordis-catalog
/**
 * A declarative agent entry failed before it could publish a live agent.
 * Consumers that buffer work for the configured identity use this
 * transient signal to reject that work instead of waiting forever. Normal
 * factory teardown suppresses failures from the cancelled startup attempt.
 * @param payload.sessionId - exact shared agent/session identity that failed startup.
 * @param payload.error - persistence, setup, or publication failure.
 * @mode emit
 */
'agent-loop/config-start-failed'(payload: { sessionId: SessionId; error: unknown }): void
```

Source : [`packages/core/agent-loop/src/index.ts:192`](../../packages/core/agent-loop/src/index.ts)

<a id="agent-preset-events"></a>

### Événements `agent-preset/*`

<a id="agent-presetselected--emit"></a>

#### `agent-preset/selected` — emit

Une session a validé un autre préréglage d’agent dans son journal durable. Les consommateurs invalident uniquement l’état dérivé de la composition de cette session.

```ts cordis-catalog
/**
 * One session committed a different agent preset to its durable log.
 * Consumers invalidate only state derived from that session's composition.
 * @mode emit
 * @param sessionId - the session whose composition changed.
 * @param agentPreset - the preset recorded by the committed selection.
 */
'agent-preset/selected'(sessionId: SessionId, agentPreset: string): void
```

Source : [`packages/preset/agent-presets/src/types.ts:13`](../../packages/preset/agent-presets/src/types.ts)
<!-- END GENERATED cordis-surface -->
