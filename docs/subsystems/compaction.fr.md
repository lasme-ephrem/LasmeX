# Compaction

Le seam de compaction est un [seam de fonctionnalité](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md) réparti comme celui de Bash : une définition de service ([lasmex-compaction](../../packages/compaction/compaction), `ctx.compaction`), un fournisseur de service tel que [lasmex-compaction-basic](../../packages/compaction/compaction-basic) et un consommateur humain ([lasmex-command-compact](../../packages/compaction/command-compact)). La compaction est **une fonctionnalité facultative**, distincte du cœur de la boucle d’agent. Son vocabulaire se trouve donc ici plutôt que dans [core.md](core.md). Un backend fondé sur un tokenizer ou un modèle de texte serait un package voisin implémentant la même interface. Contrairement à Bash, cette interface dépend nécessairement de `lasmex-session` et de `lasmex-llm` : ses opérations agissent sur une `Session` appartenant à un agent et son événement de résumé durable emploie le vocabulaire `ContentBlock`. Voir l’[Agent Note sur le seam de compaction](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md).

Source : [`packages/compaction/compaction/src/types.ts`](../../packages/compaction/compaction/src/types.ts)

## Les événements de session `compaction/*`

La compaction étend [`SessionEventMap`](session.md) avec trois types d’événements par fusion de déclarations. Tous trois sont **réservés au journal** : ils enregistrent le verrou, le résumé, la plage sélectionnée, les numéros de séquence des événements masqués, le nombre de jetons et l’appel au modèle, sans rejoindre la surface. `SurfaceEventType` n’est délibérément PAS étendu, car seuls les événements qui produisent un message atteignent le modèle. Le résumé lui-même est donc transporté par un événement `user/message` distinct doté de `surfaceOp: { op: 'replace', start, end }`, l’unique modification de surface effectuée par la compaction par résumé. L’[Agent Note](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md) explique le choix de réutiliser `user/message`.

| Événement | Charge utile | Rôle |
|---|---|---|
| `compaction/start` | `{ turn }` | acquiert le verrou enregistré dans le journal ; un nombre désigne le tour automatique ouvert, tandis que `null` désigne une tentative manuelle autonome |
| `compaction/summary` | `{ summary, rawOutput?, llmStreamCall?, shadowedRange, shadowedSeqs, shadowedTokenCount, provider, model, maxTokens?, usage? }` | projection sûre du résumé, sortie complète et utilisation facultatives du fournisseur, marqueur `llmStreamCall: true` lorsque la production du résultat a consommé exactement un appel au moyen de `ctx.llm.stream()` dans ce contexte, ce qui exige un `rawOutput` complet, paire de limites de surface masquées (`start`/`end`, c’est-à-dire une plage de positions et non un intervalle numérique), numéros de séquence masqués dans l’ordre de la surface, nombre de jetons estimé et enveloppe de l’appel de résumé (`provider`, `model` et limite de génération lorsqu’elle s’applique). Ces données sont journalisées afin que la requête ponctuelle soit reconstructible depuis le journal et le code, conformément à l’Agent Note sur la reconstructibilité. Un `rawOutput` non marqué n’identifie pas le chemin d’appel. |
| `compaction/end` | `{ turn, error? }` | libère le verrou avec le même propriétaire numérique ou nul ; `error` enregistre une tentative infructueuse |

Le verrou encadre **toute** l’opération : `compaction/start` est ajouté en premier, puis la synthèse, l’enregistrement `compaction/summary` et le remplacement `user/message` sont persistés, avant l’ajout final de `compaction/end`. La libération du verrou en dernier transforme un incident en cours d’opération en verrou orphelin détectable, c’est-à-dire un `compaction/start` sans `compaction/end` correspondant, plutôt qu’en un `compaction/end` qui déclarerait à tort la compaction terminée.

Les marqueurs sont des instants du verrou, pas un conteneur exclusif. Une injection sans rapport effectuée pendant l’inactivité peut apparaître entre le début et la fin d’une compaction manuelle autonome lorsque la synthèse est en attente. Le chemin manuel revalide uniquement la plage positionnelle sélectionnée ; le contexte injecté survit donc au point de remplacement. Un début actif sans fin correspondante bloque tous les points d’entrée. Un début sans fin situé avant un `session/end-seed` plus récent constitue un indice périmé d’un cycle de vie antérieur et est ignoré.

Ces variantes sont fusionnées dans un bloc `declare module 'lasmex-session/types'`. Contrairement aux types de premier niveau des autres pages de sous-systèmes, elles ne sont donc pas reproduites dans un bloc ` ```ts type-equiv ` dont la dérive est vérifiée : l’extracteur `verify-type-equiv` ne reconnaît que les déclarations de premier niveau par leur nom. Le tableau de charges utiles ci-dessus constitue l’entrée du catalogue ; suivez le lien vers la source pour consulter les champs faisant autorité.

## `CompactionResult`

Résultat renvoyé à l’appelant par une compaction réussie : numéros de séquence des événements de suivi, projection sûre du résumé, plage et numéros de séquence masqués, ainsi que nombre de jetons estimé.

```ts type-equiv
/** Result of a successful compaction operation. */
interface CompactionResult {
  /** Stable identity shared by this compaction's complete durable lifecycle. */
  compactionId: CompactionId
  /** Human command that initiated this compaction, when it was manual. */
  sourceCommandId?: CommandId
  /** The seq of the appended `compaction/start` event. */
  startSeq: number
  /** The seq of the appended `compaction/summary` event. */
  summarySeq: number
  /** The seq of the appended `compaction/end` event. */
  endSeq: number
  /** The summary content blocks produced by the backend. */
  summary: ContentBlock[]
  /**
   * The surface-boundary pair that was shadowed: the seqs of the first
   * (`start`) and last (`end`) surface nodes of the replaced range. A
   * surface-POSITION span, not a numeric seq interval — after a prior replace
   * lands a fresh high-seq summary node at an older range's position, `start`
   * can be GREATER than `end`. {@link CompactionResult.shadowedSeqs} is the
   * authoritative set of shadowed nodes, in surface order.
   */
  shadowedRange: { start: number; end: number }
  /** The seqs of all shadowed surface nodes, in surface order. */
  shadowedSeqs: number[]
  /** Estimated token count of the shadowed content. */
  shadowedTokenCount: number
}
```

## Le service

Les appelants automatiques indiquent la raison pour laquelle la politique s’exécute. Les implémentations peuvent traiter un dépassement confirmé plus agressivement qu’une pression ordinaire.

```ts type-equiv
/** Why automatic policy is asking a backend to consider compaction. */
type CompactionTrigger = 'pressure' | 'context-overflow'
```

`CompactionEngine` expose `compactIfNeeded(agent, trigger, signal)` pour une politique automatique déclenchée par `pressure` ou `context-overflow`, `compactNow(agent, signal)` pour une réduction utile d’une session inactive, même sous le seuil de pression, et `compactRegion(...)` pour une plage inclusive explicite de la surface. `compactNow()` s’exécute comme une opération de maintenance entre les tours. Elle renvoie `null` sans écrire lorsqu’aucune plage utile n’existe, enregistre une paire autonome `turn: null` avant la synthèse et vide la tentative fermée vers le stockage avant que les invites mises en file puissent dériver une nouvelle surface. Chaque backend crée la source de son remplacement `user/message` avec `compactCheckpointSource(compactionId, sourceCommandId?)`. Les clients et consommateurs filaires importent ce constructeur, `CompactionCheckpointSource` et `isCompactCheckpointSource()` depuis le sous-chemin sans dépendance Cordis `lasmex-compaction/checkpoint`, tandis que la racine du package les réexporte pour les consommateurs hôtes. L’identité de transaction obligatoire corrèle le point de remplacement ; le prédicat permet de le reconnaître indépendamment du backend. Les implémentations doivent transmettre le signal fourni à la synthèse. Le seam ne possède aucune API de calcul de coût : le singleton [`ctx.tokenMeter`](token-meter.md) possède directement l’estimation et le rejeu, tandis que `lasmex-compaction-basic` possède la conservation, l’ordre des événements, les appels de synthèse routés et leur configuration.

Les échecs manuels attendus utilisent `ManualCompactionErrorCode` :

```ts type-equiv
/** Expected failure classes for an explicit idle-session compaction request. */
type ManualCompactionErrorCode =
  | 'busy'
  | 'cancelled'
  | 'changed'
  | 'summary'
  | 'commit'
  | 'persistence'
```

`changed` et `summary` laissent la surface de conversation inchangée, mais ferment et persistent tout de même la tentative en échec dans le journal. `commit` peut suivre une modification partielle. `persistence` signifie que la paire a été fermée en mémoire, mais que son vidage a échoué. L’annulation reste distincte et lève son motif exact après le nettoyage obligatoire.

La compaction due à la pression s’exécute sur `agent/pre-step` en mode série avant la dérivation de la requête. Dès que la pression ou le dépassement canonique est confirmé, compaction-basic invoque le service facultatif [`ctx.toolResultPruner`](../../packages/compaction/compaction-tool-result-pruner/README.md) avant la sélection de la plage, mesure de nouveau avec `ctx.tokenMeter` et peut faire progresser la surface sans résumé. La récupération d’une requête échouée s’exécute par `agent/request-error` après la fermeture de l’étape en échec. Elle ne renvoie une action de nouvelle tentative que lorsque la génération de remplacement de la surface progresse, même si la synthèse ultérieure échoue après l’élagage ; l’annulation reste prioritaire. Les limites d’une région préservent les paires appel/résultat d’outil, mais pas les tours entiers, ce qui permet de compacter les premières étapes fermées d’un tour trop volumineux. `lasmex-compaction-basic` possède les seuils, la politique de conservation de fin, les limites de dépassement et la gestion des échecs.

La définition de service exporte `toolPairingBalancedBefore(session, seq)` et `toolPairingBalancedAfter(session, seq)` pour vérifier les paires appel/résultat d’outil avant et après un numéro de séquence. Ces deux fonctions valident l’appartenance à la surface courante et rejettent les numéros absents ainsi que les résultats orphelins. Le [contrat du package](../../packages/compaction/compaction/README.md#tool-pairing-boundaries) définit leur comportement de cache.

## Résultats de l’élagage des outils

Le service facultatif d’élagage des résultats d’outils signale chaque remplacement durable du contenu et la réduction agrégée en points de code Unicode. Ses types de résultats publics se trouvent dans [`compaction-tool-result-pruner/src/types.ts`](../../packages/compaction/compaction-tool-result-pruner/src/types.ts).

```ts type-equiv
/** Cited source event and size accounting for one landed surface replacement. */
interface PrunedEntry {
  /** Full-fidelity tool-result event shadowed by the replacement. */
  readonly originalSeq: number
  /** Newly appended pruned tool-result event. */
  readonly replacementSeq: number
  /** Tool call shared by the original and replacement. */
  readonly callId: CallId
  /** Original text size in Unicode code points. */
  readonly charsBefore: number
  /** Replacement text size in Unicode code points. */
  readonly charsAfter: number
}
```

```ts type-equiv
/** Aggregate outcome of one stable-surface pruning pass. */
interface PruneResult {
  /** Replacements in the snapshotted surface order. */
  readonly pruned: readonly PrunedEntry[]
  /** Total Unicode code points removed across replacements. */
  readonly charsRemoved: number
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Générée depuis les sources par `scripts/gen-cordis-catalog.ts` (sa fraîcheur est vérifiée par `pnpm run verify-cordis-catalog` dans doc-sync ; régénérez-la avec `pnpm run gen-cordis-catalog`) — cette section est identique octet pour octet dans les deux langues de la page. Les blocs de signature utilisent une clôture `ts cordis-catalog` et conservent la JSDoc source d’origine. Les modes de répartition sont définis dans le [guide d’introduction](../cordis-primer.md#dispatch-modes), et l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcompaction--compactionengine-abstract-seam"></a>

### `ctx.compaction` — `CompactionEngine` (seam abstrait)

Service abstrait de compaction. Les implémentations possèdent la politique de déclenchement, la conservation et la synthèse ; elles peuvent consommer un service de mesure distinct. Une exécution réussie remplace la plage sélectionnée de la surface par un nœud de résumé et empêche deux compactions simultanées de la même session. Le message utilisateur de remplacement emploie compactCheckpointSource avec l’identité de transaction, afin que les consommateurs puissent le reconnaître et le corréler indépendamment du backend. Chargez une seule implémentation par contexte sous `ctx.compaction`.

```ts cordis-catalog
/**
 * Consider automatic compaction for one explicit trigger. Pressure policy
 * uses the latest durable routed request, while context-overflow policy may
 * force a useful balanced reduction even below the normal threshold. Return
 * `null` when no safe range can be compacted. A single oversized retained
 * unit or request envelope cannot be repaired through surface compaction.
 *
 * @param agent - agent context owning the session surface and routing options.
 * @param trigger - normal pressure or provider-confirmed context overflow.
 * @param signal - cancellation signal; model-backed implementations must forward it.
 * @returns the compaction result, or `null` if no compaction was needed.
 */
abstract compactIfNeeded( agent: CompactionAgentContext, trigger: CompactionTrigger, signal: AbortSignal, ): Promise<CompactionResult | null>

/**
 * Explicitly compact useful history even below automatic pressure thresholds.
 * Implementations synchronously start an idle task before any asynchronous
 * work, select a useful range without writing on a no-op, then
 * append a standalone `compaction/start` before summarization. That durable
 * marker is the compaction lock until one `compaction/end` attempt. Later waking
 * prompts remain accepted in FIFO order and start only after the optional
 * durability checkpoint and idle-task settlement. Context injected while the
 * summary runs may sit between the marker pair; only the selected span must
 * remain stable.
 *
 * @param agent - idle agent whose durable history should be compacted.
 * @param signal - cancellation scoped to this compaction request.
 * @param sourceCommandId - initiating command identity for a manual compaction.
 * @returns the compaction result, or `null` when no safe useful range exists.
 * @throws {@link ManualCompactionError} for expected busy, agent-cancellation,
 * changed-span, summarization/shrink, commit-stage, or persistence failures;
 * an aborted request preserves its exact abort reason. Failed attempts remain
 * visible in the log.
 */
abstract compactNow( agent: ManualCompactAgentContext, signal: AbortSignal, sourceCommandId?: CommandId, ): Promise<CompactionResult | null>

/**
 * Forcibly compact a range of surface nodes into a single summary node.
 * `start` and `end` name an inclusive span by surface position, not numeric seq
 * order; replacements can make visible seqs non-monotonic. Both edges must be
 * balanced so assistant tool calls remain paired with their results. A model-
 * backed implementation forwards cancellation and rejects active, missing,
 * reversed, or unbalanced ranges. The target session is `agent.session`.
 * Its replacement user message must use {@link compactCheckpointSource} with
 * the transaction's `CompactionId`.
 * Use {@link toolPairingBalancedBefore} and {@link toolPairingBalancedAfter}
 * for the edge checks.
 *
 * @param start - first surface seq, inclusive.
 * @param end - last surface seq, inclusive.
 * @param agent - context whose session is mutated and whose routing options guide summarization.
 * @param signal - optional cancellation; model-backed implementations must forward it.
 * @throws when compaction is active or the range is missing, reversed, or unbalanced.
 * @returns the appended event seqs, summary, replaced range, and token accounting.
 */
abstract compactRegion( start: number, end: number, agent: CompactionAgentContext, signal?: AbortSignal, ): Promise<CompactionResult>
```

Types : [CommandId](commands.md)

Source : [`packages/compaction/compaction/src/index.ts:96`](../../packages/compaction/compaction/src/index.ts)

<a id="ctxtoolresultpruner--toolresultpruner"></a>

### `ctx.toolResultPruner` — `ToolResultPruner`

Élagage déterministe du début, du milieu et de la fin des nœuds de résultats d’outils présents sur la surface courante.

```ts cordis-catalog
/**
 * Measure text content in Unicode code points; non-text blocks cost zero.
 * @param blocks - tool-result content to measure.
 * @returns total Unicode code points across text blocks.
 */
measureContent(blocks: readonly ContentBlock[]): number

/**
 * Replace an over-budget text middle while retaining rich-block order.
 * Text slicing is by Unicode code point, not UTF-16 code unit, so a retained
 * boundary cannot split a surrogate pair. Grapheme clusters may still split.
 * @param blocks - original tool-result content.
 * @returns pruned content, or `null` when the text is within budget.
 */
pruneContent(blocks: readonly ContentBlock[]): ContentBlock[] | null

/**
 * Prune every over-budget tool result from one stable current-surface snapshot.
 * Each replacement preserves the complete event data except for `content`,
 * cites the shadowed node so replay can recover the replacement input, and is
 * immediately preceded by a `compaction/prune` shadow-price event pricing the
 * shadowed node through the injected token meter, so pure consumers can
 * subtract it without per-node state.
 * @param session - session whose current surface is rewritten.
 * @returns landed replacements and aggregate Unicode-code-point savings.
 * @throws when the session rejects a replacement; replacements committed
 * earlier in the pass remain durable.
 */
pruneSession(session: Session): PruneResult
```

Types : [ContentBlock](llm-streaming.md) · [Session](session.md)

Source : [`packages/compaction/compaction-tool-result-pruner/src/index.ts:44`](../../packages/compaction/compaction-tool-result-pruner/src/index.ts)
<!-- END GENERATED cordis-surface -->
