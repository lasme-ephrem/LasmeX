# Workflow

La capacité de workflow permet à un agent d’exécuter un SCRIPT d’orchestration écrit par le modèle qui démarre des sous-agents. Comme [subagent](subagent.md), il s’agit d’**une capacité facultative** extérieure à la boucle d’agent ; ses types et opérations sont donc décrits ici plutôt que dans [core.md](core.md). Comme pour bash, un seul moteur par contexte peut fournir `ctx.workflowEngine`; il n’existe aucun registre de fournisseurs nommés. Un second moteur remplace le premier par la configuration des plugins au lieu de fonctionner à ses côtés.

La définition du service est [lasmex-workflow](../../packages/workflow/workflow), qui fournit `ctx.workflowEngine` et le vocabulaire ci-dessous. Son fournisseur est [lasmex-workflow-worker-thread](../../packages/workflow/workflow-worker-thread), un moteur fondé sur `node:worker_threads` qui crée un worker par exécution et y place le contexte vm du script. Le consommateur exposé au modèle est [lasmex-tool-workflow](../../packages/workflow/tool-workflow). La proposition et sa justification figurent dans l’[Agent Note sur les workflows dynamiques](../../.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.md).

Sources : vocabulaire utilisable dans un navigateur dans [`packages/workflow/workflow/src/types.ts`](../../packages/workflow/workflow/src/types.ts), requêtes de l’hôte et références d’exécution active dans [`runtime-types.ts`](../../packages/workflow/workflow/src/runtime-types.ts).

## Requête de démarrage

Cette requête décrit ce qu’un appelant demande lorsqu’il démarre une exécution. L’outil de workflow ordinaire la construit à partir de l’appel `{ script, meta, args }` du modèle et de l’agent appelant. Des consommateurs spécialisés peuvent également sélectionner un unique `subagentProvider` à l’échelle du moteur et réduire `maxTotalAgents` pour cette exécution, sans que le script puisse observer ou remplacer ces règles. `meta` et `args` sont de simples DONNÉES JSON : le moteur valide `meta` selon son schéma et échoue explicitement AVANT toute exécution ; aucun texte de script n’est évalué pour les obtenir. `parent` est OBLIGATOIRE : chaque enfant démarré par le script lui est attribué, tandis que le répertoire courant, la lignée et la profondeur transitent par la [capacité de sous-agent](subagent.md).

```ts type-equiv
/**
 * What a caller asks for when starting a workflow run. `meta` and `args` are
 * plain JSON data by the seam contract. `parent` is required because every
 * `agent()` spawned by the script is attributed to that live Agent.
 */
interface WorkflowStartRequest {
  /** The plain-JS script body (top-level await allowed; ends with `return <json-value>`). */
  script: string
  /** The workflow's identity block, as plain JSON data (shape-validated by the engine). */
  meta: WorkflowMeta
  /** Optional input exposed verbatim to the script as the `args` global. */
  args?: unknown
  /** Optional engine-wide child-provider override for this run. */
  subagentProvider?: string
  /** Optional per-run total-child ceiling. */
  maxTotalAgents?: number
  /** The agent on whose behalf the run executes (parent of every child). */
  parent: Agent
  /** Cancels the run when aborted. */
  signal?: AbortSignal
}
```

## Identité du workflow : `WorkflowMeta`

Ce bloc d’identité est transmis sous forme de données dans la requête de démarrage ; il correspond au paramètre `meta` de l’outil et reprend le vocabulaire du bloc meta des workflows dynamiques de Claude Code. `phases` sert uniquement à décrire la progression : les appels `phase()` associent leurs titres à ceux destinés aux observateurs, sans imposer la moindre structure d’exécution.

```ts type-equiv
/**
 * The script's identity block, provided as plain JSON data alongside the
 * script body (the model-facing tool carries it as its `meta` parameter) and
 * validated by the engine before the body runs. `name`/`description` are
 * required; the rest is optional annotation. The field vocabulary matches the
 * Claude Code dynamic-workflows meta block.
 */
interface WorkflowMeta {
  /** Short kebab-case workflow name (display + persistence key). */
  name: string
  /** One-line description of what the workflow does. */
  description: string
  /** Optional guidance on when this workflow applies (shown in listings). */
  whenToUse?: string
  /** Optional phase declarations matched by `phase()` calls. */
  phases?: WorkflowPhase[]
}
```

## Résultat terminal : `WorkflowResult`

Ce résultat décrit l’issue d’une exécution et est résolu par `WorkflowRun.result`. `value` contient la valeur de retour matérialisée du script sous forme de données JSON du contexte hôte — ou `null` lorsque le script ne renvoie rien — et n’a de sens que pour `completed`. `stopReason` est une union FERMÉE, possédée par le moteur et que les consommateurs peuvent traiter exhaustivement : `completed` | `cancelled` | `error`. Si la raison diffère de `completed`, `error` contient la défaillance et le consommateur la convertit en résultat d’outil `isError` au lieu de présenter une sortie partielle comme un succès.

```ts type-equiv
/**
 * The outcome resolved by a live workflow run. `value` is
 * the script's materialized return value (plain host-realm JSON data; `null`
 * when the script returned `undefined`) — meaningful only for `completed`.
 * A non-`completed` reason carries the failure in `error`; the consumer maps
 * it to an `isError` tool result rather than reporting partial output.
 */
interface WorkflowResult {
  /** The script's return value (host JSON data; `null` for no return). */
  value: unknown
  /** Why the run settled. */
  stopReason: WorkflowStopReason
  /** The failure message (present iff `stopReason` is not `completed`). */
  error?: string
  /**
   * How many `agent()` calls the run accepted over its whole lifetime. On a
   * graceful settlement this is the script-side count (calls still queued for
   * a concurrency slot included); on a termination path (grace force-settle,
   * worker death) it degrades to the host-observed count — calls queued
   * inside a terminated script are unknowable then.
   */
  agentsStarted: number
}
```

## Exécution active : `WorkflowRun`

Le consommateur conserve cette référence pendant l’exécution du script. Il attend `result`, peut appeler `cancel` en cours de route et DOIT appeler `dispose` quelle que soit l’issue. `result` ne rejette PAS sa promesse : l’échec du script se résout avec `stopReason: 'error'`. Après une annulation, l’exécution se TERMINE dans le délai de grâce borné du moteur, même si le script ne se termine jamais de lui-même ; le moteur force alors le résultat `cancelled`, puis le moteur fondé sur un worker arrête celui-ci. Un consommateur qui attend `result` ne reste donc jamais bloqué au-delà d’une annulation. `dispose()` équivaut à une annulation, suivie de cette terminaison bornée et du retour au repos des enfants ; cette méthode ne reste jamais suspendue à cause d’un script bloqué.

```ts type-equiv
/**
 * Holder-owned live workflow. `result` never rejects; consumers may cancel
 * and must call idempotent `dispose()` to await script and child quiescence.
 */
interface WorkflowRun {
  readonly id: WorkflowRunId
  /** The validated meta block available before the script body runs. */
  readonly meta: WorkflowMeta
  readonly result: Promise<WorkflowResult>
  /** Cancel the run and its children. */
  cancel(reason?: string): void
  /** Cancel if needed and await bounded settlement and cleanup. */
  dispose(): Promise<void>
}
```

## Discipline des défaillances : `WorkflowError.fatal`

Une mauvaise utilisation des fonctions disponibles dans le script — arguments incorrects, options de `agent()` inconnues ou différées, schéma extérieur au [sous-ensemble de sortie structurée](../../packages/core/tools/README.md), plafond atteint, échec de démarrage de la capacité ou annulation — lève une `WorkflowError` dont `fatal: true`. Les combinateurs `parallel()`/`pipeline()` RELÈVENT les erreurs fatales au lieu de convertir l’élément en `null` : une faute de frappe dans une option doit interrompre explicitement le script, et ne jamais se fondre dans une valeur qui ressemble à une défaillance ordinaire d’un enfant. La valeur `null` par élément est réservée aux échecs d’exécution des enfants — raison d’arrêt différente de `completed` — et aux erreurs ordinaires survenues dans une étape du script.

## Événements

Les événements `workflow/*` — `workflow/start`, `workflow/phase`, `workflow/log`, `workflow/agent-start`, `workflow/agent-end`, `workflow/end`, répertoriés dans le [catalogue des événements](#cordis-surface) — sont des émissions **réservées à l’observation** qui transportent des INSTANTANÉS DE DONNÉES. Chaque charge utile commence par `WorkflowRunInfo`, composé de l’identifiant et des métadonnées, jamais par le `WorkflowRun` actif ; un abonné ne peut donc pas obtenir les méthodes `cancel`/`dispose`. De plus, `workflow/end` omet volontairement la valeur du résultat afin qu’un écouteur observant les issues ne reçoive pas d’alias mutable du résultat de l’appelant. L’échec d’un écouteur est contenu indépendamment : l’exception est journalisée, jamais propagée, et ne prive pas les écouteurs enregistrés après lui. Chaque écouteur reçoit aussi sa propre copie de la charge utile ; sa modification n’altère ni le moteur ni les autres écouteurs. Ce confinement correspond à celui de `subagent/start`/`subagent/end`.

## Enregistrements durables dans la conversation

Le consommateur de premier niveau `lasmex-tool-workflow` projette les informations d’affichage dans la Session parente appelante sans modifier la propriété de l’exécution. Il écrit `tool-workflow/run-start` une fois l’exécution acceptée, associe le début et la fin de chaque membre par `runId + seq`, puis écrit `tool-workflow/run-end` seulement lorsque le résultat est connu et que la libération a atteint le repos. Les appels de transport imbriqués n’écrivent aucun enregistrement. Le premier échec d’ajout désactive les écritures suivantes de cette exécution ; le journal reste donc vide ou forme un préfixe continu valide, sans modifier le résultat de l’outil.

`lasmex-tool-workflow/invariant` valide le même protocole avant la validation en direct et lors du chargement d’une Session : un seul début par exécution, des numéros de séquence de membres positifs et uniques, une fin associée à chaque membre, aucun membre ouvert lors de la fin d’une exécution et aucune mise à jour après celle-ci. L’absence d’une fin de membre ou d’exécution à la fin du journal constitue une trace valide d’interruption, et non une corruption.

`lasmex-client-ui-workflow-run` agrège les quatre événements au moyen du moteur de nœuds de conversation dans un nœud Chat `workflow-run`, ancré sur la séquence de début d’exécution et placé après le nœud d’outil du workflow d’origine. Les groupes de phases proviennent uniquement des débuts effectifs des membres et conservent les chaînes exactes, y compris la différence entre une phase absente et `''`. Dans les emplacements fermés, l’absence d’informations terminales devient une présentation interrompue. Le [README du package d’interface](../../packages/client/ui-workflow-run/README.md) décrit le dévoilement, l’état et la navigation locale au sein du même parent.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxworkflowengine--workflowengine-abstract-seam"></a>

### `ctx.workflowEngine` — `WorkflowEngine` (abstract seam)

Workflow Service Definition contract. Invalid requests throw before publication; a live run is holder-owned, its result never rejects, cancellation and disposal are bounded, and disposal waits for child cleanup within that bound. Lifecycle listener failures are contained, and `workflow/end` fires exactly once as the result settles.

```ts cordis-catalog
/**
 * Parse and execute a workflow script.
 * @param request - the script, its `args`, the parent agent, and an
 *   optional cancel signal.
 * @returns the live run; its `result` resolves when the script settles.
 */
abstract start(request: WorkflowStartRequest): WorkflowRun
```

Source: [`packages/workflow/workflow/src/index.ts:157`](../../packages/workflow/workflow/src/index.ts)

<a id="workflow-events"></a>

### `workflow/*` events

<a id="workflowagent-end--emit"></a>

#### `workflow/agent-end` — emit

One `agent()` call settled (clean result, child failure, or run cancellation). Paired with Events['workflow/agent-start'] by `agent.seq`, exactly once per started call on every stop path — on an engine termination path (a worker killed past its grace) the end is engine-synthesized with outcome `'cancelled'`.

```ts cordis-catalog
/**
 * One `agent()` call settled (clean result, child failure, or run
 * cancellation). Paired with {@link Events['workflow/agent-start']} by
 * `agent.seq`, exactly once per started call on every stop path — on an
 * engine termination path (a worker killed past its grace) the end is
 * engine-synthesized with outcome `'cancelled'`.
 * @param info - the run's identity snapshot.
 * @param agent - the call identity plus its outcome.
 * @mode emit
 */
'workflow/agent-end'(info: WorkflowRunInfo, agent: WorkflowAgentEndInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts:79`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowagent-start--emit"></a>

#### `workflow/agent-start` — emit

One `agent()` call established a published child run. Paired with Events['workflow/agent-end'] by `agent.seq`. A call that never receives a published run from the provider emits neither event in this pair.

```ts cordis-catalog
/**
 * One `agent()` call established a published child run. Paired with
 * {@link Events['workflow/agent-end']} by `agent.seq`. A call that never
 * receives a published run from the provider emits neither
 * event in this pair.
 * @param info - the run's identity snapshot.
 * @param agent - the call's sequence number, label, phase, and child id.
 * @mode emit
 */
'workflow/agent-start'(info: WorkflowRunInfo, agent: WorkflowAgentInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts:68`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowend--emit"></a>

#### `workflow/end` — emit

A workflow run settled (any stop reason). Fired when WorkflowRun.result resolves. Paired with Events['workflow/start'].

```ts cordis-catalog
/**
 * A workflow run settled (any stop reason). Fired when
 * {@link WorkflowRun.result} resolves. Paired with
 * {@link Events['workflow/start']}.
 * @param info - the run's identity snapshot.
 * @param result - the outcome data (stop reason, error, agent count) —
 *   deliberately WITHOUT the result value (see {@link WorkflowResultInfo}).
 * @mode emit
 */
'workflow/end'(info: WorkflowRunInfo, result: WorkflowResultInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts:89`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowlog--emit"></a>

#### `workflow/log` — emit

The script emitted a narration line (a `log(message)` call).

```ts cordis-catalog
/**
 * The script emitted a narration line (a `log(message)` call).
 * @param info - the run's identity snapshot.
 * @param message - the logged message, verbatim.
 * @mode emit
 */
'workflow/log'(info: WorkflowRunInfo, message: string): void
```

Source: [`packages/workflow/workflow/src/index.ts:58`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowphase--emit"></a>

#### `workflow/phase` — emit

The script entered a phase (a `phase(title)` call) — progress grouping for observers; no execution semantics.

```ts cordis-catalog
/**
 * The script entered a phase (a `phase(title)` call) — progress grouping
 * for observers; no execution semantics.
 * @param info - the run's identity snapshot.
 * @param title - the phase title, verbatim.
 * @mode emit
 */
'workflow/phase'(info: WorkflowRunInfo, title: string): void
```

Source: [`packages/workflow/workflow/src/index.ts:51`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowstart--emit"></a>

#### `workflow/start` — emit

A workflow run started — the script's meta block validated, the body about to execute. Paired with Events['workflow/end'].

```ts cordis-catalog
/**
 * A workflow run started — the script's meta block validated, the body
 * about to execute. Paired with {@link Events['workflow/end']}.
 * @param info - the run's identity snapshot (id + meta).
 * @mode emit
 */
'workflow/start'(info: WorkflowRunInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts:43`](../../packages/workflow/workflow/src/index.ts)
<!-- END GENERATED cordis-surface -->
