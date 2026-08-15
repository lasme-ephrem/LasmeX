# Modules client

La table des plugins Web est la moitié Node du système de modules client de [lasmex-client-modules](../../packages/client/modules), fournie sous la forme `ctx.clientModules` (`ClientModuleRegistry`). Elle analyse les entrées du Loader hôte pour trouver les packages qui déclarent `lasmex.client`, compose le graphe d’entrées `window.__DSH_BOOT__`, sert chaque bundle à l’adresse `/plugins/<id>/client.js` et intercepte le rendu de l’index pour injecter le manifeste de démarrage. Ce sont les quatre faces d’un même service. Cette fonctionnalité facultative de la pile d’interface Web ne fait pas partie du cœur de la boucle d’agent. Elle consomme [lasmex-host-webserver](../../packages/host/webserver) : le transport décrit dans [web-server.md](web-server.md) fournit la route préfixée et le point d’interception de l’index qu’enregistre ce service. La moitié navigateur du même package (`ctx.modules`, la table de modules en CJS différé qui récupère et matérialise ces bundles) appartient au noyau et est documentée dans le [README du package](../../packages/client/modules/README.md), pas ici.

Source : [`packages/client/modules/src/client/manifest.ts`](../../packages/client/modules/src/client/manifest.ts)

## Le protocole filaire

Le graphe est l’unique source filaire partagée entre les moitiés Node et navigateur. L’hôte compose les lignes `WebBootEntry` à partir des packages analysés, injecte le graphe dans le premier script de `<head>` (`window.__DSH_BOOT__`, avec le caractère `<` échappé afin que des chaînes contrôlées par un plugin ne puissent pas sortir de l’élément script), puis le shell l’analyse avant tout démarrage. Une page sans manifeste valide ne peut pas démarrer : l’analyseur côté navigateur échoue explicitement si le graphe est absent ou mal formé.

```ts type-equiv
/**
 * One composed client entry pushed by the host (a graph row). Wire
 * single source: the host node half (package root) produces this same shape.
 * `immediately` marks stage-one prefetch; `inject` is informational graph
 * metadata (the authoritative edges live in each package's `lasmex.client`
 * declaration and reach fibers through entry creation).
 */
interface WebBootEntry {
  /** Entry name == package name. */
  id: string
  /** Bundle endpoint, '/plugins/<id>/client.js?rev=<rev>'. */
  url: string
  /** Bundle content hash (cache-busting consistency anchor). */
  rev: string
  /** Package-name dependency edges, informational (preflight display / HMR diffing). */
  inject?: string[]
  /** Stage-one prefetch mark: load the script for factory registration during module-face boot. */
  immediately?: boolean
}
```

```ts type-equiv
/** The composed client entry graph the host injects as `window.__DSH_BOOT__`. */
interface WebBootGraph {
  /** Consistency anchor over the whole graph (content + bundle hashes). */
  rev: string
  /** Composed entries; order carries no semantics (activation order is fiber inject waiting). */
  entries: WebBootEntry[]
}
```

La valeur `rev` de chaque ligne est le hachage du contenu du bundle et figure dans l’URL comme paramètre qui invalide le cache. La valeur `rev` du graphe est calculée sur les lignes composées ; toute modification d’une ligne la modifie donc aussi. `immediately` désigne le niveau de préchargement de première étape : le script est récupéré et exécuté au démarrage de la face module, mais seule sa fabrique est enregistrée. Une ligne différée est récupérée lors de son premier import.

## L’analyse

Un package rejoint la table en déclarant `lasmex.client` (`platform: 'web'`, arêtes `inject` et indicateur `immediately` facultatifs) dans son package.json, puis en exportant son bundle construit sous `exports["./client"]`. La résolution du package part de `ctx.baseUrl` dans l’arbre de configuration, c’est-à-dire du répertoire de cordis.yml dont le package déclare chaque plugin composé comme dépendance. La construction échoue si ce point de départ n’est pas défini.

L’analyse est incrémentale et s’effectue package par package ; aucun chemin de code ne réanalyse tout. Chaque émission Cordis `internal/plugin`, lors de la construction ou de la libération d’une fibre, marque le nom de son entrée comme modifié. Une microtâche rapproche ensuite chaque nom modifié des entrées actives du Loader. La phase d’activation place toutes les entrées courantes dans ce même ensemble, puis effectue le rapprochement de manière synchrone. La première analyse et le régime permanent partagent donc une seule implémentation, mais pas la même réaction aux échecs. À l’activation, les déclarations mal formées ou les bundles absents parmi les entrées déjà chargées sont regroupés dans une seule `AggregateError` qui énumère tous les packages défectueux : la fibre ÉCHOUE et l’audit strict du démarrage le signale. En régime permanent, un package défectueux produit un avertissement sans compromettre les autres.

Les métadonnées d’un package, y compris la conclusion négative « ce package n’est pas un package client », sont mises en cache par nom sans expiration. Une modification de l’ensemble des plugins prend effet au redémarrage. Le redémarrage d’une fibre réutilise sa ligne et sa valeur rev sans les modifier ; les changements du contenu du bundle n’atteignent le graphe que par `rebuilt()`.

## La route du bundle et l’interception de l’index

`GET`/`HEAD /plugins/<id>/client.js` sert depuis le disque le bundle enregistré avec `no-cache`. La cohérence repose sur le paramètre rev, pas sur le cache HTTP. Les autres méthodes renvoient 405. Un identifiant inconnu, ou une ligne enregistrée dont le bundle reste illisible parce qu’il n’a pas encore été construit, renvoie explicitement 404 au lieu de laisser le repli SPA du transport servir du HTML comme JavaScript. L’interception de l’index injecte le graphe courant à chaque rendu de l’index ; une actualisation démarre donc toujours avec la composition active.

## Le service

`ClientModuleRegistry` (`ctx.clientModules`, défini dans [`packages/client/modules/src/index.ts`](../../packages/client/modules/src/index.ts)) expose les lectures et l’opération de reconstruction. Les signatures figurent dans le [catalogue de services](#ctxclientmodules--clientmoduleregistry) généré. `graph()` renvoie le graphe composé courant, dont l’objet reste stable entre deux modifications, et `clientPath(id)` le chemin absolu du bundle. `rebuilt(id)` est l’unique point d’entrée par lequel le contenu d’un bundle atteint le graphe : la méthode recalcule le hachage du fichier ; seule une modification réelle de rev recompose le graphe et émet une notification. `onRebuilt` est appelé pour chaque bundle modifié avec sa nouvelle rev. `onGraphChanged` est appelé après chaque rapprochement qui a recomposé le graphe, qu’une ligne ait été ajoutée ou retirée, ou que sa rev ait changé. Il suit un modèle de lecture : les écouteurs relisent `graph()`. Les deux voies de notification confinent les exceptions des écouteurs, afin qu’un abonné défaillant ne puisse ni ignorer les suivants ni interrompre l’opération qui a déclenché le rapprochement.

En développement, [lasmex-client-hmr](../../packages/client/hmr/README.md) pilote la surveillance du registre. Sa moitié Node vérifie périodiquement les métadonnées de fichier de chaque bundle du graphe à partir d’un état initial capturé de manière synchrone, appelle `rebuilt(id)` lors d’une modification, resynchronise l’ensemble surveillé au moyen de `onGraphChanged` et diffuse les nouvelles rev à la moitié navigateur par SSE. Les graphes de production omettent entièrement la ligne HMR ; l’hôte des modules ne surveille lui-même aucun fichier.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Générée depuis les sources par `scripts/gen-cordis-catalog.ts` (sa fraîcheur est vérifiée par `pnpm run verify-cordis-catalog` dans doc-sync ; régénérez-la avec `pnpm run gen-cordis-catalog`) — cette section est identique octet pour octet dans les deux langues de la page. Les blocs de signature utilisent une clôture `ts cordis-catalog` et conservent la JSDoc source d’origine. Les modes de répartition sont définis dans le [guide d’introduction](../cordis-primer.md#dispatch-modes), et l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxclientmodules--clientmoduleregistry"></a>

### `ctx.clientModules` — `ClientModuleRegistry`

Service de table des plugins Web : analyse incrémentale des déclarations `lasmex.client`, composition filaire, route des bundles et interception de l’index. La construction exécute l’analyse d’activation de manière synchrone. Les déclarations mal formées ou les bundles absents parmi les entrées déjà chargées sont regroupés dans une seule exception explicite : la fibre ÉCHOUE et l’audit d’activation du démarrage la signale.

```ts cordis-catalog
/**
 * Current composed entry graph (stable object between changes).
 * @returns the graph served as `window.__DSH_BOOT__`.
 */
graph(): WebBootGraph

/**
 * Absolute path of an entry's client bundle.
 * @param id - entry id (package name).
 * @returns the path, or undefined for an unknown id.
 */
clientPath(id: string): string | undefined

/**
 * Re-hash one bundle (the HMR watch's registration hook — the only entry
 * point through which bundle content changes reach the graph).
 * @param id - entry id (package name).
 * @returns the new rev, or undefined for an unknown id.
 */
rebuilt(id: string): string | undefined

/**
 * Subscribe to bundle rebuilds; fires only when the re-hash changed the rev.
 * @param listener - receives the entry id and its new bundle rev.
 * @returns the unsubscriber.
 */
onRebuilt(listener: (id: string, rev: string) => void): () => void

/**
 * Fires after any flush that recomposed the graph (row added/removed, or a
 * rebuilt rev change). Pull model: listeners re-read {@link graph}.
 * @param listener - notified with no payload.
 * @returns the unsubscriber.
 */
onGraphChanged(listener: () => void): () => void
```

Source : [`packages/client/modules/src/index.ts:194`](../../packages/client/modules/src/index.ts)
<!-- END GENERATED cordis-surface -->
