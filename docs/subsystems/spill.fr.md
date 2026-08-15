# Stockage des résultats externalisés

Le stockage des résultats externalisés est un [seam de fonctionnalité](../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.md) qui persiste le texte trop volumineux produit par un outil, puis renvoie au modèle un emplacement et des consignes de récupération. Il se répartit entre trois packages : la définition du service ([lasmex-spill](../../packages/spill/spill), `ctx.spillStore`), son fournisseur ([lasmex-spill-local](../../packages/spill/spill-local), fichiers privés limités à une session sur le système de fichiers hôte) et son consommateur ([lasmex-spill-policy](../../packages/spill/spill-policy), politique `tools/post-execute`). L’externalisation est **une fonctionnalité facultative**, distincte du cœur de la boucle d’agent. Son vocabulaire se trouve donc ici plutôt que dans [core.md](core.md). Les mécanismes d’aperçu appartiennent à [lasmex-output-retention](../../packages/util/output-retention) ; ce seam enregistre uniquement le texte final que lui transmet la politique.

Source : [`packages/spill/spill/src/types.ts`](../../packages/spill/spill/src/types.ts)

## La demande d’enregistrement

`saveText` est l’unique opération du service : elle persiste `content` à l’identique, puis renvoie un emplacement opaque, une consigne de récupération fournie par le backend et le nombre exact d’octets. La demande contient l’espace de stockage au moment de l’enregistrement (`owner`), l’outil et l’appel qui ont produit le contenu (`source`, utilisé pour nommer et inspecter le fichier, pas pour contrôler l’accès), ainsi qu’un `suggestedName` que le backend peut employer comme indication de nommage. Ce dernier n’est pas un chemin.

```ts type-equiv
/** One request to persist text to a spill artifact. */
interface SaveTextSpill {
  owner: SpillOwner
  source: SpillSource
  /**
   * A caller-suggested base name (e.g. `web_fetch.txt`). The backend sanitizes
   * it to a single safe path segment before use — it is a hint, never a path.
   */
  suggestedName: string
  /** The full text to persist (UTF-8). */
  content: string
}
```

```ts type-equiv
/**
 * Save-time storage namespace for a spilled artifact. The session id lets a
 * backend group storage under the producing session, but the returned
 * {@link SpillLocator} is the model-facing handle. Forked sessions inherit
 * locators already present in the seeded log; those artifacts are not copied or
 * re-owned, and spills produced after the fork use the child session id.
 */
interface SpillOwner {
  sessionId: SessionId
}
```

`SpillOwner.sessionId` est l’espace de stockage utilisé au moment de l’enregistrement. Les sessions dérivées héritent des emplacements déjà présents dans le journal initial. Les fichiers correspondants ne sont ni copiés ni réattribués, et les externalisations produites après la dérivation utilisent l’identifiant de la session enfant. Un nettoyage fondé sur la durée de conservation peut faire expirer d’anciens emplacements avec les autres fichiers de sessions anciennes ; le seam d’externalisation ne définit aucune politique de nettoyage par session.

```ts type-equiv
/**
 * Tool and call that produced one spilled artifact — recorded by the backend for a readable
 * filename and inspection. Not interpreted for access control; purely
 * descriptive.
 */
interface SpillSource {
  /** The tool whose result was spilled (e.g. `web_fetch`). */
  toolName: string
  /** The model-issued call id the result belongs to. */
  callId: CallId
  /** A short human label for the artifact (e.g. `result`). */
  label: string
}
```

## Le résultat

```ts type-equiv
/** A saved spill artifact: its locator, byte length, and backend-specific retrieval guidance. */
interface SpillRef {
  locator: SpillLocator
  bytes: number
  retrievalHint: string
}
```

`SpillLocator` est un identifiant [marqué](core.md#branded-ids) destiné au modèle et renvoyé par le backend. Le backend local le représente par un chemin de fichier ; un backend distant ou fondé sur une base de données peut utiliser une URI, une clé ou un jeton de commande. Les consommateurs le traitent comme une valeur opaque et l’affichent avec `retrievalHint`, sans supposer que `read` est toujours le mécanisme de récupération approprié.

```ts type-equiv
/**
 * Opaque model-facing handle for one spilled artifact. A local backend may use a
 * filesystem path; a remote or database backend may use a URI or key. Consumers
 * render it with {@link SpillRef.retrievalHint}, but do not parse it.
 */
type SpillLocator = Branded<'SpillLocator'>
```

## Le service

`SpillStore` (`ctx.spillStore`, défini dans [`packages/spill/spill/src/index.ts`](../../packages/spill/spill/src/index.ts)) est un service abstrait doté d’une seule méthode : `saveText(input) → Promise<SpillRef>`. Il persiste la totalité de `content` et REJETTE la promesse en cas d’échec réel du stockage (droits, ENOSPC, backend indisponible). Le seam gère uniquement le stockage : il ne définit ni politique de conservation, ni remplacement du résultat d’un outil, ni API de récupération ou de recherche.

Le backend local ([lasmex-spill-local](../../packages/spill/spill-local)) écrit sous `<root>/session-<hash>/<random>-<safeName>` : une racine privée (0700), configurée ou créée à la demande ; un sous-répertoire de session nommé avec `sha256(sessionId)` ; puis une écriture exclusive réservée au propriétaire (`open(path, 'wx', 0o600)`), afin qu’un lien symbolique préparé à l’avance ne puisse pas la rediriger. Son `locator` est le chemin local et son `retrievalHint` demande au modèle d’utiliser `read` ou `grep` sur ce chemin. Le consommateur de politique ([lasmex-spill-policy](../../packages/spill/spill-policy)) remplace un résultat final en texte brut qui dépasse `maxInlineBytes` par un aperçu du début et de la fin produit par la bibliothèque de conservation, accompagné de la référence externe. Cette opération reste au mieux : si l’enregistrement échoue, le résultat en ligne d’origine est conservé et un appel réussi ne devient pas `isError`.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Générée depuis les sources par `scripts/gen-cordis-catalog.ts` (sa fraîcheur est vérifiée par `pnpm run verify-cordis-catalog` dans doc-sync ; régénérez-la avec `pnpm run gen-cordis-catalog`) — cette section est identique octet pour octet dans les deux langues de la page. Les blocs de signature utilisent une clôture `ts cordis-catalog` et conservent la JSDoc source d’origine. Les modes de répartition sont définis dans le [guide d’introduction](../cordis-primer.md#dispatch-modes), et l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxspillstore--spillstore-abstract-seam"></a>

### `ctx.spillStore` — `SpillStore` (seam abstrait)

Service abstrait de stockage des résultats externalisés. Créez une sous-classe, implémentez saveText et chargez-la comme plugin : elle s’enregistre sous `ctx.spillStore`. Un contexte n’accepte qu’une implémentation ; en charger une seconde déclenche l’erreur Cordis habituelle de service en double.

Chaque implémentation doit respecter la sémantique suivante :

- saveText persiste la totalité de `content` à l’identique et renvoie un emplacement opaque, le nombre exact d’octets et des consignes de récupération destinées au modèle.
- Le stockage est limité à la session indiquée par SaveTextSpill.owner. Le backend choisit un emplacement privé, non lisible par tous, et un nom sans collision dérivé du `suggestedName` de l’appelant, mais jamais identique à celui-ci.
- `saveText` REJETTE la promesse en cas d’échec réel du stockage (droits, ENOSPC, backend indisponible). L’appelant choisit le mode dégradé ; la politique d’externalisation traite ce rejet au mieux et conserve le résultat en ligne.

```ts cordis-catalog
/**
 * Persist `input.content` to a session-scoped spill artifact.
 * @param input - the owner, caller-supplied source fields, suggested name, and full text to save.
 * @returns the saved artifact's {@link SpillRef}; rejects on a storage failure.
 */
abstract saveText(input: SaveTextSpill): Promise<SpillRef>
```

Source : [`packages/spill/spill/src/index.ts:45`](../../packages/spill/spill/src/index.ts)
<!-- END GENERATED cordis-surface -->
