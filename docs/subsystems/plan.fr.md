# Mode plan

Le mode plan est un état de collaboration journalisé par agent, détenu par [lasmex-plan-mode](../../packages/plan/plan-mode) (`ctx.planMode`, `PlanModeController`). Tant qu’il est actif, une section de consignes appartenant au déploiement est incluse dans chaque requête au modèle. Le mode plan fournit des **consignes souples**. Le [mode sandbox](sandbox.md) et la [politique d’approbation](approval.md) imposent leurs restrictions indépendamment ; aucun des deux ne lit ni n’écrit l’état du plan, de sorte que le déploiement les configure séparément. Le package est facultatif et la boucle de l’agent n’en dépend pas. Il fournit la section d’invite `plan:policy` et enregistre l’outil `exit_plan_mode` ainsi que la commande `/plan`. La [note de conception](../../.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.md) explique les choix retenus ; le [README du package](../../packages/plan/plan-mode/README.md) décrit l’expérience du modèle et ses limites.

Source : [`packages/plan/plan-mode/src/index.ts`](../../packages/plan/plan-mode/src/index.ts)

## État journalisé et récupération

`plan/mode` (`{ active: boolean }`) est un [événement de session](session.md) qui remplace une valeur entière et n’existe que dans le journal : il est durable et rejouable, mais n’appartient jamais à la transcription du modèle. `foldPlanMode(events, end?)` renvoie la dernière valeur journalisée dans le préfixe, ou `false` lorsqu’il n’en existe aucune. L’état applicable est donc toujours obtenu par une réduction pure du journal de session : la reprise, le fork et la compaction le récupèrent sans copie en mémoire, et les interfaces observent les basculements validés par `session/event`. La déclaration complète de l’événement figure dans le [catalogue des événements du journal de persistance](../persistence-catalog.md).

## Sélections en attente et ajout avant l’étape

Comme chaque événement de session appartient à un tour, une sélection de l’utilisateur reste en attente jusqu’à ce que la prochaine pré-étape acceptée l’enregistre dans un tour, quel que soit ce tour. Une sélection ne force jamais la continuation. Si elle intervient après la dernière pré-étape acceptée d’un tour, elle est enregistrée dans un tour ultérieur. `set(agent, active)` mémorise la sélection en attente — sans effet lorsque la cible est identique à l’état journalisé ou déjà en attente — et `get(agent)` renvoie `{ active: boolean; pending?: boolean }` : l’état journalisé utilisé pour assembler l’étape courante, accompagné de l’état sélectionné qui attend d’être enregistré.

Le seul point d’enregistrement pendant l’exécution d’un agent est un écouteur `agent/pre-step` placé en tête. Il observe chaque étape de requête proposée, y compris l’étape 1 du tour 1 et les tentatives de récupération d’une requête. Il appelle d’abord les écouteurs en aval et n’enregistre la sélection qu’une fois l’étape acceptée. L’admission de l’invite se produit avant un tour et ne peut pas enregistrer `plan/mode` ; une sélection effectuée dans l’invite est donc enregistrée par la première pré-étape acceptée du tour qu’elle démarre. Un échec d’enregistrement ne peut pas bloquer le tour, et la sélection reste en attente d’une pré-étape ultérieure acceptée dans un tour. Une sélection enregistrée par l’utilisateur produit également un seul avis `user/message` provenant du plugin, mais uniquement lorsque le dernier en-tête de requête journalisé décrivait l’autre état. Le modèle apprend ainsi exactement quand son contexte a changé, sans répétition. Une sélection effectuée après la dernière pré-étape acceptée d’un tour reste propre au processus et est perdue si celui-ci se termine avant une nouvelle pré-étape acceptée dans un tour ([limite documentée dans le README](../../packages/plan/plan-mode/README.md#known-limitations-and-deferred-work)).

## Configuration

```ts type-equiv
/** Deployment-owned plan guidance. */
interface PlanModeConfig {
  /** Guidance rendered as the `plan:policy` prompt section while plan mode is active. */
  section: string
}
```

Une valeur `section` absente, vide ou qui n’est pas une chaîne, ainsi que toute clé inconnue, provoque un échec au chargement du plugin au lieu d’être ignorée. Lorsque le mode plan est actif, le texte exact de `section` est rendu comme section d’[invite système](system-prompt.md) `plan:policy` à l’ordre 50. Le mode inactif ne fournit aucun texte.

## L’outil de sortie et la commande `/plan`

[`exit_plan_mode`](../tool-catalog.md#lasmex-plan-mode) reste enregistré lorsque le mode plan est inactif. Entrer dans ce mode ou le quitter ne modifie donc que la section d’invite, jamais le catalogue d’outils de la requête ; une exécution en dehors du mode plan échoue. En mode plan, l’outil exige un plan Markdown complet commençant par un titre `#`, puis le présente pour validation au moyen du [seam de questions à l’utilisateur](user-questions.md). L’approbation renvoie `{ approved: true }` et enregistre une sortie silencieuse, sans narration, qui reste en attente jusqu’à la prochaine pré-étape acceptée dans un tour. Les consignes du plan restent donc actives pendant tout le reste du lot d’outils courant de l’assistant, et le résultat de l’outil indique lui-même la transition. Demander de poursuivre la planification produit un appel en échec qui transporte le retour de l’utilisateur : le modèle révise puis présente de nouveau. L’absence de canal d’interaction et le rechargement du service pendant la validation font également échouer l’appel, au lieu de quitter silencieusement le mode plan.

Lorsque [`ctx.commands`](commands.md) est composé, le plugin enregistre `/plan [off|message]`. La commande `/plan` sans argument sélectionne le mode plan. Tout autre message non vide le sélectionne, puis transmet le texte au moyen de `agent.steer()` afin qu’il devienne, sous les consignes du plan, le message utilisateur ordinaire journalisé de l’étape suivante. L’argument exact `off` sélectionne l’état inactif ; il annule aussi une entrée en attente avant son ajout et avant qu’elle ne devienne visible par une requête.

## Le service

`ctx.planMode` possède l’état journalisé du plan, applique et décrit l’état sélectionné au début d’une étape, et possède la section `plan:policy`, la commande `/plan` ainsi que l’outil de sortie stable. Les signatures de `get` et `set` figurent dans le [catalogue de services](#ctxplanmode--planmodecontroller) généré.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Générée depuis les sources par `scripts/gen-cordis-catalog.ts` (sa fraîcheur est vérifiée par `pnpm run verify-cordis-catalog` dans doc-sync ; régénérez-la avec `pnpm run gen-cordis-catalog`) — cette section est identique octet pour octet dans les deux langues de la page. Les blocs de signature utilisent une clôture `ts cordis-catalog` et conservent la JSDoc source d’origine. Les modes de répartition sont définis dans le [guide d’introduction](../cordis-primer.md#dispatch-modes), et l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxplanmode--planmodecontroller"></a>

### `ctx.planMode` — `PlanModeController`

`ctx.planMode` possède l’état journalisé du plan, applique et décrit l’état sélectionné au début d’une étape, la section `plan:policy`, la commande `/plan` ainsi que l’outil de sortie stable. Les interfaces observent les basculements validés au moyen de `session/event` ; il n’existe aucune copie en mémoire.

```ts cordis-catalog
/**
 * Read the logged plan state and any selected state awaiting the next
 * accepted in-turn pre-step.
 *
 * @param agent The agent to read.
 * @returns Current logged state plus a pending selection, when present.
 */
get(agent: Agent): { active: boolean; pending?: boolean }

/**
 * Select whether plan mode should be active. Between turns the method
 * appends the change immediately because no in-turn pre-step will run until
 * another prompt starts a turn. The open-turn fold is the idle signal:
 * agent status stays `running` through post-turn checkpointing, when no
 * further in-turn pre-step runs. During an open turn the selection remains
 * pending until the next accepted in-turn pre-step. Repeated selection of
 * the current or already-pending state is a no-op.
 *
 * @param agent The agent to switch.
 * @param active Whether plan mode should be active.
 * @returns what happened: `committed` (logged now), `queued` (awaiting the
 * next accepted in-turn pre-step), `cancelled` (an opposite pending selection
 * was cleared; the logged state already matches), or `noop` (already in that
 * state).
 */
set(agent: Agent, active: boolean): 'committed' | 'queued' | 'cancelled' | 'noop'
```

Types : [Agent](core.md)

Source : [`packages/plan/plan-mode/src/index.ts:184`](../../packages/plan/plan-mode/src/index.ts)
<!-- END GENERATED cordis-surface -->
