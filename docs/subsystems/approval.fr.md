# Approbation utilisateur

Le seam d’approbation utilisateur de [lasmex-user-approval](../../packages/interaction/user-approval) répond à une question : cette action précise peut-elle s’exécuter ? Il possède le vocabulaire partagé des demandes et résultats, le service de distribution `ctx.approval`, la waterfall de répondants `approval/request`, la paire d’audit écrite uniquement dans le journal et la politique par session `ask`/`never`. Les canaux d’interface peuvent fournir des répondants humains ; le [pont d’automatisation ACP](../../packages/acp/acp) fournit des décisions automatiques ponctuelles pour ses propres agents. Des appelants comme [lasmex-tools](../../packages/core/tools) et [lasmex-tool-bash](../../packages/shell/tool-bash) consomment le résultat fermé et échouent de manière restrictive sauf si ce résultat est `allowed-once`.

Source : [`packages/interaction/user-approval/src/index.ts`](../../packages/interaction/user-approval/src/index.ts)

## Identité et résultat

Chaque demande reçoit un nouvel `ApprovalRequestId`. Ce type marqué associe les événements d’audit `approval/asked` et `approval/decided` sans rendre les identifiants d’approbation interchangeables avec ceux des appels d’outils, agents ou sessions.

```ts type-equiv
/**
 * Pairs one `approval/asked` audit event with its `approval/decided`.
 * Service-issued (one fresh id per {@link ApprovalService.request} call).
 */
type ApprovalRequestId = Branded<'ApprovalRequestId'>
```

`ApprovalOutcome` est fermé et restrictif par défaut. `allowed-once` autorise uniquement l’action visée ; les appelants refusent l’exécution pour `rejected`, `cancelled` et `unavailable`. Un répondant absent, non propriétaire, défaillant ou non conforme devient `unavailable` au lieu d’autoriser l’action.

```ts type-equiv
/**
 * Closed approval outcomes: a one-shot grant, explicit rejection, withdrawn
 * request, or unavailable answerer. Callers fail closed on `unavailable`.
 */
type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'
```

## Politique par session

`ApprovalPolicy` détermine le comportement avant l’exécution des répondants interactifs. `ask` délègue à la chaîne de répondants composée, dont la valeur par défaut en l’absence de réponse est `unavailable` ; `never` renvoie systématiquement `rejected` sans distribuer la demande à un répondant. La valeur effective est celle du dernier événement `approval/policy` du journal de session, ou à défaut celle de la configuration du service. `setApprovalPolicy(session, policy)` constitue l’unique chemin d’écriture, afin que la relecture reconstruise la surcharge.

```ts type-equiv
/**
 * A session's approval policy — what happens to an {@link ApprovalService}
 * ask BEFORE any interactive answerer sees it:
 *
 * - `'ask'` (the default) — delegate to the composed answerers; with none
 *   composed the chain falls through to the fail-closed `'unavailable'`.
 * - `'never'` — never prompt anyone: every ask resolves `'rejected'`
 *   deterministically. The strict headless stance (CI, unattended runs) and
 *   the policy whose outcome is knowable without asking.
 */
type ApprovalPolicy = 'ask' | 'never'
```

Les deux politiques ajoutent leur signification actuelle complète à l’instantané de contexte d’exécution compatible avec le cache. Le `user/message` qui porte sa source constitue l’entrée durable visible du modèle ; un changement d’état d’approbation ajoute un nouvel instantané complet après l’historique conservé, sans réécrire le prompt système de l’en-tête de requête.

## Demande d’approbation

`ApprovalRequest` identifie l’agent et l’action d’outil avec assez de précision pour router et auditer la question. Il omet volontairement les arguments de l’outil : le répondant rattache la demande à l’appel déjà diffusé au moyen de `callId`, au lieu d’en afficher une seconde copie susceptible de diverger.

```ts type-equiv
/**
 * Readonly same-process permission question. `callId` links to an already
 * presented tool call, so arguments are not duplicated here.
 */
interface ApprovalRequest {
  /**
   * The agent on whose behalf the question is asked. Routes the question (a
   * UI answerer only answers for agents it owns) and receives the audit
   * events on its session log.
   */
  readonly agent: Agent
  /** The tool the question is about (presentation and audit). */
  readonly toolName: string
  /**
   * The exact tool call being decided, when the asker has one — lets a UI
   * attach the prompt to the tool call it already streamed.
   */
  readonly callId?: CallId
  /** The asker's human-readable explanation of WHY it is asking. */
  readonly reason?: string
  /**
   * Aborting withdraws the question: the request settles `'cancelled'`
   * immediately and a late answer from a still-pending answerer is discarded.
   */
  readonly signal?: AbortSignal
}
```

## Distribution et audit

`ctx.approval.request(req)` exige que la session demandeuse se trouve dans un tour ouvert. Il ajoute `approval/asked`, obtient un résultat, ajoute l’événement `approval/decided` correspondant, puis résout la promesse avec ce résultat. La politique `never` est appliquée dans le service avant la distribution waterfall ; même un répondant enregistré ultérieurement avec `prepend` ne peut donc pas la contourner. Les répondants renvoient un résultat lorsqu’ils possèdent la demande ou appellent `next()` pour déléguer ; la première réponse occupe l’unique emplacement de décision.

Les événements d’audit sont écrits uniquement dans le journal et n’entrent pas dans le transcript du modèle. Le comportement visible du modèle correspond au résultat d’outil dérivé par l’appelant et à l’instantané actuel du contexte d’exécution. La libération du service retire sa contribution au contexte ; les listeners de répondants sont indépendamment liés aux effets de leurs plugins propriétaires.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Cette section est générée depuis le code source par `scripts/gen-cordis-catalog.ts` ; `pnpm run verify-cordis-catalog` vérifie sa fraîcheur dans doc-sync et `pnpm run gen-cordis-catalog` la régénère. Les blocs de signatures utilisent une fence `ts cordis-catalog` et conservent le JSDoc original. Les modes de distribution sont définis dans le [primer](../cordis-primer.md#dispatch-modes), tandis que l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxapproval--approvalservice"></a>

### `ctx.approval` — `ApprovalService`

Service d’approbation qui applique la politique de session avant les répondants et consigne chaque paire demande/résultat dans la session demandeuse. Il expose au modèle les changements déterministes de politique au moyen de l’instantané de contexte d’exécution et des notices de bascule.

```ts cordis-catalog
/**
 * Switch one live agent's policy and queue the transition for its next model
 * step. Session initialization uses {@link setApprovalPolicy} directly
 * because there is no previously visible policy to change.
 * @param agent - the live agent whose policy is changing.
 * @param policy - the new effective policy.
 */
setPolicy(agent: Agent, policy: ApprovalPolicy): void

/**
 * Ask the composed answerers to decide one readonly same-process request.
 * The service borrows the request, agent, session, and live signal directly.
 * The request requires an open turn because the audit pair must be enclosed
 * by the durable log's commit/replay boundary; an idle ask rejects before
 * appending anything. The answerer phase always produces an outcome: an
 * aborted signal yields `'cancelled'`, a missing or throwing answerer yields
 * `'unavailable'` (fail closed), and a rogue non-vocabulary return value is
 * normalized to `'unavailable'`. A failure that prevents either audit append
 * from committing still rejects because returning an unlogged decision would
 * violate the pair. Session contains post-commit observer failures, so an
 * authoritative append cannot reject the request or suppress its matching
 * audit event.
 * @param req - the pending decision (agent, tool identity, reason, signal).
 * @returns the closed outcome; `'allowed-once'` is the only grant.
 * @throws when no turn is open or either audit event fails before the session
 *   append commit point.
 */
async request(req: ApprovalRequest): Promise<ApprovalOutcome>

/**
 * Read the session override without applying the configured default.
 * @param session - session whose log supplies the override.
 * @returns the last logged policy, or `undefined` without one.
 */
overrideOf(session: Session): ApprovalPolicy | undefined
```

Types : [Agent](core.md) · [Session](session.md)

Source : [`packages/interaction/user-approval/src/index.ts:192`](../../packages/interaction/user-approval/src/index.ts)

<a id="approval-events"></a>

### Événements `approval/*`

<a id="approvalrequest--waterfall"></a>

#### `approval/request` — waterfall

Demande une décision aux répondants composés. Le répondant renvoie un résultat pour revendiquer la demande ou appelle `next()` pour déléguer ; un échec produit la valeur restrictive par défaut. Distribution filtrée par scope (`lasmex-scope`) : les listeners propres à un agent reçoivent uniquement cet agent.

```ts cordis-catalog
/**
 * Ask composed answerers for one decision. Return an outcome to claim the
 * request or call `next()`; failure yields the fail-closed default.
 * Scope-filtered dispatch (`lasmex-scope`): agent-scoped listeners receive only that agent.
 * @param req - the pending decision (agent, tool identity, reason, signal).
 * @mode waterfall
 */
'approval/request'(this: Scoped<ApprovalService>, req: ApprovalRequest, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome>
```

Types : [Scoped](scope.md)

Source : [`packages/interaction/user-approval/src/index.ts:30`](../../packages/interaction/user-approval/src/index.ts)
<!-- END GENERATED cordis-surface -->
