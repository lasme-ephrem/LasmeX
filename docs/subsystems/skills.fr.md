# Skills

La [famille de fonctionnalités des skills](../../packages/skill) comprend la définition de service ([lasmex-skill](../../packages/skill/skill), `ctx.skills`), le fournisseur local ([lasmex-skill-filesystem](../../packages/skill/skill-filesystem)), le fournisseur facultatif du badge intégré ([lasmex-skill-badge](../../packages/skill/skill-badge)) et le consommateur ([lasmex-tool-skill](../../packages/skill/tool-skill)). Le registre fusionne les catalogues des fournisseurs entre les couches de l’hôte et de chaque portée. Les fournisseurs contribuent des skills locaux ou intégrés. Le consommateur possède les catalogues initial et de remplacement ainsi que l’outil `skill` destiné au modèle. Les skills sont des consignes facultatives, pas des événements de session ; leur vocabulaire se trouve donc ici plutôt que dans [core.md](core.md).

Sources : [`packages/skill/skill/src/index.ts`](../../packages/skill/skill/src/index.ts), [`packages/skill/skill-filesystem/src/index.ts`](../../packages/skill/skill-filesystem/src/index.ts), [`packages/skill/skill-badge/src/index.ts`](../../packages/skill/skill-badge/src/index.ts) et [`packages/skill/tool-skill/src/index.ts`](../../packages/skill/tool-skill/src/index.ts).

## Registre des fournisseurs

`ctx.skills` combine des fournisseurs locaux, intégrés, distants ou de tout autre type. L’enregistrement est synchrone ; l’initialisation distante et la découverte doivent s’effectuer dans la méthode attendue `list()`. Les objets des fournisseurs, les options et les candidats sont empruntés en lecture seule, tandis que les champs sémantiques sont validés.

Le registre comporte une couche hôte et des couches par portée, selon le modèle établi par le [registre d’outils](tools.md) au-dessus de [lasmex-scope](../../packages/core/scope). Un enregistrement rejoint la couche correspondant à la portée de son contexte appelant : les lignes hôtes et les plugins du dépôt rejoignent la couche globale, tandis qu’un plugin monté par la composition permanente d’un préréglage d’agent rejoint la couche de ce préréglage. Les noms de fournisseurs sont uniques par couche, pas dans tout le processus. Une lecture fusionne la couche globale avec la chaîne de la portée consultée. En cas de nom de skill en double, l’entrée de la couche la plus proche l’emporte entièrement ; le classement décrit plus bas départage seulement les doublons d’une même couche. Les caches de découverte sont indexés par la chaîne de portée résolue. Le rattachement d’une portée à un nouveau parent, lors de la recomposition d’une session vide, est donc visible dès la lecture suivante sans modification du registre.

Dans une même couche, les noms en double sont départagés par classement, puis par ordre des fournisseurs et enfin par ordre local. Les résumés sont triés par nom. Une méthode `list()` rejetée est journalisée et omise d’une observation incomplète. Une observation explicitement incomplète fournit tout de même des candidats utilisables, mais le résultat ne peut pas être mis en cache. Les candidats mal formés provoquent un échec immédiat. Chaque fabrique de fournisseur reçoit un contrôle limité à son enregistrement. Sa méthode `invalidate()` efface les catalogues terminés uniquement tant que cet enregistrement précis reste actif, et son signal est annulé si l’enregistrement échoue ou est démonté. Une découverte en cours est retentée une fois lorsque la génération de son fournisseur change. Un second changement renvoie les candidats les plus récents sous forme de résultat incomplet et non mis en cache. Les modifications des fournisseurs et du runtime émettent l’événement d’invalidation non filtré `skills/change`. Il ne contient aucune différence ; les consommateurs rappellent `snapshot()` avec leurs propres options de recherche.

Un tableau renvoyé par `SkillProvider.list()` est le raccourci d’une découverte complète. `SkillProviderObservation` permet à un fournisseur d’exposer des candidats encore directement chargeables tout en signalant que l’observation ne fait pas autorité.

```ts type-equiv
/** Provider candidates plus whether the current discovery is authoritative. */
interface SkillProviderObservation {
  /** Candidates available from the current provider discovery. */
  readonly candidates: readonly SkillCandidate[]
  /** Whether discovery completed and these candidates may be cached. */
  readonly complete: boolean
}
```

```ts type-equiv
/** Provider interface for one source of skills, such as local directories or a remote registry. */
interface SkillProvider {
  /** Unique provider name in the `ctx.skills` registry. */
  readonly name: string
  /**
   * List available skill candidates for the current lookup context. Provider
   * plugins register synchronously during `apply()`; remote initialization,
   * authentication, and discovery are awaited inside this method. Implementations
   * should settle promptly when `options.signal` aborts.
   * @param options - lookup options; `cwd` selects workspace-sensitive skills and `signal` cancels work.
   * @returns provider candidates as a complete-array shorthand, or an explicit
   *   observation when usable candidates came from incomplete discovery.
   */
  readonly list: (options: SkillLookupOptions) => Promise<readonly SkillCandidate[] | SkillProviderObservation>
  /**
   * Load a complete skill body for a previously listed candidate.
   * @param candidate - the winning candidate originally returned by this provider.
   * @param options - lookup options; `cwd` selects workspace-sensitive skills and `signal` cancels work.
   * @returns the full skill body, or `undefined` if it is no longer loadable.
   */
  readonly get: (candidate: SkillCandidate, options: SkillLookupOptions) => Promise<SkillDefinition | undefined>
}
```

```ts type-equiv
/** Registration-scoped lifecycle and invalidation capability borrowed by one provider. */
interface SkillProviderControl {
  /** Aborts if registration fails or when the exact provider registration is disposed. */
  readonly signal: AbortSignal
  /** Invalidate completed catalogs and notify consumers only while the exact registration remains active. */
  readonly invalidate: () => void
}
```

## Priorité de la découverte locale

Le fournisseur local livré avec LasmeX analyse les racines selon le classement suivant :

| Rang | Source | Racine |
|---|---|---|
| 100 | `project-lasmex` | `<projectRoot>/.lasmex/skills` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` |
| 300 | `custom` | `Config.customSkillDirs` |
| 400 | `user-lasmex` | `<lasmexHome>/skills` |
| 500 | `user-agents` | `<agentsHome>/skills` |
| 600 | `bundled` | `Config.bundledSkillDir` lorsqu’il est configuré |

La racine du projet est l’ancêtre le plus proche qui contient `.git`. S’il n’existe pas, le répertoire de travail courant est utilisé. Lorsque `ctx.fs` est disponible, la remontée vers la racine Git recherche `.git` au moyen du service de système de fichiers, afin qu’un espace de travail distant ou isolé ne se replie pas sur le système de fichiers de l’hôte. La racine LasmeX de l’utilisateur ignore son enfant `.system`. Le fournisseur local ne crée aucun skill système intégré ; les déploiements fournissent leurs skills empaquetés au moyen de racines intégrées configurées ou de fournisseurs dédiés.

`lasmex-skill-badge` enregistre un candidat `bundled` immuable au rang `BUNDLED_SKILL_RANK` et expose le répertoire de ses ressources empaquetées par `resourceBase`. La CLI livrée désactive ce plugin ; activer sa ligne de composition constitue donc un choix explicite.

Chokidar surveille les racines existantes afin de détecter les ajouts et suppressions directes de bundles ou d’entrées plates, ainsi que les modifications directes d’une entrée de skill. Une racine absente est suivie, un segment de chemin manquant à la fois, depuis son ancêtre existant le plus proche jusqu’à ce que Chokidar puisse s’y attacher. Les fichiers de ressources situés sous un bundle ne modifient pas le catalogue. Les observations `write` et `edit` destinées au modèle invalident immédiatement le fournisseur lorsque leur cible concerne le catalogue. La surveillance hôte couvre les modifications provenant d’un IDE, de Git, du shell ou d’un processus externe. Un échec de surveillance rend l’observation courante incomplète sans masquer les candidats lisibles lors d’un chargement direct. Les surveillances limitées à un projet emploient un cache LRU borné et configurable.

## Identité d’un skill

Les noms de skills sont en kebab-case (`^[a-z0-9]+(?:-[a-z0-9]+)*$`). Le fournisseur local accepte les bundles en répertoire (`<name>/SKILL.md`) et les fichiers Markdown plats (`<name>.md`). La découverte récursive imbriquée `**/SKILL.md` n’est pas prise en charge.

```ts type-equiv
/** Origin bucket for a skill contribution. The value is prompt-visible metadata, not precedence by itself. */
type SkillSource = 'project-lasmex' | 'project-agents' | 'runtime' | 'user-lasmex' | 'user-agents' | 'custom' | 'bundled' | (string & {})
```

## Résumés, candidats et définitions complètes

`SkillSummary` est le résumé du registre, indépendant du mode d’invocation. Les consommateurs choisissent les entrées et les champs à afficher. Le catalogue de la session destiné au modèle utilise uniquement les champs `name` et `description` des skills invocables par le modèle, jamais leur corps ni leur chemin absolu. `SkillInvocationPolicy` normalise les deux contrôles d’invocation indépendants en booléens positifs. Chaque résumé, candidat et définition résolus la contient, sans intégrer le frontmatter arbitraire au modèle du domaine.

```ts type-equiv
/** Invocation controls shared by skill discovery consumers. */
interface SkillInvocationPolicy {
  /** Whether model-facing catalogs and loaders include this skill. */
  readonly modelInvocable: boolean
  /** Whether human-facing command catalogs and loaders include this skill. */
  readonly userInvocable: boolean
}
```

```ts type-equiv
/** Invocation-neutral skill metadata returned by `ctx.skills.list()`. */
interface SkillSummary {
  /** Kebab-case identifier used to address the skill. */
  readonly name: string
  /** Short routing description shown by discovery consumers. */
  readonly description: string
  /** Optional extra routing guidance. */
  readonly whenToUse?: string
  /** Resolved model and user invocation controls. */
  readonly invocation: SkillInvocationPolicy
  /** Discovery source that produced this winning skill. */
  readonly source: SkillSource
  /** Provider that owns this skill body. */
  readonly provider: string
  /** Provider-specific base for relative resources. */
  readonly resourceBase?: SkillResourceBase
}
```

`ctx.skills.list()` conserve les quatre combinaisons de politiques. `isModelInvocable(skill)` et `isUserInvocable(skill)` lisent le champ obligatoire correspondant. Un skill réservé au modèle définit `{ modelInvocable: true, userInvocable: false }`, un skill réservé à l’utilisateur définit `{ modelInvocable: false, userInvocable: true }`, et les deux champs à `false` conservent le skill uniquement pour les appelants fiables de `ctx.skills.get()`. Le fournisseur local lit les clés frontmatter exactes en kebab-case `disable-model-invocation` et `user-invocable`, attribue `true` aux champs omis et projette chaque skill analysé dans cette politique normalisée.

`SkillCatalogSnapshot` distingue une absence qui fait autorité d’un échec temporaire de fournisseur ou d’un catalogue qui a continué de changer pendant la découverte. `skills` contient les résumés indépendants de l’invocation, triés et collectés pendant l’observation. `complete` vaut true uniquement lorsque tous les fournisseurs enregistrés ont terminé sans révision concurrente du catalogue. Les instantanés incomplets ne sont pas mis en cache ; chaque consommateur peut ainsi conserver son dernier bon catalogue filtré et réessayer.

```ts type-equiv
/** One catalog observation plus whether discovery completed within a stable catalog revision. */
interface SkillCatalogSnapshot {
  /** Sorted invocation-neutral summaries collected in this observation. */
  readonly skills: SkillSummary[]
  /** Whether every registered provider completed without a concurrent catalog revision. */
  readonly complete: boolean
}
```

`SkillCandidate` est la structure transmise du fournisseur au registre. `locator` est un état opaque appartenant au fournisseur. Le registre le conserve uniquement pour le rendre à la méthode `get()` du fournisseur gagnant.

```ts type-equiv
/** Provider catalog entry used by the registry to merge and later load skills. */
interface SkillCandidate extends SkillSummary {
  /** Lower ranks win duplicate skill names before provider registration order is considered. */
  readonly rank: number
  /** Opaque provider-owned handle passed back to `provider.get()`. */
  readonly locator: unknown
  /** Absolute file path when the provider has one. */
  readonly path?: string
  /** Parsed optional metadata object from provider-specific skill frontmatter. */
  readonly metadata?: Readonly<Record<string, unknown>>
}
```

`SkillDefinition` est le résultat analysé complet renvoyé par `ctx.skills.get()` et utilisé par l’outil `skill`. `resourceBase` indique à l’outil comment afficher les consignes de résolution des ressources relatives pour les skills locaux, distants par URL ou gérés par un fournisseur.

```ts type-equiv
/** Optional provider-specific base used by loaded skill bodies to resolve relative resources. */
type SkillResourceBase =
  | { readonly kind: 'directory'; readonly path: string }
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'opaque'; readonly description: string }
```

```ts type-equiv
/** Complete parsed skill definition, including the body loaded by `ctx.skills.get()`. */
interface SkillDefinition extends SkillSummary {
  /** Markdown instruction body after any provider-specific metadata removal. */
  readonly content: string
  /** Absolute file path when the skill came from disk. */
  readonly path?: string
  /** Parsed optional metadata object from frontmatter. */
  readonly metadata?: Readonly<Record<string, unknown>>
}
```

Les contributions de skills au runtime peuvent omettre les contrôles d’invocation et le libellé du fournisseur. Le registre résout ces deux valeurs par défaut une seule fois, puis emploie la même définition complète et le même ordre de collecte, où le premier l’emporte, que pour les fournisseurs. La fonction de nettoyage renvoyée retire la contribution et invalide les caches de découverte.

```ts type-equiv
/** Runtime skill contribution accepted by `ctx.skills.register()`. */
type SkillRegistration = Omit<SkillDefinition, 'invocation' | 'provider'> & {
  /** Invocation controls; omission permits both model and user surfaces. */
  readonly invocation?: SkillInvocationPolicy
  /** Provider label; omission uses the registry-owned runtime provider. */
  readonly provider?: string
}
```

## Recherche et configuration

La recherche de skills dépend du cwd, car les fournisseurs peuvent exposer des skills propres à l’espace de travail. Son signal facultatif annule les opérations du fournisseur pour l’appelant. Les lectures du registre reçoivent aussi la portée consultée, c’est-à-dire l’agent appelant qui constitue sa propre clé de portée, au moyen de `SkillViewOptions`. Le registre consomme `scope` pour choisir les couches. Les fournisseurs lisent uniquement leur contrat `SkillLookupOptions` depuis le même objet d’options emprunté. L’annulation est vérifiée avant et après la sélection du catalogue, même en cas de cache, et entre en concurrence avec la découverte comme avec le chargement de la définition complète. Si aucune racine Git n’est trouvée, le fournisseur local traite le cwd fourni comme racine du projet.

Le registre ne met pas en cache les définitions complètes. Chaque `get()` appelle le fournisseur gagnant avec le candidat sélectionné ; le fournisseur local relit donc le corps courant. Une définition dont le nom ne correspond plus au candidat est rejetée et le fournisseur précis est invalidé afin de relancer la découverte.

```ts type-equiv
/** Caller context used for cwd-sensitive and abortable provider work. */
interface SkillLookupOptions {
  /** Workspace selector for the current lookup. */
  readonly cwd?: string | undefined
  /** Abort discovery or loading work for the current caller. */
  readonly signal?: AbortSignal | undefined
}
```

```ts type-equiv
/**
 * Registry read options: provider lookup context plus the viewing scope.
 * The registry consumes `scope` to select layers; providers receive the same
 * borrowed options object and read only their {@link SkillLookupOptions}
 * contract from it.
 */
interface SkillViewOptions extends SkillLookupOptions {
  /** Viewing scope (the calling agent); omitted reads the global layer alone. */
  readonly scope?: ScopeKey | undefined
}
```

Le registre possède uniquement la limite de son cache de découverte. Le fournisseur local possède les racines du système de fichiers (`lasmexHome`, `agentsHome`, `customSkillDirs` et les valeurs facultatives `bundledSkillDir`/`LASMEX_BUNDLED_SKILL_DIR`), ainsi que l’activation de la surveillance, la fréquence d’interrogation, la stabilité, les liens symboliques et les limites de capacité des projets. Le consommateur possède la limite des descriptions du catalogue. Les valeurs par défaut et leur validation se trouvent dans le [catalogue de configuration](../config-catalog.md) généré.

```ts type-equiv
/** Skill registry configuration. */
interface Config {
  /** Maximum number of completed cwd/provider catalogs kept in memory. */
  readonly collectCacheMaxEntries?: number
}
```

## Catalogue de session et contrat de l’outil

`lasmex-tool-skill` injecte le premier `<system-reminder>` durable de rôle utilisateur lors du premier `agent/pre-step` d’une session active qui observe une vue complète non vide. Le catalogue contient uniquement les champs `name` et `description`, triés, normalisés et échappés pour XML, des skills invocables par le modèle. Il omet le corps, le chemin, la source, le fournisseur et les indications de routage. La découverte transmet le signal d’annulation de l’étape par `SkillLookupOptions`. `catalogDescriptionMaxLength` est la configuration du consommateur qui limite la description ; sa valeur par défaut est `500` et son minimum entier `3`.

Avant chaque étape ultérieure du modèle, le consommateur applique la visibilité exacte des outils et calcule une empreinte des entrées rendues entre les balises `<available_skills>` depuis un instantané complet. Il dérive la valeur de comparaison des mêmes entrées dans le message de catalogue visible reconnaissable le plus récent provenant du plugin. Une empreinte modifiée ajoute un remplacement durable complet au moyen de `agent.inject()`. La suppression de tous les skills ajoute un remplacement explicitement vide. Les instantanés incomplets conservent la dernière vue correcte du modèle. Si la compaction masque tous les messages historiques du catalogue, l’instantané complet suivant rétablit le catalogue courant. Une vue vide sans catalogue antérieur n’émet rien. Ces messages de catalogue appartiennent à l’historique de la session, pas à l’état du monde.

L’outil destiné au modèle `skill({ name })` valide le nom en kebab-case, trouve le résumé dans le catalogue indépendant de l’invocation, refuse l’accès avant le chargement si `isModelInvocable` ne l’autorise pas, puis relit la définition complète pour le cwd de l’agent appelant et revérifie la politique avant de renvoyer le contenu. Il signale un skill introuvable comme inconnu ou devenu indisponible, puis renvoie un résultat d’outil contenant `<skill_content name="...">`, `<skill_resources>` et `<skill_instructions>`. `resourceBase` résout uniquement les scripts, références et ressources explicitement cités, au moment où ils sont nécessaires. Le résultat chargé n’énumère pas le répertoire d’un skill. Une modification limitée au corps change donc les appels ultérieurs de l’outil sans produire de message de catalogue ni réécrire les anciens résultats.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Générée depuis les sources par `scripts/gen-cordis-catalog.ts` (sa fraîcheur est vérifiée par `pnpm run verify-cordis-catalog` dans doc-sync ; régénérez-la avec `pnpm run gen-cordis-catalog`) — cette section est identique octet pour octet dans les deux langues de la page. Les blocs de signature utilisent une clôture `ts cordis-catalog` et conservent la JSDoc source d’origine. Les modes de répartition sont définis dans le [guide d’introduction](../cordis-primer.md#dispatch-modes), et l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxskills--skillregistry"></a>

### `ctx.skills` — `SkillRegistry`

Registre en couches des fournisseurs de skills, selon le modèle hôte et par portée établi par le registre d’outils. Un enregistrement rejoint la couche de la portée de son contexte appelant (scopeOf). Les lignes hôtes et les plugins du dépôt rejoignent la couche globale, tandis qu’un plugin monté par la composition permanente d’un préréglage d’agent rejoint la couche de ce préréglage. Une lecture fusionne la couche globale avec la chaîne de la portée consultée : l’entrée de la couche la plus proche l’emporte entièrement sur un nom en double, tandis que le classement départage les doublons uniquement au sein d’une couche. Le registre expose des résumés triés indépendants du mode d’invocation et charge les corps complets à la demande.

```ts cordis-catalog
/**
 * Register a borrowed same-process provider synchronously during plugin
 * apply, into the calling context's layer: a scoped context (an agent
 * preset's standing mount) registers for that scope alone, an unscoped
 * context registers globally. Duplicate names within one layer and reserved
 * names throw; remote initialization belongs in `list()`. Fiber disposal
 * unregisters the provider and invalidates catalog caches.
 * @param create - synchronous factory receiving this registration's lifecycle and invalidation control.
 * @returns the exact Cordis effect disposer that unregisters this provider;
 *   composite effects may yield it directly to preserve teardown ordering.
 */
registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void

/**
 * Register a borrowed readonly runtime skill into the calling context's
 * layer. Project entries outrank runtime entries, which outrank user
 * entries, within one layer. Same-name runtime entries in one layer are
 * first-wins; a duplicate logs a warning and receives a no-op disposer so
 * it cannot remove the winner.
 * @param skill - the skill definition input; omitted invocation and provider fields receive defaults.
 * @returns the exact Cordis effect disposer, preserving composite teardown order and invalidating caches.
 */
register(skill: SkillRegistration): () => void

/**
 * List invocation-neutral skill summaries for a workspace. Consumers apply
 * model or user invocation policy at their operational boundary. Lookup
 * options and provider candidates are readonly same-process values borrowed
 * throughout discovery.
 * @param options - view options; `scope` selects the viewing agent's layers, `cwd` selects project roots, and `signal` cancels discovery.
 * @returns all sorted winning summaries.
 */
async list(options: SkillViewOptions = {}): Promise<SkillSummary[]>

/**
 * Observe the current invocation-neutral catalog and whether discovery completed within a stable revision.
 * Incomplete observations are never cached, allowing consumers to retain last-good state and
 * retry on their next request boundary.
 * @param options - view options; `scope` selects the viewing agent's layers, `cwd` selects project roots, and `signal` cancels discovery.
 * @returns sorted summaries plus discovery-completeness state.
 */
async snapshot(options: SkillViewOptions = {}): Promise<SkillCatalogSnapshot>

/**
 * Load and validate the winning candidate, passing its opaque discovery locator back to the
 * provider. Cancellation is rechecked after selection, including cache hits, and raced against
 * loading so an uncooperative provider cannot hang the caller.
 * @param name - kebab-case skill name.
 * @param options - view options; `scope` selects the viewing agent's layers,
 *   `cwd` selects workspace-sensitive skills, and `signal` cancels work.
 * @returns the full skill, including body content, or `undefined`.
 */
async get(name: string, options: SkillViewOptions = {}): Promise<SkillDefinition | undefined>
```

Source : [`packages/skill/skill/src/index.ts:357`](../../packages/skill/skill/src/index.ts)

<a id="skills-events"></a>

### Événements `skills/*`

<a id="skillschange--emit"></a>

#### `skills/change` — emit

Un fournisseur de skills, une contribution du runtime ou un catalogue fourni peut avoir changé. Cette notification d’invalidation n’est pas filtrée. Les consommateurs relisent le catalogue avec leurs propres options de recherche. Les échecs des écouteurs sont confinés et ne peuvent pas annuler la modification du registre.

```ts cordis-catalog
/**
 * A skill provider, runtime contribution, or provider-backed catalog may
 * have changed. This is an unfiltered invalidation notification; consumers
 * refetch the catalog for their own lookup options. Listener failures are
 * contained and cannot veto the registry mutation.
 * @mode emit
 */
'skills/change'(): void
```

Source : [`packages/skill/skill/src/index.ts:297`](../../packages/skill/skill/src/index.ts)
<!-- END GENERATED cordis-surface -->
