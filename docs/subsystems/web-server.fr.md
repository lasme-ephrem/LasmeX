# Serveur HTTP

[lasmex-host-webserver](../../packages/host/webserver) est le transport HTTP du navigateur pour l’hôte de l’interface graphique : un unique plugin `node:http` qui fournit `ctx.webServer`, un registre de routes nommées, des callbacks de transformation de index.html et un gestionnaire de repli qu’un plugin peut revendiquer. Il ne fait pas partie de l’agent loop et ne constitue pas une capacité seam ; il ne connaît aucun concept du harness. Un autre plugin enregistre chaque route fonctionnelle, notamment le pont `/api`, les bundles de plugins et le flux d’événements HMR ([note sur les couches](../../.agents/notes/implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md)). Il sert uniquement les navigateurs : Electron charge les fichiers compilés par `file://` et transmet les requêtes fetch par un pont IPC au lieu d’utiliser ce serveur.

Source : [`packages/host/webserver/src/index.ts`](../../packages/host/webserver/src/index.ts)

## Routes

```ts type-equiv
/** Route match kind: 'exact' matches the pathname verbatim; 'prefix' p matches p and p/<anything>. */
type WebRouteKind = 'exact' | 'prefix'
```

```ts type-equiv
/** One named route registration. */
interface WebRoute {
  kind: WebRouteKind
  /** Absolute pathname, no trailing slash. */
  path: string
  /** Owns the full response lifecycle (may hold the response open, e.g. SSE). */
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}
```

L’ordre de correspondance est fixe : la table exacte d’abord, puis le préfixe correspondant le plus long, puis le gestionnaire de repli enregistré. L’ordre d’enregistrement n’a aucune incidence visible pour les requêtes : les routes nommées sont composées pour être disjointes, et le gestionnaire de repli répond à toute requête qu’aucune route nommée ne revendique. Ce rôle n’accepte qu’un seul propriétaire et un second enregistrement lève une erreur. La composition Web livrée le revendique avec [`lasmex-host-frontend-static`](../../packages/host/frontend-static/src/index.ts), le serveur de distribution de la SPA aux règles verrouillées : toute méthode autre que GET/HEAD reçoit 405, toute traversée hors de la racine de distribution reçoit 403, chaque ressource absente se replie sur `index.html` avec HTTP 200 pour le routage SPA, et les extensions inconnues sont servies sous la forme octet-stream.

## Configuration

```ts type-equiv
/** Gateway config: the listen address. */
interface Config {
  /** Listen host; the two supported values are loopback and all-interfaces. */
  host: '127.0.0.1' | '0.0.0.0'
  /** Listen port; zero requests an OS-assigned port. */
  port: number
}
```

`host` accepte uniquement `127.0.0.1` — la posture par défaut — et `0.0.0.0`, qui expose volontairement le serveur au réseau. Comme il n’existe ni TLS, ni authentification, ni politique d’origine, une écoute hors loopback expose le serveur à ce réseau. L’emplacement de la distribution relève de l’assemblage du plugin frontend qui revendique le rôle de repli.

## Le service

`WebServer` (`ctx.webServer`) commence immédiatement à écouter lors de son activation. Un échec d’écoute, tel que EADDRINUSE, rejette l’initialisation et le processus de démarrage signale la fiber en échec. `register(route)` ajoute une route nommée et renvoie son disposer ; un doublon `(kind, path)` lève une erreur, car les motifs de route constituent une règle de composition et une collision indique une mauvaise configuration. `tapIndex(transform)` ajoute une transformation pure de HTML vers HTML, appliquée dans l’ordre d’enregistrement à chaque réponse d’index — `/` comme chaque repli SPA ; [lasmex-client-modules](../../packages/client/modules) l’utilise pour injecter le manifeste de démarrage. `port` renvoie le port d’écoute, y compris celui attribué par le système d’exploitation lorsque `config.port` vaut 0.

Une exception pendant le traitement d’une requête — par exemple un échappement % incorrect reçu par `decodeURIComponent` ou l’abandon du client pendant la lecture du corps — est consignée comme avertissement et reçoit une réponse 400 ; si les en-têtes sont déjà partis, le socket est détruit. Elle ne provoque jamais l’arrêt du processus. La libération associe `close()` à `closeAllConnections()`, car un gestionnaire peut maintenir sa réponse ouverte, comme avec SSE, et de telles connexions ne se terminent pas d’elles-mêmes ; sans fermeture forcée, le teardown resterait bloqué. Le package n’affiche jamais de texte : la ligne d’URL appartient au shell. Les détails opérationnels propres au package, notamment le pipeline d’observation du bundle en mode développement, restent dans son [README](../../packages/host/webserver/README.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Cette section est générée depuis le code source par `scripts/gen-cordis-catalog.ts` ; `pnpm run verify-cordis-catalog` vérifie sa fraîcheur dans doc-sync et `pnpm run gen-cordis-catalog` la régénère. Les blocs de signatures utilisent une fence `ts cordis-catalog` et conservent le JSDoc original. Les modes de distribution sont définis dans le [primer](../cordis-primer.md#dispatch-modes), tandis que l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxwebserver--webserver"></a>

### `ctx.webServer` — `WebServer`

Le service de transport HTTP du navigateur. Son activation lance immédiatement l’écoute. L’ordre d’enregistrement des routes n’influe pas sur les requêtes, car les routes nommées configurées doivent être distinctes ; le gestionnaire de repli répond à toute requête non encore revendiquée pendant le démarrage avec 404 jusqu’à l’enregistrement de son propriétaire. Un échec d’écoute rejette l’initialisation et le processus de démarrage signale la fiber en échec.

```ts cordis-catalog
/**
 * Register a named route. Duplicate (kind, path) throws — route patterns are
 * a composition-level contract, so a collision is a misconfiguration.
 * @param route - kind, path, and the owning handler.
 * @returns the disposer removing the route.
 */
register(route: WebRoute): () => void

/**
 * Register an exact-path HTTP upgrade route. Duplicate paths throw because
 * one socket can have only one protocol owner.
 * @param route - pathname and handler owning negotiation plus socket use.
 * @returns the disposer removing the route.
 */
registerUpgrade(route: WebUpgradeRoute): () => void

/**
 * Claim the fallback seat: the handler answering every request no named
 * route matches (the SPA dist server in the shipped Web composition). One
 * owner only — a second registration throws, because two fallbacks cannot
 * compose.
 * @param handler - owns the full response lifecycle of unmatched requests.
 * @returns the disposer releasing the seat.
 */
registerFallback(handler: WebRoute['handler']): () => void

/**
 * Register an index.html transform, applied by the fallback owner to every
 * index response ({@link applyIndexTaps}) in registration order.
 * @param transform - pure html-to-html function.
 * @returns the disposer removing the transform.
 */
tapIndex(transform: (html: string) => string): () => void

/**
 * Run an index.html body through the registered taps in registration order
 * — called by the fallback owner on every index response it renders.
 * @param html - the raw index.html body.
 * @returns the transformed body.
 */
applyIndexTaps(html: string): string
```

Source : [`packages/host/webserver/src/index.ts:59`](../../packages/host/webserver/src/index.ts)
<!-- END GENERATED cordis-surface -->
