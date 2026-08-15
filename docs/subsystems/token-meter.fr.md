# Mesure des jetons

`lasmex-token-meter` expose un instantané de rejeu détaché qui mesure la pression de la requête et le coût positionnel de la surface. `logRevision` indique le nombre d’événements durables pris en compte par tous les champs de la mesure.

Source : [`packages/llm/token-meter/src/types.ts`](../../packages/llm/token-meter/src/types.ts)

## `TokenMeasurement`

```ts type-equiv
/** Detached immutable request-pressure and surface snapshot at one consumed log revision. */
interface TokenMeasurement {
  /** Number of durable events consumed; equal to the next unread event seq. */
  readonly logRevision: number
  /** Provider or heuristic anchor used for this measurement. */
  readonly baseline: TokenMeasurementBaseline
  /** Signed repricing of current surface content relative to the baseline anchor. */
  readonly surfaceDeltaTokens: number
  /** Non-negative current request-and-response pressure. */
  readonly totalTokens: number
  /** Total heuristic tokens across the current surface. */
  readonly surfaceTokens: number
  /** Current surface nodes in positional head-to-tail order. */
  readonly nodes: readonly TokenSurfaceNode[]
}
```

`baseline.kind === 'usage'` signifie que le dernier appel réussi au fournisseur possède la même enveloppe de requête canonique et que son total n’est pas inférieur à l’estimation heuristique complète de cet appel. La valeur `estimated` signifie qu’aucune mesure d’utilisation prudente ne peut être réemployée ; le service évalue alors l’enveloppe et la surface complètes avec son heuristique fixe. Une requête réussie ultérieure remplace la mesure précédente. La valeur signée `surfaceDeltaTokens` conserve l’augmentation ou la diminution par rapport à une mesure compatible. `totalTokens` représente toujours la pression combinée de la requête et de la réponse, tandis que `surfaceTokens` est l’estimation heuristique de la seule surface et correspond à la somme des coûts des nœuds.

## `TokenSurfaceNode`

```ts type-equiv
/** One token-priced node in the current ordered session surface. */
interface TokenSurfaceNode {
  /** Durable sequence number of the surface event. */
  readonly seq: number
  /** Heuristic tokens for the exact message projected by this node. */
  readonly tokens: number
}
```

L’ordre de la surface fait autorité : les nœuds de remplacement peuvent avoir un numéro de séquence durable supérieur à celui de nœuds placés plus loin. L’instantané est immuable et ne s’agrandit pas lorsque la réduction de rejeu sous-jacente progresse.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Générée depuis les sources par `scripts/gen-cordis-catalog.ts` (sa fraîcheur est vérifiée par `pnpm run verify-cordis-catalog` dans doc-sync ; régénérez-la avec `pnpm run gen-cordis-catalog`) — cette section est identique octet pour octet dans les deux langues de la page. Les blocs de signature utilisent une clôture `ts cordis-catalog` et conservent la JSDoc source d’origine. Les modes de répartition sont définis dans le [guide d’introduction](../cordis-primer.md#dispatch-modes), et l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxtokenmeter--tokenmeter"></a>

### `ctx.tokenMeter` — `TokenMeter`

Propriétaire du rejeu pour un estimateur commun au service et des réductions isolées par session.

```ts cordis-catalog
/**
 * Measure current request pressure and surface through the durable tail.
 *
 * Provider usage is reused only when the latest successful call's canonical
 * request envelope matches `requestHeader` and its total is no lower than
 * that call's full heuristic anchor; otherwise the complete envelope and
 * surface are heuristically repriced.
 *
 * `requestHeader` affects request pressure only; surface fields always
 * describe the current session surface. Every call clones those positional
 * nodes, so measurement is O(surface).
 *
 * @param session - session to replay through its current durable tail.
 * @param requestHeader - optional effective request envelope replacing the latest logged header.
 * @returns a detached deeply immutable pressure and surface measurement.
 */
measure(session: Session, requestHeader?: EpochHeader): TokenMeasurement

/**
 * Heuristically price one model-visible message (instance face of the pure
 * `estimateMessage` export from `estimate.ts`).
 * @param message - message to price without mutation.
 * @returns content and role-framing tokens under the fixed service heuristic.
 */
estimateMessage(message: Message): number
```

Types : [EpochHeader](session.md) · [Message](llm-streaming.md) · [Session](session.md)

Source : [`packages/llm/token-meter/src/index.ts:74`](../../packages/llm/token-meter/src/index.ts)
<!-- END GENERATED cordis-surface -->
