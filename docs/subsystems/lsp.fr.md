# Navigation LSP

Le seam LSP est une [capacité seam](../../.agents/notes/implemented/architecture/2026-07-15-lsp-capability-seam.md) qui expose la navigation sémantique dans le code par un unique service `ctx.lsp`, réparti entre plusieurs packages : Service Definition ([lasmex-lsp](../../packages/lsp/lsp), `ctx.lsp` et le registre de fournisseurs), Service Provider générique ([lasmex-lsp-stdio](../../packages/lsp/lsp-stdio), hôte configuré d’un serveur de langage stdio) et Consumer ([lasmex-tool-lsp](../../packages/lsp/tool-lsp), schéma de l’outil `lsp`). LSP constitue **une capacité facultative unique**, et non une partie de la structure centrale de l’agent loop ; son vocabulaire se trouve donc ici plutôt que dans [core.md](core.md). Remplacer un fournisseur ne change pas la façon dont le modèle demande une navigation.

Source : [`packages/lsp/lsp/src/types.ts`](../../packages/lsp/lsp/src/types.ts)

## Opérations et coordonnées

Le seam et le modèle exposent exactement quatre requêtes sémantiques. L’union est fermée : en ajouter une entraîne une modification vérifiée à la compilation dans le seam, les fournisseurs et l’outil. Les positions et plages utilisent des unités UTF-16 indexées à partir de zéro, conformément au protocole ; l’outil visible du modèle possède la convention de curseur indexée à partir de un et effectue les conversions à l’entrée comme à la sortie.

```ts type-equiv
/**
 * The four semantic queries the seam and model expose. A closed union: adding an operation is a
 * compile-enforced change across the seam, providers, and the tool. Symbols and call hierarchy are
 * not operations here; they need different schemas.
 */
type LspOperation = 'goToDefinition' | 'findReferences' | 'goToImplementation' | 'hover'
```

```ts type-equiv
/** A zero-based UTF-16 cursor coordinate, matching the LSP wire convention. */
interface LspPosition {
  /** Zero-based line. */
  readonly line: number
  /** Zero-based UTF-16 code-unit offset within the line. */
  readonly character: number
}
```

```ts type-equiv
/** A zero-based UTF-16 half-open range `[start, end)`. */
interface LspRange {
  readonly start: LspPosition
  readonly end: LspPosition
}
```

## Requête

Tous les champs sont obligatoires : `workspaceRoot` est fourni par l’appelant, `languageId` provient de l’enregistrement du fournisseur et non de la requête, tandis que les consommateurs possèdent les délais d’expiration et limites de résultats. Aucun champ n’a donc besoin d’une valeur par défaut fournie par l’implémentation et aucune étape `resolve()` n’est nécessaire. Le fournisseur reçoit la requête de l’appelant avec le `languageId` dérivé, qui sert uniquement à synchroniser le document transitoire et ne participe jamais à la sélection.

```ts type-equiv
/**
 * A caller's normalized query. Every field is required: `workspaceRoot` is caller-supplied,
 * `languageId` comes from the provider registration (not here), and consumers own timeouts and
 * result limits — so no field needs implementation defaulting and there is no `resolve()` step.
 */
interface LspQueryRequest {
  /** Which semantic query to run. */
  readonly operation: LspOperation
  /** The source file to query (relative to `workspaceRoot` or absolute; the provider canonicalizes). */
  readonly filePath: string
  /** The zero-based UTF-16 cursor position to query at. */
  readonly position: LspPosition
  /** The workspace root the provider resolves against and indexes; required, never defaulted. */
  readonly workspaceRoot: string
}
```

```ts type-equiv
/**
 * A request as a provider receives it: the caller's {@link LspQueryRequest} plus the `languageId`
 * the seam derived from the provider's extension mapping. The language id only synchronizes the
 * transient document; it does not participate in selection.
 */
interface LspProviderQuery extends LspQueryRequest {
  /** The LSP language id for `filePath`, from this provider's extension mapping. */
  readonly languageId: string
}
```

## Résultat

Une union discriminée FERMÉE : les opérations de navigation sont normalisées en `locations`, et `hover` en contenu ou `null`. Les consommateurs effectuent un `switch` exhaustif sur `kind`, de sorte que l’ajout d’une variante interrompt la compilation jusqu’à sa prise en charge. `findReferences` inclut toujours les déclarations ; le fournisseur l’impose en interne, donc les appelants ne reçoivent aucun indicateur. La variante `locations` contient `resolvedWorkspaceUri`, l’URI `file:` canonique du workspace selon le fournisseur. Un appelant qui relativise les URI de localisation utilise cette coordonnée au lieu d’appliquer les règles de chemin de la plateforme hôte à la racine de requête, qui peut contenir des liens symboliques.

```ts type-equiv
/** One resolved location: a document URI and the range within it. */
interface LspLocation {
  /** The target document URI (`file:` or otherwise), verbatim from the server. */
  readonly uri: string
  /** The range within the target document. */
  readonly range: LspRange
}
```

```ts type-equiv
/** Normalized hover content, or `null` for no hover at the position. */
interface LspHover {
  /** The normalized hover text (markdown or plaintext, provider-joined). */
  readonly contents: string
  /** The range the hover applies to, when the server supplied one. */
  readonly range?: LspRange
}
```

```ts type-equiv
/**
 * The closed result union. Navigation operations (`goToDefinition`, `findReferences`,
 * `goToImplementation`) normalize to `locations`; `hover` normalizes to content or `null`.
 * Consumers `switch` on `kind` to exhaustiveness so a new arm breaks compilation until handled.
 *
 * The `locations` variant carries `resolvedWorkspaceUri`: the provider's canonical `file:` URI for
 * the request's workspace root. A caller that relativizes location URIs MUST use this, not parse the
 * request's possibly symlinked process path with host-platform rules; the execution platform may
 * differ from the caller's.
 */
type LspQueryResult =
  | { readonly kind: 'locations'; readonly locations: readonly LspLocation[]; readonly resolvedWorkspaceUri: string }
  | { readonly kind: 'hover'; readonly hover: LspHover | null }
```

## Fournisseur et service

Un fournisseur possède un `id` stable et marqué, ainsi qu’une table exclusive d’extensions commençant par un point et écrites en minuscules. `registerProvider` réserve atomiquement l’identifiant et chaque extension ; un enregistrement incorrect ou conflictuel ne publie rien, et son disposer libère toutes les réservations. La sélection s’effectue pour chaque requête indépendamment de l’ordre ; l’absence de correspondance lève `LspError` avec le code `LSP_UNAVAILABLE`. Le seam n’expose ni types de protocole, ni contrôles de processus ou de document, ni échappatoire JSON-RPC générique.

```ts type-equiv
/**
 * A language-server backend registered on `ctx.lsp`. Each provider owns a stable {@link
 * LspProviderId} and an extension-to-language-id map (lowercase, leading-dot keys).
 * `findReferences` always includes declarations — the provider enforces this internally; callers
 * get no flag.
 */
interface LspProvider {
  /** Stable provider identity, reserved atomically with the extension mappings. */
  readonly id: LspProviderId
  /** Lowercase leading-dot extension → LSP language id (e.g. `{ '.ts': 'typescript' }`). */
  readonly extensionToLanguage: Readonly<Record<string, string>>
  /**
   * Run one query. The seam has already selected this provider and derived `languageId`.
   * @param request - the resolved provider query (caller request + derived language id).
   * @param signal - optional cancellation; the provider stops its own work when it aborts.
   * @returns the normalized, closed-union result.
   */
  query(request: LspProviderQuery, signal?: AbortSignal): Promise<LspQueryResult>
}
```

```ts type-equiv
/**
 * The LSP capability seam (`ctx.lsp`). Owns provider registration/selection and normalized query
 * execution; exposes exactly the four operations and no protocol escape hatch.
 */
interface LspService {
  /**
   * Register a provider, atomically reserving its id and every normalized extension. Any conflict
   * or invalid input publishes nothing and throws `LspError`; the returned disposer releases all
   * reservations. Disposed with the calling fiber.
   * @param provider - the backend to register.
   * @returns a synchronous disposer releasing the id and all extension reservations.
   */
  registerProvider(provider: LspProvider): () => void
  /**
   * Select a provider by the file's extension and run one query. Selection is per-query and
   * order-independent; no match throws `LspError` `LSP_UNAVAILABLE`.
   * @param request - the normalized query.
   * @param signal - optional cancellation forwarded to the selected provider.
   * @returns the normalized, closed-union result.
   */
  query(request: LspQueryRequest, signal?: AbortSignal): Promise<LspQueryResult>
}
```

`LspProviderId` est l’identifiant marqué du seam (`Branded<'LspProviderId'>` provenant de [lasmex-brand](../../packages/util/brand)) ; `LspError` étend `HarnessError` avec des codes stables comme `LSP_INVALID_PROVIDER`, `LSP_CONFLICT`, `LSP_UNAVAILABLE`, `LSP_DISPOSED`, `LSP_UNSUPPORTED_OPERATION` et `LSP_MALFORMED_RESPONSE`. Les appelants se servent de ces codes pour le routage au lieu d’analyser `message`.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Cette section est générée depuis le code source par `scripts/gen-cordis-catalog.ts` ; `pnpm run verify-cordis-catalog` vérifie sa fraîcheur dans doc-sync et `pnpm run gen-cordis-catalog` la régénère. Les blocs de signatures utilisent une fence `ts cordis-catalog` et conservent le JSDoc original. Les modes de distribution sont définis dans le [primer](../cordis-primer.md#dispatch-modes), tandis que l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxlsp--lspservice"></a>

### `ctx.lsp` — `LspService`

Le seam de capacité LSP (`ctx.lsp`). Il possède l’enregistrement et la sélection des fournisseurs ainsi que l’exécution normalisée des requêtes ; il expose exactement les quatre opérations sans échappatoire vers le protocole.

```ts cordis-catalog
/**
 * Register a provider, atomically reserving its id and every normalized extension. Any conflict
 * or invalid input publishes nothing and throws `LspError`; the returned disposer releases all
 * reservations. Disposed with the calling fiber.
 * @param provider - the backend to register.
 * @returns a synchronous disposer releasing the id and all extension reservations.
 */
registerProvider(provider: LspProvider): () => void

/**
 * Select a provider by the file's extension and run one query. Selection is per-query and
 * order-independent; no match throws `LspError` `LSP_UNAVAILABLE`.
 * @param request - the normalized query.
 * @param signal - optional cancellation forwarded to the selected provider.
 * @returns the normalized, closed-union result.
 */
query(request: LspQueryRequest, signal?: AbortSignal): Promise<LspQueryResult>
```

Source : [`packages/lsp/lsp/src/types.ts:113`](../../packages/lsp/lsp/src/types.ts)
<!-- END GENERATED cordis-surface -->
