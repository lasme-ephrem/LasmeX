# Interaction avec l’utilisateur

Le seam de questions utilisateur de [lasmex-user-questions](../../packages/interaction/user-questions). Il fournit le vocabulaire indépendant du fournisseur qu’un outil ou un plugin de permissions emploie lorsqu’une réponse humaine est nécessaire avant que l’agent puisse poursuivre. Les interfaces fournissent le `UserQuestionProvider` actif ; l’environnement hôte relaie les demandes à son client connecté.

Source : [`packages/interaction/user-questions/src/index.ts`](../../packages/interaction/user-questions/src/index.ts)

## Options d’une question

`AskUserQuestionOption` contient un choix sélectionnable. `label` désigne le texte de l’option présenté à l’utilisateur et la valeur sélectionnée transmise au modèle ; `description` est un texte d’aide facultatif pour l’interface.

```ts type-equiv
/** One selectable answer offered to the user. */
interface AskUserQuestionOption {
  /** User-facing label. */
  label: string
  /** Optional extra context rendered by capable UIs. */
  description?: string
}
```

## Intention de présentation

`AskUserQuestionIntent` peut déclarer une catégorie de décision connue. Son discriminant est `kind`, afin que de nouvelles intentions puissent être ajoutées ; une interface qui ne reconnaît pas un tag affiche la liste d’options générique. Une intention modifie uniquement la présentation : une interface qui la prend en charge répond avec les mêmes libellés d’option qu’une interface générique, si bien que l’appelant lit les mêmes champs de réponse dans les deux cas. `approve` nomme l’option affirmative sans dépendre de l’ordre des options. `ask()` rejette les deux assertions que le système de types ne peut pas exprimer : un `approve` qui ne nomme aucune option de sa propre question et une intention placée sur une question dépourvue de `detail`.

```ts type-equiv
/**
 * A caller-declared presentation intent: the question IS this kind of
 * decision, so a UI that recognises the tag may present it as such instead of as a
 * generic option list. Tagged so further intents can be added; a UI that does
 * not know a tag renders the generic flow, and the answer encoding is identical
 * either way — an intent changes presentation only, never the protocol.
 */
type AskUserQuestionIntent = {
  /** A plan submitted for review: `detail` is the plan markdown `ask()` requires, and the decision approves or declines it. */
  kind: 'plan-review'
  /**
   * The option label that approves the plan; every other option declines it.
   * Named rather than positional so no UI infers the verdict from option order.
   * An `approve` naming no option of its own question is rejected at `ask()`.
   */
  approve: string
}
```

## Élément de question

`AskUserQuestionItem` représente une question dans une demande. L’appelant fournit un `id` stable, renvoyé avec la réponse afin que chaque question d’un lot reste identifiable. Le champ facultatif `detail` contient un texte explicatif que les fournisseurs affichent avec la question, mais tiennent à l’écart des libellés d’options sélectionnables.

```ts type-equiv
/** One question in a user-questions request. */
interface AskUserQuestionItem {
  /** Stable caller-provided question id, echoed in the answer. */
  id: string
  /** The question to display. */
  question: string
  /** Optional supporting detail rendered with the question but kept out of option labels. */
  detail?: string
  /** Optional short heading/group label. */
  header?: string
  /** Optional choices the UI can render as a menu. */
  options?: AskUserQuestionOption[]
  /** Whether more than one option may be selected. Defaults to single-select. */
  multiSelect?: boolean
  /** Optional presentation intent for capable UIs; absent asks for the generic option list. */
  intent?: AskUserQuestionIntent
}
```

## Demande de question

`AskUserQuestionRequest` est la demande partagée entre les packages. `questions` est un tableau afin qu’une interface puisse présenter des questions liées au sein d’un même parcours tout en conservant un identifiant stable pour chaque réponse. Lorsqu’il est présent, `agent` désigne exactement l’appelant actif ; le seam d’interaction ne l’accepte que si le registre actif identifie cette instance comme une racine d’exécution.

```ts type-equiv
/** Request for a human answer. */
interface AskUserQuestionRequest {
  /** Questions to display. */
  questions: AskUserQuestionItem[]
  /** Exact live calling agent, when the request came from an agent tool call. */
  agent?: Agent
  /** Abort signal for the owning tool/step. */
  signal?: AbortSignal
}
```

## Réponse

Les fournisseurs renvoient un élément de réponse pour chaque identifiant de question. `selected` contient les libellés des options sélectionnées, tandis que `custom` contient une réponse libre « Autre » saisie par l’utilisateur. Pour une question à choix unique, `custom` remplace le choix sélectionné et `selected` est vide. Pour une question à choix multiple, `custom` peut compléter les libellés de `selected`. Une interface peut également renvoyer un élément dont `selected` est vide et qui n’a pas de `custom`, afin de conserver une question ignorée dans un lot par ailleurs terminé.

```ts type-equiv
/** Answer to one question. */
interface AskUserQuestionAnswerItem {
  /** The answered question id. */
  id: string
  /** Selected option labels. May accompany custom text for a multi-select question. */
  selected: string[]
  /** Optional free-text "Other" answer. */
  custom?: string
}
```

```ts type-equiv
/** The human's answer. */
interface AskUserQuestionAnswer {
  /** Structured answers keyed by question id. */
  answers: AskUserQuestionAnswerItem[]
}
```

## Fournisseur

Un seul fournisseur peut être actif dans un contexte. Son enregistrement est lié à un effet, afin que le HMR ou la libération supprime l’interface active.

```ts type-equiv
/** UI-side provider for user questions. */
interface UserQuestionProvider {
  ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer>
}
```

## Erreurs

`UserQuestionError` étend `HarnessError`, de sorte que `ctx.tools.execute()` conserve `{ name, code }` pour les échecs d’outil présentés au modèle, notamment `EMPTY_QUESTIONS`, `NO_PROVIDER`, `ASK_ABORTED` ou une annulation côté interface.

```ts type-equiv
/** Stable error taxonomy for user-questions failures. */
class UserQuestionError extends HarnessError {
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'UserQuestionError'
  }
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Cette section est générée depuis le code source par `scripts/gen-cordis-catalog.ts` ; `pnpm run verify-cordis-catalog` vérifie sa fraîcheur dans doc-sync et `pnpm run gen-cordis-catalog` la régénère. Les blocs de signatures utilisent une fence `ts cordis-catalog` et conservent le JSDoc original. Les modes de distribution sont définis dans le [primer](../cordis-primer.md#dispatch-modes), tandis que l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxuserquestions--userquestionservice"></a>

### `ctx.userQuestions` — `UserQuestionService`

`ctx.userQuestions` : un fournisseur d’interface actif et une API `ask()`.

```ts cordis-catalog
/**
 * Register the UI provider. Only one provider may be active in a context.
 *
 * @param provider UI-side implementation that collects answers.
 * @returns Disposer that unregisters this provider.
 */
registerProvider(provider: UserQuestionProvider): () => void

/**
 * Ask the active UI provider and wait for the user's answer.
 *
 * When a caller supplies an agent, human interaction is valid only for the
 * exact live runtime root. Runtime ownership, not durable session lineage,
 * decides this boundary: an owned child has no human answerer and would
 * block forever, while a lineage-bearing session resumed as a new runtime
 * root may ask normally.
 *
 * @param request Questions, owner agent, and abort signal.
 * @returns The answer chosen or typed by the human.
 * @throws {UserQuestionError} code `CALLER_NOT_LIVE` when a supplied
 *   agent is not the registry's exact live instance, or `DELEGATED_CALLER`
 *   when that live agent is owned by another agent.
 */
async ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer>
```

Source : [`packages/interaction/user-questions/src/index.ts:51`](../../packages/interaction/user-questions/src/index.ts)
<!-- END GENERATED cordis-surface -->
