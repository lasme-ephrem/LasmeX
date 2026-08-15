# Accès au Web

La capacité d’accès au Web — une [capacité complète](../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md) qui regroupe **deux opérations**, recherche et récupération, dans un même service `ctx.web` — est répartie entre plusieurs packages : définition du service ([lasmex-web](../../packages/web/web), qui fournit `ctx.web` et les registres de fournisseurs), fournisseurs du service ([lasmex-web-search-exa](../../packages/web/web-search-exa), [lasmex-web-search-perplexity](../../packages/web/web-search-perplexity), [lasmex-web-search-deepseek](../../packages/web/web-search-deepseek), [lasmex-web-fetch-http](../../packages/web/web-fetch-http)) et consommateur ([lasmex-tool-web](../../packages/web/tool-web), qui définit les schémas des outils `web_search`/`web_fetch`). Le Web est **une capacité facultative** et non un élément central de la boucle d’agent ; son vocabulaire est donc décrit ici plutôt que dans [core.md](core.md). Remplacer le fournisseur de recherche ne change pas la manière dont le modèle formule une requête, et remplacer le fournisseur de récupération ne change pas la manière dont il demande une URL.

Source : [`packages/web/web/src/types.ts`](../../packages/web/web/src/types.ts)

## Pourquoi une capacité regroupe deux opérations

La recherche et la récupération ne partagent ni schéma de requête ni logique métier, mais forment délibérément une seule couche intermédiaire `ctx.web` : une même autorité gère la sélection des fournisseurs, le vocabulaire des annulations et des erreurs, ainsi que l’API de configuration qui décrit au produit comment le harness accède au Web. Cette organisation impose au service des paires parallèles de méthodes `searchX`/`fetchX`; ce parallélisme est intentionnel. Les fournisseurs enregistrent des **capacités** — un `WebSearchProvider` ou un `WebFetchProvider` — et non des outils. Les noms exposés au modèle, les schémas, les indications du prompt et la présentation appartiennent tous au consommateur unique `lasmex-tool-web`.

## Requête et résultat de recherche

L’argument de l’outil exposé au modèle se limite à `query`. La borne `maxResults` appartient au consommateur — `lasmex-tool-web`, par sa configuration `searchMaxResults` qui vaut `8` par défaut —, qui la transmet à la capacité ; celle-ci l’applique aussi au retour. Si un fournisseur renvoie trop de résultats, la capacité tronque `sources[]` et active `truncated`.

```ts type-equiv
/**
 * What one search-capable backend can return. The model-facing argument is just
 * a query; `maxResults` is a `lasmex-tool-web`-layer bound passed through unchanged
 * and enforced on the way back by the seam (see {@link WebSearchResult}).
 */
interface WebSearchRequest {
  readonly query: string
  /**
   * Upper bound on returned sources; the seam truncates to it. Omitted = no
   * bound. `lasmex-tool-web` always sets it. A provider whose API supports a
   * result-count control (Exa's `numResults`) should apply it at the request
   * layer as a cost/latency optimization; the seam enforces the bound
   * regardless.
   */
  readonly maxResults?: number
}
```

```ts type-equiv
/**
 * Normalized search outcome. `content` is optional provider-generated answer
 * text or summary (Exa and DeepSeek return none; Perplexity returns a
 * generated answer).
 * `sources[]` is the portable citation shape. `truncated` is set by the seam
 * when it cut `sources[]` down to `maxResults`.
 */
interface WebSearchResult {
  /** Optional provider-generated answer text, search context, or summary. */
  readonly content?: string
  /** Citeable sources, already truncated to the request's `maxResults`. */
  readonly sources: readonly WebSearchSource[]
  /** True when the seam dropped sources to honor `maxResults`. */
  readonly truncated: boolean
}
```

```ts type-equiv
/**
 * One citeable source. A source always has a URL; `title`, `snippet`, and
 * `publishedAt` are optional because not every provider returns them — forcing
 * adapters to invent them would make the seam lie (Perplexity citations may be
 * URL-only). `lasmex-tool-web` renders `title ?? hostname(url)` for display.
 */
interface WebSearchSource {
  readonly url: string
  readonly title?: string
  readonly snippet?: string
  /** Publication/crawl timestamp as a provider-supplied ISO-8601 string. */
  readonly publishedAt?: string
}
```

## Requête et résultat de récupération

```ts type-equiv
/**
 * What one fetch-capable backend is asked to retrieve. The request deliberately
 * omits timeout, format, prompt, and extraction controls: cancellation is a
 * direct execution argument, while presentation and higher-level LLM concerns
 * belong outside safe retrieval.
 */
interface WebFetchRequest {
  readonly url: string
}
```

Le statut HTTP fait partie de l’état de la ressource récupérée et ne constitue pas automatiquement une défaillance : une requête réseau réussie qui reçoit un `404`/`500` renvoie un `WebFetchResult` contenant le code de statut et un corps décodé de taille bornée. `url` contient l’URL finale après les redirections autorisées. `WebError` est réservé aux défaillances qui empêchent de récupérer ou de représenter la ressource en toute sécurité.

```ts type-equiv
/**
 * Normalized fetch outcome. A successful network fetch of a non-2xx response is
 * a result, not an error: the status code is part of the fetched resource
 * state. {@link WebError} is reserved for failures to safely retrieve or
 * represent the resource.
 */
interface WebFetchResult {
  /** The final URL after allowed redirects (the request URL is in the request). */
  readonly url: string
  /** HTTP status code of the fetched response. */
  readonly statusCode: number
  /** Decoded body, classified by content kind. */
  readonly body: WebFetchBody
  /** True when the provider capped the decoded body. */
  readonly truncated: boolean
}
```

```ts type-equiv
/**
 * The decoded body of a fetched resource. A CLOSED discriminated union owned by
 * `lasmex-web`: the provider decodes the kind and `lasmex-tool-web` renders it, so a
 * new kind is a coordinated change across known packages, not a plugin
 * extension. Consumers `switch` on `kind` ending in `default: assertNever(...)`
 * so adding a kind breaks compilation at every consumer until handled. Each arm
 * stays its own object literal even where fields coincide, so an arm can gain
 * fields the others lack.
 */
type WebFetchBody =
  | { readonly kind: 'html'; readonly content: string }
  | { readonly kind: 'text'; readonly content: string }
```

## Disponibilité des fournisseurs

La méthode `available(): boolean` d’un fournisseur effectue un contrôle LOCAL et peu coûteux, par exemple la présence des identifiants ou la validité syntaxique de la configuration, et **ne doit effectuer aucun appel réseau**. Elle participe à la sélection au moment de l’exécution, mais ne constitue pas un système de supervision. `search()`/`fetch()` la consultent afin de choisir un fournisseur utilisable ; tout échec de sélection devient une `WebError` structurée sur laquelle l’appelant peut effectuer un branchement, avec dans son code et son message le détail pertinent, tel que l’identifiant absent ou l’ensemble ambigu de candidats.

La sélection ne dépend jamais de l’ordre d’enregistrement, de configuration ou de rechargement à chaud. Une capacité reçoit un identifiant de fournisseur explicite — configuration `searchProvider`/`fetchProvider`, ou variable d’environnement correspondante qui alimente le même champ —, ou effectue une sélection automatique lorsqu’un seul fournisseur utilisable est enregistré. Plusieurs fournisseurs utilisables sans identifiant configuré produisent `WEB_PROVIDER_AMBIGUOUS`; le premier enregistré n’est pas choisi arbitrairement.

## Erreurs

`WebError extends HarnessError` — voir la taxonomie des erreurs dans [core.md](core.md) — avec un `code: string` ouvert, comme les erreurs des autres capacités (`LlmError`, `SubagentError`), et non une union fermée. Un fournisseur peut définir ses propres codes sans modifier `lasmex-web`, et les consommateurs doivent accepter un code inconnu. Les codes se répartissent selon leur propriétaire. Le fonctionnement partagé de `WebRuntime` produit les codes indépendants des capacités : `WEB_PROVIDER_UNAVAILABLE`, `WEB_PROVIDER_CONFIGURED_MISSING`, `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`, `WEB_PROVIDER_AMBIGUOUS`, `WEB_DUPLICATE_PROVIDER` — erreur de programmation au moment de l’enregistrement, équivalente dans `LlmRuntime` à `DUPLICATE_ADAPTER` —, `WEB_ABORTED` et `WEB_PROVIDER_ERROR`, ce dernier regroupant les défaillances propres au fournisseur exposées par la capacité, y compris les erreurs réseau ou de transport telles qu’un échec DNS, un refus de connexion ou TLS. L’implémentation `lasmex-web-fetch-http` possède les codes de transport de récupération suivants, qu’un autre moteur de récupération n’est pas tenu de produire : `WEB_INVALID_URL`, `WEB_BLOCKED_URL`, `WEB_REDIRECT_BLOCKED`, `WEB_FETCH_TOO_LARGE`, `WEB_FETCH_TIMEOUT`, `WEB_UNSUPPORTED_CONTENT_TYPE`.

## Service

`WebRuntime` enregistre les fournisseurs de recherche et de récupération, rejette les identifiants dupliqués avec `WEB_DUPLICATE_PROVIDER` et résout les fournisseurs au moment de l’exécution au moyen d’erreurs de sélection structurées. Le moteur local de récupération n’accepte que HTTP(S), rejette les informations d’authentification, borne le nombre de redirections, les octets, les caractères et la durée, revalide chaque étape de redirection de même origine et décode le corps ; l’outil gère la présentation. Ce moteur ne bloque pas les cibles du réseau privé : n’activez pas `web_fetch` s’il peut atteindre des services internes sensibles.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxweb--webruntime"></a>

### `ctx.web` — `WebRuntime`

The web access service. Registered as `ctx.web` (one instance per context).

Selection semantics (resolved at execution time, never order-dependent):

- A configured id that is registered and `available()` → that provider.
- A configured id not registered → `WEB_PROVIDER_CONFIGURED_MISSING`.
- A configured id registered but unavailable → `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`.
- No id configured, exactly one registered usable provider → that provider.
- No id configured, multiple usable providers → `WEB_PROVIDER_AMBIGUOUS`.
- No id configured, no usable provider → `WEB_PROVIDER_UNAVAILABLE`.

```ts cordis-catalog
/**
 * Register a search provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
 * if its id is already registered for search. Returns a disposer; disposed
 * with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerSearchProvider(provider: WebSearchProvider): () => void

/**
 * Register a fetch provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
 * if its id is already registered for fetch. Returns a disposer; disposed
 * with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerFetchProvider(provider: WebFetchProvider): () => void

/**
 * Run one search through the selected provider. Resolves the provider at call
 * time with the selection rules above; throws {@link WebError} when the
 * capability cannot run. The seam enforces `request.maxResults` on the result:
 * if the provider over-returns, `sources[]` is truncated and `truncated` set.
 * @param request - the query and optional result limit.
 * @param signal - optional cancellation signal forwarded to the provider.
 * @returns the provider's results, capped to `request.maxResults`.
 */
async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>

/**
 * Retrieve one URL through the selected provider. Resolves the provider at
 * call time with the selection rules above; throws {@link WebError} when the
 * capability cannot run. A non-2xx response is a result, not a throw.
 * @param request - the URL plus retrieval options.
 * @param signal - optional cancellation signal forwarded to the provider.
 * @returns the retrieval outcome; non-2xx responses resolve descriptively.
 */
async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>
```

Source: [`packages/web/web/src/index.ts:74`](../../packages/web/web/src/index.ts)
<!-- END GENERATED cordis-surface -->
