# Objectifs dans une même session

Types partagés par le service d’objectifs fondé sur les événements et ses consommateurs de politique. L’[Agent Note sur le domaine des objectifs](../../.agents/notes/implemented/feature/2026-07-19-persisted-same-session-goal-domain.md) décrit les décisions de persistance et d’activation. Cette page reproduit les champs et variantes exacts de [`packages/goal/goal/src/types.ts`](../../packages/goal/goal/src/types.ts).

## Identité et cycle de vie

`GoalId` est un [identifiant marqué](core.md#branded-ids). Un appelant modifie une révision précise au moyen de `GoalRef` ; chaque modification durable acceptée incrémente la révision.

```ts type-equiv
/** Compare-and-set identity for one exact goal revision. */
interface GoalRef {
  /** Stable goal identity. */
  readonly id: GoalId
  /** Positive revision; every durable mutation increments it. */
  readonly revision: number
}
```

La phase durable indique ce qui est arrivé à l’objectif. L’activation, propre au processus, indique séparément si un consommateur chargé de la continuation peut lancer un nouveau cycle.

```ts type-equiv
/** Durable continuation phase. Activation is process-local and separate. */
type GoalPhase =
  | 'active'
  | 'paused'
  | 'blocked'
  | 'complete'
```

Le blocage est l’unique état durable d’arrêt causé par un problème. Son motif, défini par la politique, contient un code stable en minuscules et kebab-case pour le routage, ainsi qu’une explication libre destinée aux humains et aux modèles.

```ts type-equiv
/** Machine-routable and human-readable explanation for a blocked goal. */
interface GoalBlockReason {
  /** Stable lower-kebab-case classification chosen by the blocking policy. */
  readonly code: string
  /** Non-empty explanation shown to humans and models. */
  readonly message: string
}
```

```ts type-equiv
/** Full durable state written by every non-clear goal mutation. */
interface GoalSnapshot extends GoalRef {
  /** Human-requested completion objective. */
  readonly objective: string
  /** Durable lifecycle phase. */
  readonly phase: GoalPhase
  /** Present exactly while `phase` is `blocked`. */
  readonly blockedReason?: GoalBlockReason
  /** Total admitted goal-round cap. */
  readonly maxGoalRounds: number
}
```

```ts type-equiv
/** Current goal projection, including values derived from the session log. */
interface GoalView extends GoalSnapshot {
  /** Highest admitted round number for this goal. */
  readonly roundsStarted: number
  /** Epoch milliseconds of the create mutation. */
  readonly createdAt: number
  /** Epoch milliseconds of the latest mutation. */
  readonly updatedAt: number
  /** Process-local continuation eligibility; never persisted. */
  readonly activation: GoalActivation
}
```

## Modifications durables

Chaque modification est un événement de session durable `goal/change` dont la charge utile contient soit un instantané complet après modification, soit une pierre tombale d’effacement. La réduction stricte et la projection persistée dérivent l’état du cycle de vie uniquement de ces événements ; les modifications de la boîte de réception n’affectent pas l’état de l’objectif.

```ts type-equiv
/** Full-snapshot goal mutation committed by a durable `goal/change` event. */
interface GoalSnapshotChangeMeta {
  readonly kind: 'goal/change'
  readonly version: 1
  readonly operation: Exclude<GoalOperation, 'clear'>
  readonly goal: GoalSnapshot
  readonly roundsStarted: number
  readonly createdAt: number
  readonly updatedAt: number
}
```

```ts type-equiv
/** Tombstone retained when the current goal is cleared. */
interface GoalClearChangeMeta {
  readonly kind: 'goal/change'
  readonly version: 1
  readonly operation: 'clear'
  readonly cleared: GoalRef
  readonly clearedAt: number
}
```

Un consommateur chargé de la continuation attribue à chaque tour admis contenant un message utilisateur un numéro de cycle positif et séquentiel, ainsi que la révision courante. Seuls ces événements `user/message` admis font progresser `roundsStarted`. Le rejeu refuse les numéros non positifs, les discontinuités, les révisions périmées, les phases arrêtées et les dépassements de limite.

```ts type-equiv
/** Message attribution for admitted continuation rounds. */
interface GoalMessageSource {
  readonly kind: 'goal'
  readonly goalId: GoalId
  readonly revision: number
  /** Positive admitted continuation round. */
  readonly round: number
}
```

## Requêtes et notifications

La création distingue l’omission de l’appelant du choix du déploiement, que `create()` résout en interne. Une modification remplace partiellement les champs ; son validateur d’exécution exige qu’au moins un champ soit présent. Chaque notification de modification contient l’opération acceptée et la révision exacte. Un effacement omet `goal`.

```ts type-equiv
/** Input whose omitted round cap is resolved by the service configuration. */
interface CreateGoalRequest {
  readonly objective: string
  readonly maxGoalRounds?: number
}
```

```ts type-equiv
/** Fields changed by an edit; at least one must be present. */
interface EditGoalRequest {
  readonly objective?: string
  readonly maxGoalRounds?: number
}
```

```ts type-equiv
/** Live notification after one durable goal mutation commits. */
interface GoalChanged {
  readonly operation: GoalOperation
  readonly ref: GoalRef
  /** Absent for a clear tombstone. */
  readonly goal?: GoalView
}
```

## Comportement du service

[`GoalService`](../../packages/goal/goal/src/index.ts) résout les valeurs par défaut à la création, effectue une réduction stricte des événements durables `goal/change`, impose l’identité exacte de l’agent actif et les modifications par comparaison-échange, puis émet des notifications `goal/changed` confinées. Le [README du package](../../packages/goal/goal/README.md) définit l’API appelable et le contrat visible par le modèle.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Générée depuis les sources par `scripts/gen-cordis-catalog.ts` (sa fraîcheur est vérifiée par `pnpm run verify-cordis-catalog` dans doc-sync ; régénérez-la avec `pnpm run gen-cordis-catalog`) — cette section est identique octet pour octet dans les deux langues de la page. Les blocs de signature utilisent une clôture `ts cordis-catalog` et conservent la JSDoc source d’origine. Les modes de répartition sont définis dans le [guide d’introduction](../cordis-primer.md#dispatch-modes), et l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxgoals--goalservice"></a>

### `ctx.goals` — `GoalService`

Service d’objectifs (`ctx.goals`) fondé exclusivement sur le journal de la session propriétaire.

```ts cordis-catalog
/**
 * Read the current goal for one exact live agent.
 * @param agent - owning live agent.
 * @returns a fresh view or `undefined` when no goal is current.
 * @throws {@link GoalError} when the agent is not the registry's live instance.
 */
get(agent: Agent): GoalView | undefined

/**
 * Remove process-local continuation authority without changing durable goal
 * phase or revision. Lifecycle owners use this before unloading a driver;
 * a later human-authorized {@link resume} records the new activation edge.
 * @param agent - owning live agent.
 * @returns a fresh disarmed view, or `undefined` when no goal is current.
 */
disarm(agent: Agent): GoalView | undefined

/**
 * Create and arm a goal. A completed goal may be replaced; every other
 * current phase must be cleared or resumed instead.
 * @param agent - owning live agent.
 * @param request - objective and optional round cap.
 * @returns the created live view.
 */
create(agent: Agent, request: CreateGoalRequest): GoalView

/**
 * Edit objective and/or round cap without changing phase.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @param request - at least one replacement field.
 * @returns the edited view.
 */
@Remote('edit') edit(agent: Agent, ref: GoalRef, request: EditGoalRequest): GoalView

/**
 * Pause an active goal and disarm automatic continuation.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @returns the paused view.
 */
@Remote('pause') pause(agent: Agent, ref: GoalRef): GoalView

/**
 * Resume and arm a stopped goal, or rearm an active goal after a
 * session-start edge, while its round budget still has capacity.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @returns the active view.
 */
@Remote('resume') resume(agent: Agent, ref: GoalRef): GoalView

/**
 * Mark a current non-complete goal complete and disarm it.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @returns the completed view.
 */
@Remote('complete') complete(agent: Agent, ref: GoalRef): GoalView

/**
 * Mark an active goal blocked and disarm it.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @param reason - policy-owned stable code and human-readable explanation.
 * @returns the blocked view with its durable reason.
 */
block(agent: Agent, ref: GoalRef, reason: GoalBlockReason): GoalView

/**
 * Clear the current goal while retaining a durable tombstone and history.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @returns the tombstone ref whose revision is one past the cleared snapshot.
 */
@Remote('clear') clear(agent: Agent, ref: GoalRef): GoalRef

/**
 * Create one Goal through the remote boundary.
 * @param agent - exact live Agent resolved from the wire identity.
 * @param request - objective and optional round cap.
 * @returns the created Goal identity.
 */
@Remote('create') remoteExportCreate(agent: Agent, request: CreateGoalRequest): CreateGoalResult
```

Types : [Agent](core.md)

Source : [`packages/goal/goal/src/index.ts:183`](../../packages/goal/goal/src/index.ts)

<a id="goal-events"></a>

### Événements `goal/*`

<a id="goalchanged--emit"></a>

#### `goal/changed` — emit

Modification d’objectif acceptée par un agent actif. L’événement de session `goal/change` correspondant a déjà été validé. Les échecs des écouteurs sont confinés. La répartition est filtrée par portée (`lasmex-scope`) : les écouteurs limités à un agent ne reçoivent que les événements de cet agent.

```ts cordis-catalog
/**
 * Goal mutation accepted by one live agent. The matching `goal/change`
 * session event has already committed. Listener failures are contained.
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent.
 * @param payload.agent - agent whose session owns the goal.
 * @param payload.change - fresh current projection or clear tombstone.
 * @mode emit
 */
'goal/changed'(this: import('lasmex-scope').Scoped<Agent>, payload: { agent: Agent; change: GoalChanged }): void
```

Types : [Agent](core.md) · [Scoped](scope.md)

Source : [`packages/goal/goal/src/domain.ts:114`](../../packages/goal/goal/src/domain.ts)
<!-- END GENERATED cordis-surface -->
