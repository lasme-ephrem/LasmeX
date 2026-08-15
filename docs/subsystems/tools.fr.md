# Outils

Le pipeline d’outils de [lasmex-tools](../../packages/core/tools). [core.md](core.md) présente `ToolDefinition` comme le type de création du pipeline partagé par les packages principaux ; le type sur le fil [`ToolSchema`](llm-streaming.md#the-model-request-and-result), visible du modèle, est déclaré avec la requête du modèle. Cette page documente chaque champ de `ToolDefinition`, le DSL de schémas typés qui le construit, les types d’exécution protégée et les types de présentation pour l’interface.

Source : [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts) · [`packages/core/tools/src/schema.ts`](../../packages/core/tools/src/schema.ts) · [`packages/core/tools/src/presentation.ts`](../../packages/core/tools/src/presentation.ts)

## `ToolDefinition` — un outil enregistré

Un `ToolSchema` — les champs visibles du modèle — accompagné d’une déclaration de sortie canonique obligatoire, de la fonction `execute`, de métadonnées d’ordonnancement propres à l’hôte, d’un callback facultatif pour le contenu final et de présentateurs d’interface facultatifs. Le registre les conserve et la boucle leur distribue les appels. La méthode `schemas()` du registre construit le `ToolSchema[]` visible du modèle à partir d’une liste d’autorisation explicite : `output`/`execute`/`finalizeContent`/`timeoutMs`/`isConcurrencySafe`/`presentCall`/`presentResult` ne doivent jamais apparaître dans une requête de modèle.

```ts type-equiv
/** Tool-owned canonical output contract used after the body returns a JSON value. */
interface ToolOutputDefinition {
  /** Raw supported JSON Schema enforced against every successful canonical value. */
  readonly schema: JsonSchemaNode
  /** Pure projection from validated arguments and value to Native/model content. */
  render(args: unknown, value: JsonValue): ContentBlock[]
  /** Pure replayable presentation projection, computed only for top-level calls. */
  presentationMeta?(args: unknown, value: JsonValue): JsonValue
}
```

```ts type-equiv
/** A registered tool: its schema plus the execution function. */
interface ToolDefinition extends ToolSchema {
  /** Mandatory canonical output declaration. */
  readonly output: ToolOutputDefinition
  /**
   * Run one accepted call and return only its canonical lossless-JSON value.
   * Async work must observe or forward `exec.signal` and settle only after its
   * owned work reaches quiescence. The registry preserves caller cancellation
   * through around-dispatch signal replacement and does not abandon this
   * promise, but it cannot hard-kill same-process code.
   * @param args - losslessly snapshotted, frozen model arguments.
   * @param exec - execution identity, cancellation signal, and context deferral.
   * @returns the canonical value declared by `output.schema`.
   */
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>
  /**
   * Synchronous last-mile transform for model-facing content. The registry
   * snapshots this callback when execution starts and invokes it exactly once
   * for every normalized outcome, including pipeline failures that bypass
   * `tools/post-execute`, immediately before lossless materialization.
   * Returning `undefined` preserves the content; every other result field
   * remains registry-owned. The callback must be total and must not throw.
   * @param exec - immutable execution identity and arguments.
   * @param result - complete normalized outcome before materialization.
   * @returns replacement content, or `undefined` to preserve it.
   */
  finalizeContent?(exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): ContentBlock[] | undefined
  /**
   * Cooperative tool-call timeout budget in milliseconds. Omit for no deadline.
   * Enforced by `lasmex-tool-call-timeout-policy` (a `tools/execute` wrapper); it
   * is NEVER sent to the model — `schemas()` whitelists only name/description/
   * parameters. Declaring it asserts this tool forwards `exec.signal` to a
   * cooperative implementation that can reach quiescence when the signal aborts.
   */
  timeoutMs?: number
  /**
   * Pure synchronous classifier for overlap with sibling tool calls. Only
   * `true` opts in; omission, exceptions, non-`true` returns, and invalid
   * `defineTool` arguments are exclusive. This metadata is never model-visible.
   *
   * Opted-in executions must not mutate parent-owned state. Shared state must
   * tolerate concurrent dispatch; recorder races are permitted only when they
   * commute or fail closed. See the
   * [parallel-tool-call Agent Note](../../../../.agents/notes/implemented/feature/2026-07-10-parallel-tool-call-execution.md)
   * for the full contract.
   * @param args - parsed arguments; `defineTool` validates before calling.
   * @returns Whether this call may join a parallel group.
   */
  isConcurrencySafe?(args: unknown): boolean
  /**
   * Optional: how to present the PENDING state of one call in a UI, derived from
   * the call's `args` (parsed arguments, `unknown` — the tool validates/narrows
   * its own input). Returns a {@link ToolCallView} (a `card`-tagged render intent),
   * or `undefined` (or omit the method) to fall back to a generic presentation
   * (title = tool name, raw args as input). Pure and side-effect-free: a UI may
   * call it during live streaming AND a session-log replay, so it must depend
   * only on `args`.
   */
  presentCall?(args: unknown): ToolCallView | undefined
  /**
   * Optional: how to present the COMPLETED state, given the same `args` and the
   * durable result projection (`content`, failure state, and optional `meta`). Returns a
   * {@link ToolResultView}, or `undefined` (or omit the method) to keep the
   * pending title and render the raw result content. Pure and side-effect-free
   * for the same replay reason.
   */
  presentResult?(args: unknown, result: ToolResult): ToolResultView | undefined
}
```

`execute` reçoit `args: unknown` : une `ToolDefinition` brute valide elle-même son entrée. Les outils internes ne l’écrivent pas manuellement ; ils utilisent `defineTool`, qui valide et affine les arguments, infère la valeur renvoyée par le corps depuis `output.schema` et type les deux projecteurs de sortie. `finalizeContent` reçoit volontairement l’exécution immuable plutôt que des arguments typés, car les entrées incorrectes et les échecs externes du pipeline l’atteignent également. Il peut imposer une limite de contenu appartenant à l’outil tout en préservant `isError`, la valeur canonique, l’identité d’erreur structurée, les contextes différés et les métadonnées de présentation.

## DSL unifié de schémas pour les valeurs JSON

Les auteurs de plugins utilisent un même vocabulaire pour les paramètres typés et les valeurs de sortie typées. `ValueSchemaSpec` prend en charge `string`, `number`, `integer`, `boolean`, `null`, `array`, `object`, le type `json` réservé à l’auteur et le `oneOf` exigeant exactement une correspondance. Les valeurs scalaires `enum` et `const` doivent correspondre au type de leur nœud. Un nœud objet explicite déclare toujours `additionalProperties: true | false`. Les définitions de paramètres restent une table implicite et ouverte de propriétés objet, avec `required: true` rattaché à chaque propriété obligatoire.

Source : [`packages/core/tools/src/schema.ts`](../../packages/core/tools/src/schema.ts)

```ts type-equiv
/** One author-facing schema for any lossless JSON value root. */
type ValueSchemaSpec =
  | StringValueSchemaSpec
  | NumberValueSchemaSpec
  | IntegerValueSchemaSpec
  | BooleanValueSchemaSpec
  | NullValueSchemaSpec
  | ArrayValueSchemaSpec
  | ObjectValueSchemaSpec
  | JsonValueSchemaSpec
  | OneOfValueSchemaSpec
```

```ts type-equiv
/** One implicit parameter-root property, optionally required. */
type ParameterPropertySpec = ValueSchemaSpec & { required?: true }
```

```ts type-equiv
/**
 * Tool parameter schema. The map itself is an implicit open object root;
 * requiredness remains a per-property `required: true` annotation.
 */
type ParameterSchemaSpec = {
  [key: string]: ParameterPropertySpec
  [key: symbol]: never
}
```

`{ type: 'json' }` infère `JsonValue` et se compile en un schéma brut sans contrainte, uniquement annoté. Les racines de sortie peuvent être des objets, tableaux, scalaires ou null. `InferValue<S>` respecte les contraintes littérales et l’ouverture des objets jusqu’à 16 niveaux de conteneurs, puis se replie sur `JsonValue` au lieu d’épuiser la pile d’instanciation des types de TypeScript. `InferArgs<P>` transforme l’état obligatoire de chaque propriété en clés chaîne obligatoires ou facultatives :

```ts type-equiv
/**
 * Infer the TypeScript value accepted by an author-facing value schema. Exact
 * inference is bounded to 16 container levels, then falls back to `JsonValue`.
 */
type InferValue<S> = InferValueAt<S, []>
```

```ts type-equiv
/** Infer the TypeScript argument object for an implicit parameter schema. */
type InferArgs<S> = InferProperties<S, []>
```

`defineTool({ name, description, parameters, output, execute, … })` relie l’inférence des paramètres à `parameterSchemaSpecToJsonSchema()` et `validateArgs()`, et relie `execute`/`render`/`presentationMeta` à `InferValue<OutputSchema>`. Les enregistrements de schéma contiennent uniquement leurs propres clés chaîne énumérables et les tableaux de schéma sont des tableaux intrinsèques denses ; l’inférence, la compilation et la validation observent donc la même déclaration. L’inférence reste exacte jusqu’à 16 niveaux de conteneurs, puis s’élargit en `JsonValue`, tandis que la validation d’exécution continue de parcourir tout le schéma. `valueSchemaSpecToJsonSchema()` compile les déclarations de sortie par le même sous-ensemble brut appliqué. Une incompatibilité de paramètre lève `ToolArgsError` (`INVALID_ARGS`) ; une valeur incorrecte produite par le corps ou la politique après exécution lève `ToolOutputError` (`INVALID_TOOL_OUTPUT`). Toutes deux suivent le chemin d’erreur d’outil normal. Le JSON Schema brut reste ouvert par défaut ; les mots-clés non pris en charge sont rejetés au lieu d’être acceptés sans application.

L’enregistrement est une règle de confiance au sein du même processus. Le registre emprunte la définition typée comme entrée readonly, exige `output`, valide son schéma brut et vérifie les exigences sémantiques comme un `timeoutMs` positif et fini. `schemas()` construit la projection visible du modèle lors de l’assemblage d’une requête ; l’exécution et la présentation partagent donc une même définition résolue sans divulguer les callbacks sur le fil.

## `ToolRestriction` — filtre actif d’un scope sur les outils hérités

`ToolRestriction` s’applique aux outils hérités par un scope : la couche globale du déploiement et tous les scopes ancêtres de sa chaîne. Le registre compile les noms readonly en ensembles privés, intersecte les restrictions multiples, puis superpose les propres enregistrements du scope. Ces derniers restent exemptés afin qu’un enfant délégué conserve les outils auxquels il répond. Un filtre de refus seul admet les futurs outils hérités non énumérés, tandis qu’une liste d’autorisation les exclut.

```ts type-equiv
/**
 * Per-scope filter over global tools. Restrictions intersect and do not affect
 * scoped registrations or the reserved Code Mode transport.
 */
interface ToolRestriction {
  /** Global tool names that stay visible; everything else is removed. */
  readonly allow?: readonly string[]
  /** Global tool names removed from visibility. */
  readonly deny?: readonly string[]
}
```

## Exécution : waterfalls extensibles et politique monotone

`ctx.tools.execute()` accepte un `ToolExecutionInput` appartenant à l’appelant et doté d’un `signal` readonly obligatoire. Il matérialise une seule fois ses arguments JSON analysés dans un `ToolExecution` appartenant au pipeline, puis exécute l’appel à travers `tools/pre-execute` — waterfall réordonnable d’autorisation, refus ou demande — → protections monotones enregistrées → `tools/execute` — wrappers entourant la distribution — → `tools/post-execute` — inspection ou remplacement du résultat — → `finalizeContent` facultatif appartenant à la définition → `tools/result`, résultat immuable faisant autorité. Seule la vue `tools/execute` peut remplacer le signal obligatoire. Le résultat est un `ToolExecutionResult`.

```ts type-equiv
/** Opaque call identity that permits correlation without exposing mutable execution state. */
type ToolExecutionToken = symbol & { readonly [toolExecutionTokenBrand]: true }
```

```ts type-equiv
/**
 * Caller-supplied description of one tool call. {@link ToolRuntime.execute}
 * adds the registry-owned token to form a pipeline {@link ToolExecution};
 * callers do not choose that token.
 */
interface ToolExecutionInput {
  readonly callId: CallId
  /**
   * Root model-requested call owning this execution tree. Callers omit it for
   * a root execution; nested dispatchers propagate the enclosing value.
   */
  readonly rootCallId?: CallId
  readonly name: string
  /** Losslessly JSON-serializable parsed arguments (tools validate their own schema). */
  readonly arguments: unknown
  /** The agent on whose behalf the call runs (set by the agent loop). */
  readonly agent?: Agent
  /**
   * Opaque token of the enclosing transport execution, when one exists. Code
   * Mode sets this on SDK sub-dispatches so commit-style observers can wait for
   * the outer `run_code` outcome without receiving its live mutable execution.
   * The token also marks the call as a transport sub-dispatch rather than a
   * model-direct call: under `mode: 'code'`, only calls WITH a parent may
   * execute a native tool name — a model-direct call (no parent) is denied as
   * `UNKNOWN_TOOL` before the policy pipeline. See {@link ToolRuntime.execute}.
   */
  readonly parent?: ToolExecutionToken
  /** Required caller-owned cancellation for this invocation. */
  readonly signal: AbortSignal
}
```

Le corps d’un outil reçoit l’extension d’exécution. `deferContext()` rattache un contexte au résultat de cette même exécution — canal de sous-distribution d’un outil composite, également utilisable par un outil feuille qui crée une instruction issue d’un plugin — sans l’injecter dans l’appel externe encore ouvert.

```ts type-equiv
/**
 * Runtime context handed to a tool implementation after the registry has
 * accepted a {@link ToolExecution}. {@link deferContext} attaches context to
 * this execution's own result — a composite tool ferries nested-dispatch
 * context back to the outer result, and a leaf tool may mint a fresh
 * plugin-sourced instruction; the loop appends it only after the
 * `tool/result`.
 */
interface ToolRunContext extends ToolExecution {
  /**
   * Defer one context — typically a nested-dispatch context ferried by a
   * composite tool, or a fresh plugin-sourced instruction — until this tool's
   * final result reaches the agent loop. Contexts retain their individual
   * source and metadata and are emitted in call order.
   */
  deferContext(context: UserMessage): void
  /**
   * Mark a successful final result as terminal for the current agent turn.
   * The marker rides this execution's own result (`concludesTurn` exists only
   * on {@link ToolExecutionSuccess}); a composite that dispatches nested
   * calls forwards it from the nested result, exactly like
   * `additionalContexts`, so only an authoritative nested success can
   * conclude the enclosing run.
   */
  concludeTurn(): void
}
```

L’agent loop demande au registre le mode d’exécution de chaque appel en attente, puis s’en sert pour former les barrières exclusives et les exécutions parallèles dans un pool roulant :

```ts type-equiv
/**
 * Scheduling mode for one pending call. `parallel` may overlap with siblings;
 * `exclusive` runs alone and forms an ordering barrier.
 */
type ToolExecutionMode =
  | { kind: 'parallel' }
  | { kind: 'exclusive' }
```

Le pont de Code Mode expose en plus chaque sous-distribution terminée à la waterfall `tools/code-dispatch-log`, qui peut modifier la copie du contenu enregistrée dans l’événement durable sans toucher à la valeur du programme ni au résultat visible du modèle :

```ts type-equiv
/**
 * One settled `run_code` sub-dispatch about to be logged, as seen by the
 * `tools/code-dispatch-log` waterfall: the parent execution (session owner,
 * outer call identity), the sub-call identity, and the outcome whose durable
 * copy a listener may reshape. `content` is the RENDERED result projection
 * (what a native `tool/result` would carry) — the program itself received
 * the structured `value` (or just the error message on failure); only the
 * `tool/code-dispatch` event's copy changes.
 */
interface CodeDispatchLog {
  /** The outer `run_code` execution. */
  readonly exec: ToolExecution
  /** The calling agent (the scope routing key and the spill owner), when the outer call has one. */
  readonly agent?: Agent
  /** Deterministic sub-call id (`<parent>:code:<n>`). */
  readonly subCallId: CallId
  /** The dispatched sub-tool name. */
  readonly name: string
  /** Whether the sub-call settled as an error. */
  readonly isError: boolean
  /** The sub-call's complete model-facing content (the settle event's default payload). */
  readonly content: ContentBlock[]
}
```

```ts type-equiv
/**
 * One pending tool call inside the registry pipeline. Parsed arguments cross
 * one lossless-JSON materialization boundary before policy and are deep-frozen;
 * call identity, the caller signal, and the registry-assigned {@link token} are
 * readonly. The registry freezes the complete object before `tools/result`
 * observers run.
 */
interface ToolExecution extends ToolExecutionInput {
  /** Root model-requested call, resolved for every root and nested execution. */
  readonly rootCallId: CallId
  /** Registry-assigned identity shared with nested calls only as their opaque `parent` token. */
  readonly token: ToolExecutionToken
}
```

```ts type-equiv
/**
 * Around-dispatch view of a {@link ToolExecution}. A `tools/execute` wrapper
 * may replace the signal for its delegated lifetime, but it cannot remove it.
 * The registry fuses every replacement with the captured caller signal.
 */
interface ToolDispatchExecution extends Omit<ToolExecution, 'signal'> {
  /** Cancellation signal visible to the next wrapper or tool body. */
  signal: AbortSignal
}
```

`ToolExecutionToken` est un `Symbol` opaque d’exécution, utilisé uniquement pour comparer les identités. Avant la politique, `execute()` matérialise et gèle les arguments, rejette toute entrée incompatible avec JSON et attribue le jeton. Les champs d’identité, le signal obligatoire de l’appelant et le jeton parent facultatif restent readonly. Un wrapper `ToolDispatchExecution` peut remplacer le signal sans le retirer ; le registre fusionne de nouveau le signal de l’appelant avant d’invoquer le corps. Les observateurs finaux reçoivent l’identité d’exécution gelée.

Un `ToolGuard` est une politique finale avant distribution qui tient compte du scope. Son type de retour ne possède volontairement aucun résultat d’autorisation : `undefined` conserve la décision de la waterfall, tandis qu’une raison renvoyée ne peut que réduire l’autorisation. Un listener ultérieur ne peut donc pas annuler ce refus.

```ts type-equiv
/**
 * A monotonic execution guard evaluated after every `tools/pre-execute`
 * listener and before the tool body. Returning a reason denies the call;
 * returning `undefined` leaves it unchanged. Because guards have no allow
 * result, listener ordering cannot turn a denial back into permission.
 * @param execution - the identity-protected call after extensible pre-execute policy completed.
 * @returns a final denial reason, or `undefined` to leave the call allowed.
 */
type ToolGuard = (execution: Readonly<ToolExecution>) => string | undefined
```

```ts type-equiv
/** Canonical failure detail; internal routing information remains optional. */
interface ToolFailure {
  /** Human-readable failure message without the Native `Error: ` envelope. */
  message: string
  /** Internal error class/code used by policy and durable diagnostics. */
  info?: ToolErrorInfo
}
```

```ts type-equiv
/** Successful canonical tool execution, including its Native/model projection. */
interface ToolExecutionSuccess {
  readonly isError: false
  /** Execution-local canonical value; deliberately omitted from durable events. */
  readonly value: JsonValue
  readonly content: ContentBlock[]
  readonly error?: never
  readonly meta?: JsonValue
  readonly additionalContexts?: UserMessage[]
  /** The agent loop stops after committing this successful result batch. */
  readonly concludesTurn?: true
}
```

```ts type-equiv
/** Failed canonical tool execution; failures never carry a successful value. */
interface ToolExecutionFailure {
  readonly isError: true
  readonly error: ToolFailure
  readonly value?: never
  readonly content: ContentBlock[]
  readonly meta?: JsonValue
  readonly additionalContexts?: UserMessage[]
  readonly concludesTurn?: never
}
```

```ts type-equiv
/** The discriminated, execution-local outcome of one tool call. */
type ToolExecutionResult = ToolExecutionSuccess | ToolExecutionFailure
```

Le résultat contient uniquement l’issue. L’identité de l’appel reste dans le `ToolExecution` immuable qui l’accompagne dans chaque hook et dans les événements de session durables `tool/call` / `tool/result` ; les wrappers ne peuvent donc pas créer une seconde identité contradictoire. La `value` canonique reste locale à l’exécution : la boucle ne persiste que `content`, `error` et `meta`, tandis que `tool/code-dispatch` stocke sans modification le `content` rendu et `isError` du sous-appel. La relecture reproduit la présentation, mais ne peut pas reconstruire les valeurs canoniques intermédiaires.

En cas de réussite, le registre capture et valide la valeur du corps, la gèle, puis appelle le renderer pur et le projecteur facultatif de métadonnées pour les appels de premier niveau. Il matérialise séparément les champs durables de présentation juste avant `tools/result`. Une valeur incorrecte, un échec du renderer ou du projecteur, ou une présentation incompatible avec JSON devient un `isError` sûr pour JSON. L’observateur actif final voit donc la valeur exacte propre à l’exécution avec des champs sûrs pour l’ajout durable ultérieur.

Avant de finaliser le contenu, le registre matérialise le résultat candidat. Un échec dans le contenu, l’erreur structurée, le contexte supplémentaire ou les métadonnées de présentation devient un résultat `isError` sûr pour JSON qui atteint toujours `finalizeContent`. Le registre invoque ce callback exactement une fois, puis matérialise et gèle le résultat accepté juste avant `tools/result`. L’issue active observée est ainsi sûre pour l’ajout durable ultérieur de `tool/result`.

Chaque waterfall d’interception renvoie une **Decision** typée, selon la convention partagée avec les waterfalls `agent/*`. Les listeners de `tools/pre-execute` reçoivent `(exec, next)` et renvoient une `PreToolDecision` ; les wrappers de `tools/execute` renvoient un `ToolExecutionResult` ; les listeners de `tools/post-execute` reçoivent `(exec, result, next)` et renvoient une `PostToolDecision` :

```ts type-equiv
/**
 * Pre-dispatch decision. `allow` runs the call; `deny` materializes an error;
 * `ask` runs only after an approval service returns `allowed-once` and otherwise
 * denies. Input rewriting is excluded because arguments are already logged and
 * presented.
 */
type PreToolDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'ask'; reason?: string }
```

```ts type-equiv
/**
 * Post-dispatch decision: accept, replace one projection, attach context for the
 * next request, or block by turning corrective feedback into an error result.
 */
type PostToolDecision =
  | { kind: 'accept'; content?: ContentBlock[]; value?: never; additionalContexts?: UserMessage[] }
  | { kind: 'accept'; value: JsonValue; content?: never; additionalContexts?: UserMessage[] }
  | { kind: 'block'; feedback: ContentBlock[]; additionalContexts?: UserMessage[] }
```

Appelez `next()` pour le comportement par défaut ou renvoyez une décision pour interrompre la chaîne. La politique avant exécution peut refuser ou demander ; seule la valeur `allowed-once` autorise la suite, tandis qu’un autre résultat, l’absence de canal ou service d’approbation, ou une demande sans agent devient un refus. Les protections peuvent encore imposer un refus final. Les arguments ne peuvent pas être réécrits, car l’historique, l’audit, l’interface et l’exécution doivent être cohérents.

La politique après exécution peut remplacer le contenu ou la valeur, jamais les deux. Le remplacement du contenu conserve la valeur canonique et les métadonnées existantes ; le remplacement de la valeur la valide à nouveau et recalcule le contenu et les métadonnées. Un blocage supprime la valeur et devient un `isError` contenant le retour correctif. Le remplacement de contenu est une politique de présentation, pas de confidentialité : un listener qui doit cacher la valeur programmatique la bloque ou la remplace. `tools/result` reçoit l’exécution et le résultat gelés après normalisation ; les observateurs ne peuvent pas les transformer et leurs échecs sont contenus. Les outils inconnus comme ceux qui lèvent une exception deviennent des erreurs structurées — `ToolNotFoundError` est traduit en `UNKNOWN_TOOL` —, afin que l’appel échoue sans terminer le tour.

## Sous-ensemble appliqué de JSON Schema brut

Les schémas bruts des subagents, workflows, MCP et enregistrements dynamiques utilisent l’équivalent sur le fil du DSL destiné aux auteurs. `assertSupportedJsonSchema()` accepte toute racine JSON, `validateJsonSchemaValue()` l’applique et `JsonSchemaError` signale chaque chemin de schéma non pris en charge ou incorrect. Un nœud vide uniquement annoté désigne une valeur JSON sans contrainte et sans perte. `oneOf` exige au moins deux branches et une valeur doit correspondre à exactement une branche. Les consommateurs qui exigent encore une racine objet appellent `assertObjectJsonSchema()` et transportent un `ObjectJsonSchema` ; les sorties structurées définies par l’appelant d’un subagent ou workflow restent ainsi enracinées dans un objet sans restreindre le vocabulaire partagé.

```ts type-equiv
/** Scalar JSON values supported by `enum` and `const`. */
type JsonSchemaScalar = string | number | boolean | null
```

```ts type-equiv
/** Single-type keywords accepted by the enforced subset. */
type JsonSchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
```

```ts type-equiv
/**
 * One raw JSON Schema node in the enforced subset. The optional fields express
 * the external wire schema; {@link assertSupportedJsonSchema} rejects invalid
 * combinations before a caller treats the node as trusted.
 */
interface JsonSchemaNode {
  /** Omit with no constraints for any JSON value, or use `oneOf`. */
  type?: JsonSchemaType
  /** Exactly one branch must validate; at least two branches are required. */
  oneOf?: JsonSchemaNode[]
  /** Nested property schemas (`type: 'object'` only). */
  properties?: Record<string, JsonSchemaNode>
  /** Required property names; each must appear in `properties`. */
  required?: string[]
  /** `false` rejects undeclared keys; absent/`true` follows JSON Schema's open default. */
  additionalProperties?: boolean
  /** Item schema (`type: 'array'` only); absent accepts any JSON item. */
  items?: JsonSchemaNode
  /** Allowed values for a scalar node. */
  enum?: JsonSchemaScalar[]
  /** The single allowed value for a scalar node. */
  const?: JsonSchemaScalar
  /** Annotation, ignored for validation. */
  description?: string
  /** Annotation, ignored for validation. */
  title?: string
  /** Annotation, ignored for validation but required to be lossless JSON. */
  default?: JsonValue
  /** Annotation, ignored for validation but required to be lossless JSON. */
  examples?: JsonValue
}
```

```ts type-equiv
/** A consumer-constrained object-rooted schema. */
type ObjectJsonSchema = JsonSchemaNode & { type: 'object' }
```

## Vocabulaire de présentation des outils dans l’interface

Ce vocabulaire décrit la façon dont un outil souhaite présenter son appel dans une interface — carte d’appel d’outil dans un éditeur ou ligne de journal CLI — indépendamment du fournisseur, afin que l’outil se décrive sans dépendre d’un protocole client. `presentCall`/`presentResult` renvoient une **intention de rendu marquée par `card`**, une union discriminée sur laquelle le pont d’interface effectue un switch :

- `ToolCallView` (en attente) : `{ card: 'generic', title, kind?, rawInput?, content?, locations? }` — carte par défaut ; `locations` contient les fichiers `{ path, line? }[]` lus ou modifiés par l’appel pour le suivi dans l’éditeur —, `{ card: 'terminal', title, description?, cwd? }` — commande shell affichée dans une carte de terminal —, ou `{ card: 'diff', title, diffs, locations? }` — création ou modification de fichier affichée comme diff en ligne ; `diffs` contient des éléments `{ path, oldText, newText }[]` et `oldText: null` signale un nouveau fichier.
- `ToolResultView` (terminé) : `{ card: 'generic', title?, content? }`, `{ card: 'terminal', title?, output?, exitCode?, signal? }` — sortie capturée et fin d’exécution ; une interface compatible affiche une pastille d’état de sortie, une autre peut produire un repli avec fence ` ```console ` —, `{ card: 'diff', title?, diffs }` — mutation de fichier achevée, généralement sous forme de segments appliqués avec lignes de contexte calculées depuis les contenus avant et après, ou diff du fichier entier sans image antérieure —, `{ card: 'search', shape, title?, truncated, total, … }` — recherche de découverte achevée, avec correspondances groupées par fichier pour `shape: 'matches'` (grep) ou liste plate de chemins pour `shape: 'paths'` (glob) ; `truncated`/`total` indique si le résultat en ligne a été plafonné pour qu’une interface ne présente jamais un résultat partiel comme complet ; la vue ne contient pas le texte du résultat et une interface dépourvue de carte de recherche se replie sur le contenu brut —, `{ card: 'read', title?, path, offset, lines, totalLines, lang?, content? }` — lecture de fichier achevée, sous forme de code numéroté par ligne et éventuellement coloré ; `offset` reste la première ligne demandée, indexée à partir de un, même lorsque `lines` est vide ; `lang` est une indication de langage dérivée de l’extension et `content` le texte sans enveloppe utilisé par une interface sans prise en charge de lecture —, ou `{ card: 'web', kind: 'search' | 'fetch', title?, … }` — récupération Web achevée ; `kind: 'search'` transporte les `sources`/`answer?`/`truncated` structurés, `kind: 'fetch'` transporte `url`/`statusCode`/`truncated`, et une interface sans capacité `web` se replie sur le contenu brut, sans dupliquer le corps dans la vue. Les vues terminées remplacent les vues en attente ; les outils de mutation renvoient donc un résultat diff même s’il duplique l’extrait affiché lors de l’appel. Les recherches et récupérations Web ne possèdent aucune carte `card` analogue au moment de l’appel — leur état en attente reste générique, puisque le résultat structuré n’existe qu’après `execute`.

`ToolCallKind` (`'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'fetch' | 'other'`) choisit l’icône d’une carte générique. `FileLocation` (`{ path, line? }`), `FileDiff` (`{ path, oldText, newText }`) et `ReadFileLine` (`{ number, text }`, ligne d’une fenêtre de lecture numérotée à partir de un) constituent le vocabulaire partagé des cartes de fichier. La conception est fixée dans l’[Agent Note sur l’union des intentions de rendu](../../.agents/notes/implemented/architecture/2026-07-02-tool-render-intent-union.md) ; les environnements hôte et client projettent ce vocabulaire neutre dans leurs propres vues.

La documentation complète des champs de présentation se trouve dans [`packages/core/tools/src/presentation.ts`](../../packages/core/tools/src/presentation.ts). Le schéma et l’exécuteur `bash` figurent dans [shell.md](shell.md), tandis que les contrôles génériques des tâches en arrière-plan sont décrits dans [jobs.md](jobs.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Cette section est générée depuis le code source par `scripts/gen-cordis-catalog.ts` ; `pnpm run verify-cordis-catalog` vérifie sa fraîcheur dans doc-sync et `pnpm run gen-cordis-catalog` la régénère. Les blocs de signatures utilisent une fence `ts cordis-catalog` et conservent le JSDoc original. Les modes de distribution sont définis dans le [primer](../cordis-primer.md#dispatch-modes), tandis que l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxtools--toolruntime"></a>

### `ctx.tools` — `ToolRuntime`

Registre et pipeline d’exécution des outils. Les enregistrements à portée définie masquent les globaux ; un résolveur de visibilité unique alimente la présentation, la recherche et la distribution.

```ts cordis-catalog
/**
 * Present the calling scope's tools in `mode` instead of the deployment
 * default. Nearest scope on the chain wins, so a preset's standing
 * declaration covers every agent joined under it.
 *
 * Scoped only, and one declaration per scope: this is how an agent preset
 * composes Code Mode agents beside native ones in the same process, and a
 * process-global override would be the `mode` config field instead.
 * @param mode - the presentation the covered agents' models see.
 * @returns the exact disposer that restores the deployment default.
 */
presentAs(mode: ToolPresentationMode): () => void

/**
 * Register globally or in the calling agent scope. Scoped tools shadow
 * globals; duplicates within one layer and the reserved `run_code` name fail.
 * @param definition - tool schema, execution, and optional finalization/presentation callbacks.
 * @returns the exact disposer that unregisters the tool.
 */
register(definition: ToolDefinition): () => void

/**
 * Restrict global tools for the calling agent scope. Empty filters, unknown
 * names, scope-local names, and reserved transport names fail. Restrictions
 * intersect; scoped registrations remain visible.
 * @param filter - global-tool mask: `allow` (keep only) and/or `deny` (remove).
 * @returns the exact disposer that lifts this restriction.
 */
restrict(filter: ToolRestriction): () => void

/**
 * Register a monotonic guard after the extensible `tools/pre-execute`
 * waterfall. A plain-context guard applies globally; one registered through
 * `agent.ctx` applies only to that agent. Any matching guard may deny by
 * returning a reason, while no guard can force-allow a call another guard
 * denied. The exact effect disposer is returned for ordered ownership and
 * HMR cleanup.
 * @param guard - synchronous check; a returned string denies the execution.
 * @returns the exact disposer that unregisters the guard.
 */
guard(guard: ToolGuard): () => void

/**
 * Look up a tool as one scope sees it (scoped
 * shadows global; a restricted-away global reads as absent). Presenters pass
 * the calling agent so the rendered card matches the definition that
 * actually executed.
 * @param name - the tool name as registered.
 * @param scope - the viewing scope (the agent); omitted = the global view.
 * @returns the definition the scope resolves, or undefined when none is visible.
 */
get(name: string, scope?: ScopeKey): ToolDefinition | undefined

/**
 * Project visible definitions onto the allowlisted model-facing schema fields,
 * excluding execution and presentation callbacks.
 * @param scope - the viewing scope (the agent); omitted = the global view.
 * @returns one deep-cloned schema per visible tool.
 */
schemas(scope?: ScopeKey): ToolSchema[]

/**
 * Classify a pending call through the caller's visible tool definition. Only
 * an exact `true` is parallel; unknown, hidden, undeclared, invalid, or
 * throwing classifiers are exclusive.
 * @param exec - call name, parsed arguments, and optional agent scope.
 * @returns the fail-closed scheduling mode.
 */
executionMode(exec: ToolExecutionInput): ToolExecutionMode

/**
 * Execute through pre-policy, guards, around-dispatch, post-policy,
 * definition-owned content finalization, and final notification. Tool and
 * listener failures resolve as materialized error results; an invisible tool
 * reports `UNKNOWN_TOOL`. The returned outcome is the same lossless, frozen
 * snapshot final observers receive. Cancellation
 * arriving after entry and before final result materialization skips a
 * not-yet-started body with `ABORTED_BEFORE_DISPATCH` or replaces a
 * successful started outcome with `ABORTED`; already-started work is still
 * drained and may retain a tool-owned structured error.
 * @param exec - the typed same-process call input. The registry assigns its
 *   correlation token before policy begins.
 * @returns the materialized final result.
 */
async execute(exec: ToolExecutionInput): Promise<ToolExecutionResult>
```

Types : [ScopeKey](scope.md)

Source : [`packages/core/tools/src/index.ts:787`](../../packages/core/tools/src/index.ts)

<a id="tools-events"></a>

### Événements `tools/*`

<a id="toolschange--emit"></a>

#### `tools/change` — emit

Un outil a été enregistré ou désenregistré, ou une restriction à portée définie a changé — l’ensemble d’outils disponibles a été modifié, éventuellement pour un seul scope. Cette notification NON FILTRÉE porte sur le registre et n’utilise volontairement pas une distribution filtrée par scope : une modification globale concerne le prochain assemblage de chaque agent ; un listener à portée définie abonné ici voit donc chaque changement, pas uniquement celui de son scope.

```ts cordis-catalog
/**
 * A tool was registered or unregistered, or a scoped restriction changed
 * (the available tool set changed — possibly for one scope only). An
 * UNFILTERED registry-subject notification, deliberately not scope-filtered
 * dispatch: a global change concerns every agent's next assembly, so a
 * scoped listener subscribing here sees every change, not just its own
 * scope's.
 * @mode emit
 */
'tools/change'(): void
```

Source : [`packages/core/tools/src/index.ts:207`](../../packages/core/tools/src/index.ts)

<a id="toolscode-dispatch-log--waterfall"></a>

#### `tools/code-dispatch-log` — waterfall

Autorise un listener à remplacer le contenu de la COPIE DU JOURNAL DURABLE du résultat d’une sous-distribution `run_code` avant que le pont n’ajoute son événement `tool/code-dispatch`. `next()` conserve le contenu ; un listener peut renvoyer des blocs de remplacement, par exemple l’aperçu et le localisateur de la politique de spill pour un résultat textuel trop volumineux. Seule la copie consignée est touchée : le programme a déjà reçu la valeur complète et le modèle ne voit ni l’une ni l’autre. L’exception d’un listener est contenue ; le pont revient au contenu original terminé. Distribution filtrée par scope (`lasmex-scope`) : les listeners propres à un agent reçoivent uniquement les distributions de cet agent.

```ts cordis-catalog
/**
 * Allow a listener to replace content in the DURABLE LOG COPY of one
 * `run_code` sub-dispatch outcome before the bridge appends its
 * `tool/code-dispatch` event. `next()` keeps the
 * content unchanged; a listener may return replacement blocks (e.g. the
 * spill policy's preview + locator for an oversized text result). Only the
 * logged copy is affected — the program already received the complete
 * value, and the model sees neither. A throwing listener is contained:
 * the bridge falls back to logging the original settled content.
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent's dispatches.
 * @param dispatch - the parent execution, sub-call identity, and the settled content to log.
 * @mode waterfall
 */
'tools/code-dispatch-log'(this: Scoped<ToolRuntime>, dispatch: CodeDispatchLog, next: () => Promise<ContentBlock[]>): Promise<ContentBlock[]>
```

Types : [ContentBlock](llm-streaming.md) · [Scoped](scope.md)

Source : [`packages/core/tools/src/index.ts:189`](../../packages/core/tools/src/index.ts)

<a id="toolsexecute--waterfall"></a>

#### `tools/execute` — waterfall

Waterfall entourant la distribution pour les délais d’expiration, nouvelles tentatives ou métriques. `next()` renvoie un résultat normalisé ; les wrappers peuvent modifier uniquement `exec.signal`, tandis que l’identité de l’appel reste immuable. Le registre fusionne de nouveau le signal original de l’appelant avant le corps, afin qu’un remplacement ne puisse pas détacher l’annulation de l’appelant ; les wrappers doivent néanmoins restaurer leur signal et atteindre la quiescence. Distribution filtrée par scope (`lasmex-scope`) : les listeners propres à un agent reçoivent uniquement les appels de cet agent.

```ts cordis-catalog
/**
 * Around-dispatch waterfall for timeout, retry, or metrics. `next()` returns
 * a normalized result; wrappers may change only `exec.signal`, while call
 * identity remains immutable. The registry re-fuses the original caller
 * signal before the body, so replacement cannot detach caller cancellation;
 * wrappers must still restore their signal and reach quiescence.
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent's calls.
 * @param exec - the allowed call about to dispatch (name, parsed arguments, caller agent, signal).
 * @mode waterfall
 */
'tools/execute'(this: Scoped<ToolRuntime>, exec: ToolDispatchExecution, next: () => Promise<ToolExecutionResult>): Promise<ToolExecutionResult>
```

Types : [Scoped](scope.md)

Source : [`packages/core/tools/src/index.ts:163`](../../packages/core/tools/src/index.ts)

<a id="toolspost-execute--waterfall"></a>

#### `tools/post-execute` — waterfall

Accepte, remplace, enrichit ou bloque un résultat de distribution normalisé. `next()` l’accepte sans modification ; les outils qui lèvent une exception atteignent tout de même cette waterfall sous forme d’erreurs. Les listeners asynchrones doivent observer `exec.signal`. Après leur résolution, l’annulation de l’appelant remplace uniquement un résultat accepté avec succès par le code choisi selon que le corps de l’outil a été invoqué ou non. Distribution filtrée par scope (`lasmex-scope`) : les listeners propres à un agent reçoivent uniquement les appels de cet agent.

```ts cordis-catalog
/**
 * Accept, replace, enrich, or block a normalized dispatch result. `next()`
 * accepts it unchanged; thrown tools still reach this waterfall as errors. Async
 * listeners must observe `exec.signal`; after they settle, caller
 * cancellation replaces only a successful accepted outcome with the code
 * selected by whether the tool body was invoked.
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent's calls.
 * @param exec - the call that just ran (name, parsed arguments, caller agent).
 * @param result - the dispatch outcome a listener may accept, replace, or block.
 * @mode waterfall
 */
'tools/post-execute'(this: Scoped<ToolRuntime>, exec: ToolExecution, result: Readonly<ToolExecutionResult>, next: () => Promise<PostToolDecision>): Promise<PostToolDecision>
```

Types : [Scoped](scope.md)

Source : [`packages/core/tools/src/index.ts:175`](../../packages/core/tools/src/index.ts)

<a id="toolspre-execute--waterfall"></a>

#### `tools/pre-execute` — waterfall

Autorise, refuse ou demande avant la distribution. `next()` délègue à l’autorisation ; l’absence de prise en charge de l’approbation transforme `ask` en refus. Les protections asynchrones doivent observer `exec.signal` ; le registre vérifie de nouveau l’annulation après leur résolution, mais n’abandonne jamais leur promesse. Distribution filtrée par scope (`lasmex-scope`) : les listeners propres à un agent reçoivent uniquement les appels de cet agent.

```ts cordis-catalog
/**
 * Allow, deny, or ask before dispatch. `next()` delegates to allow; missing
 * approval support turns `ask` into denial. Async gates must observe
 * `exec.signal`; the registry rechecks cancellation after they settle but
 * never abandons their promise.
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent's calls.
 * @param exec - the pending call (name, parsed arguments, caller agent).
 * @mode waterfall
 */
'tools/pre-execute'(this: Scoped<ToolRuntime>, exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision>
```

Types : [Scoped](scope.md)

Source : [`packages/core/tools/src/index.ts:152`](../../packages/core/tools/src/index.ts)

<a id="toolsresult--emit"></a>

#### `tools/result` — emit

Observe le résultat final gelé et encodable en JSON sans perte. Les échecs de listeners sont contenus. Distribution filtrée par scope (`lasmex-scope`) : indexée par `exec.agent`.

```ts cordis-catalog
/**
 * Observe the frozen, lossless-JSON final outcome. Listener failures are contained.
 * Scope-filtered dispatch (`lasmex-scope`): keyed by `exec.agent`.
 * @param exec - the execution object that traversed the pipeline.
 * @param result - a deep-frozen snapshot of the final returned result.
 * @mode emit
 */
'tools/result'(this: Scoped<ToolRuntime>, exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): undefined
```

Types : [Scoped](scope.md)

Source : [`packages/core/tools/src/index.ts:197`](../../packages/core/tools/src/index.ts)
<!-- END GENERATED cordis-surface -->
