# Guide pratique : ajouter un package d’espace de travail

La liste de contrôle fichier par fichier pour un nouveau package `lasmex-<name>`. Elle est validée à partir des packages Bash et adaptateur pris comme modèles ; si elle s’en écarte, corrigez ce document.

## 1. Créer le package

```
packages/<group>/<pkg>/
  package.json     # copy from packages/core/tools, adjust name/description/deps
  tsconfig.json    # extends ../../../tsconfig.base.json, rootDir src,
                   # outDir lib/types, references: ../../../vendor/cosmokit,
                   # ../../../vendor/cordis (+ ../../../vendor/schemastery if
                   # you use Config, + ../../<group>/<dep> for each LasmeX dep)
  src/index.ts     # service default export or plugin (name/inject/apply/Config)
  README.md        # service API, events, extension points, design notes,
                   # + gated Model Experience context blocks or short form
                   # + the gated "Known Limitations and Deferred Work" section
                   # (or a whitelist entry in scripts/verify-package-readme-limitations.ts)
```

Choisissez un groupe existant lorsqu’un rôle correspond au package (`core`, `llm`, `bash`, `compact`, `subagent`, `todo`, `session-persistence`, `ui`, `util`, ou `support`). Un nouveau groupe est autorisé, mais c’est un simple conteneur : pas de `package.json`, pas de fichiers source, et les packages restent exactement un niveau en dessous.

Invariants de package.json (appliqués par `pnpm run constraints` et `scripts/check-workspace-constraints.ts`) : `private: true`, une `version` identique à celle du `package.json` racine, `type: module`, `main: "lib/index.js"`, `types: "lib/types/index.d.ts"`, `exports["."].types: "./lib/types/index.d.ts"`, `exports["."].default: "./lib/index.js"`, et `@deepseek-ai/cordis` dans peerDependencies comme dans devDependencies, avec la même plage. Reproduisez aussi chaque dépendance homologue LasmeX de peerDependencies dans devDependencies. Placez `@deepseek-ai/schemastery` dans `dependencies`, car ce validateur est requis au runtime, comme dans agent-loop. La liste `files` contient exactement `lib/index.js`, `lib/invariant.js`, `lib/types/**/*.d.ts` et les artefacts d’exécution propres au package reconnus par le contrôle ; un package dont l’export d’exécution pointe dans l’arbre généré inclut aussi `lib/types/**/*.js`. Ne publiez ni `src`, ni les sources maps de déclarations ou de JavaScript, ni d’anciens fichiers de déclaration à la racine. Les packages d’application CLI qui déclarent un `bin` incluent `lib/bin.js` immédiatement après `lib/index.js` dans `files`.

Les imports relatifs intra-package utilisent des spécificateurs `.ts` explicites en source (par exemple, `export * from './types.ts'`). Le compilateur réécrit ceux-ci en `.js` dans le JS émis et laisse les spécificateurs `.ts` explicites dans les déclarations, que les consommateurs TypeScript standard NodeNext/Node16 résolvent vers les fichiers `.d.ts` voisins.

## 2. L’enregistrer dans les configs racine

| Fichier | Modification |
|---|---|
| `tsconfig.base.json` | Aucune modification pour un groupe existant. Pour un nouveau groupe, ajoutez un candidat `./packages/<group>/*/src` au joker `lasmex-*`. |
| `tsconfig.host.json` (package Host) ou `tsconfig.client.json` (package Client) | Ajoutez `{ "path": "./packages/<group>/<pkg>" }` à `references`. Un package ordinaire appartient à un seul agrégat, jamais aux deux. `api/remotes` utilise une séparation propre au dépôt, car Host génère une interface que Client consomme dans une phase ultérieure ; les nouveaux packages ne doivent pas la reproduire ([organisation](../development.md#typescript-project-layout)). |
| `knip.json` | Modifiez-le seulement si la découverte du dépôt ne couvre pas déjà les points d’entrée du package. |

Un package `packages/client/*` étend en plus `tsconfig.base.client.json` au lieu de `tsconfig.base.json`, et un package plugin client déclare `lasmex.client` dans package.json, exporte `./client`, et appelle le preset tsdown partagé (`packages/client/tsdown.client.ts`) — voir [packages/client/AGENTS.md](../../packages/client/AGENTS.md) pour le contrat côté client.

Couvert automatiquement par des globs ou la découverte de manifeste de package — aucune édition nécessaire : workspaces `package.json` racine, `scripts/publint-all.ts`, `tsdown.config.ts`, `.oxlintrc.json`, `scripts/check-workspace-constraints.ts`.

## 3. Décider de la topologie du package

Pour une capacité interchangeable, séparez les rôles Service Definition / Service Provider / Consumer en packages lorsqu’ils évoluent indépendamment (voir docs/architecture.md, section « Capability seams » ; le trio shell sert de modèle). Un plugin à objectif unique reste un seul package.

### Nommer le rôle qui existe

Nommez la responsabilité stable actuelle. Ne nommez pas la première implémentation, une possible expansion future, ou la classe de base Cordis. Un package d’interface nomme la capacité. Un package d’implémentation ajoute le mécanisme, protocole, environnement ou vendeur qui le distingue. Utilisez `local` uniquement lorsque l’exécution sur le même hôte fait partie du contrat.

Utilisez une clé `ctx` singulière pour un moteur, runtime, politique, contrôleur, résolveur, store, ou configuration actuelle. Utilisez une clé plurielle pour un registre ou un service qui possède plusieurs membres nommés. Le rôle de classe et le nombre de clés doivent correspondre. Ne réutilisez pas une clé `Context` Cordis pour des déclarations hôte et client incompatibles. La fusion de déclaration TypeScript voit les deux faces même lorsqu’elles utilisent des contextes runtime séparés. Ajoutez le suffixe de rôle lorsque le pluriel naturel appartient déjà à une autre face.

| Terme | À utiliser lorsque… | À éviter lorsque… |
|---|---|---|
| `Controller` | Il accepte des commandes ou une intention utilisateur et modifie un état de domaine ou de présentation existant. | Il exécute des travaux arbitraires, gère un ensemble de fournisseurs ou se contente de convertir des valeurs pour l’affichage. |
| `Store` | Il possède un jeu de données et fournit surtout des opérations CRUD, des instantanés ou des abonnements sur ces données. | Il valide une machine à états, arbitre une autorité, distribue du travail ou gère la priorité des fournisseurs. Une map ne suffit pas à faire d’une classe un store. |
| `Directory` | Il expose des entrées et leurs métadonnées pour la découverte ou la sélection. | Des producteurs y enregistrent des implémentations arbitraires ou des appelants y exécutent du travail. |
| `Presenter` | Il convertit sans effet de bord des valeurs du domaine ou des arguments d’outil en intention de rendu. | Il effectue des entrées-sorties, s’abonne, modifie un état ou gère un cycle de vie. |
| `Registry` | Il possède un ensemble dynamique d’enregistrements nommés, avec recherche, règles de doublon ou de priorité, durée de vie et libération. | Sa responsabilité principale est la distribution, l’exécution, l’annulation, la politique ou l’orchestration. |
| `Runtime` | Il exécute du travail actif et gère la distribution, l’annulation, la coordination des fournisseurs ou le cycle de vie des opérations entre les appels. | Il se contente de stocker des enregistrements, de renvoyer un catalogue, de résoudre une valeur ou de conserver une configuration. |
| `Resolver` | Il calcule ou localise une réponse à partir des entrées fournies sans gérer le cycle de vie de cette réponse. | Il possède une collection mutable ou une exécution de longue durée. |
| `Binder` | Il rattache une interface déclarée au contexte ou au cycle de vie d’un appelant, puis renvoie la valeur liée. | Il possède la valeur sous forme de collection, contrôle son état de domaine ou se contente de convertir des données. |
| `Engine` | Il met en œuvre un algorithme de domaine ou un modèle d’exécution avec état. | Il sélectionne seulement un fournisseur ou relaie des données à travers une frontière de protocole. |
| `Policy` | Il décide ce qui est autorisé, sélectionné, limité ou observé. | Il exécute le mécanisme permis par cette décision. |
| `Executor` | Il exécute une requête explicite ou une spécification résolue dans une capacité. | Il gère un large cycle de vie applicatif ou un catalogue de fournisseurs. |
| `Gateway` | Il adapte une frontière de processus, de réseau, de RPC ou d’API. | Il enregistre seulement des services dans le même processus ou stocke des métadonnées. |
| `Provider` | Il fournit une implémentation d’une définition de capacité. Ajoutez le mécanisme ou le fournisseur à son nom lorsque plusieurs implémentations peuvent coexister. | Il représente la définition de capacité, le registre de fournisseurs ou le runtime Consumer. |
| `Backend` | Il met en œuvre une persistance, un transport ou une exécution de bas niveau remplaçable derrière une interface définie. | Il représente un service destiné à l’utilisateur ou la référence active d’une ressource renvoyée. |
| `Handle` | Il désigne une ressource active et permet de la contrôler ou de l’observer. | Il crée et gère l’ensemble du pool de ressources. |
| `Config` | Il possède une valeur de configuration résolue ou un enregistrement strictement délimité et son mécanisme de mise à jour. | Il stocke une collection générale, exécute du travail ou expose des réglages sans rapport entre eux. |
| `Service` | Il possède un service de domaine cohérent qu’aucun des rôles plus précis ci-dessus ne décrit correctement. | Son nom vient uniquement du fait que la classe étend `Service` de Cordis. |

Utilisez `SDK` uniquement pour le protocole JSON-RPC client-serveur employé par les SDK Python et TypeScript pris en charge. LasmeX est un harness agentique, pas un projet de SDK. Utilisez toujours l’orthographe canonique `Typert`, jamais `TypeRT` ou `typeRT`.

## 4. Rédiger le README du package

Placez en premier l’API de service propre au package, sa configuration, ses événements, ses points d’extension et ses notes de conception. La section des limitations consigne les lacunes durables visibles du Consumer et les contraintes de maintenance non évidentes qui appartiennent à ce package ; les travaux de nettoyage ordinaires restent dans un TODO du code source ou une Agent Note. Une phrase indirecte de la section Model Experience peut nommer le Consumer qui expose la contribution du package, sans répéter son implémentation. Terminez chaque README de package par la séquence canonique suivante :

````markdown
## Model Experience

### Request context and condition

#### What the model sees

The exact data-dependent fields, an anchored generated-catalog link, or an introduction to the verbatim literal below.

##### Verbatim text for this field, when needed

```markdown
Stable system-prompt prose of any length, or another long non-generated literal, copied exactly from source.
```

#### Token effect

Fixed, conditional, retained, replaced, capped, or zero-direct token effect.

#### KV Cache effect

Append-only, prefix-stable, replacing, or independent behavior, including the exact conditions that may invalidate reuse.

## Known Limitations and Deferred Work

- **Consumer-visible gap** — exact missing operation or case, its consequence, and any maintainer constraint.
````

Renseignez Model Experience à partir de l’implémentation. Utilisez un H3 par entrée de contexte modèle directe, conditionnelle, plafonnée, liée à une durée de vie ou auxiliaire, avec les trois champs H4 ordonnés ci-dessus et un paragraphe sous chacun. Citez le texte stable possédé par le package : la prose du prompt système se place dans un H5 titré suivi d’un bloc `markdown`, sous le champ qui l’introduit, généralement `What the model sees`. Les autres littéraux courts restent en ligne avec des paramètres nommés ; les littéraux longs utilisent la même forme imbriquée. Résumez uniquement le texte dépendant des données ou possédé par le fournisseur. Une entrée de schéma d’outil renvoie vers sa section ancrée dans le [catalogue d’outils](../tool-catalog.md) généré et ne décrit que les différences absentes de ce catalogue. Gardez les entrées de prompt et de schéma séparées lorsque le périmètre peut masquer l’une sans l’autre. Dans `KV Cache effect`, distinguez la croissance par ajout, la répétition d’un préfixe stable, le remplacement des tokens d’une requête antérieure et une requête de modèle indépendante, puis nommez les changements possédés par le package qui peuvent invalider la réutilisation. « Does not invalidate » signifie que le package préserve un préfixe déjà réutilisable ; la disponibilité et l’éviction du cache du fournisseur restent hors du contrat du package. Le [standard de prose](../../.agents/skills/dsh-prose-standard/SKILL.md) régit l’exhaustivité et la propriété ; le vérificateur applique la structure de section requise.

Un package sans effet de contexte, ou dont le chemin appartient au Consumer, utilise la phrase auditée `None, as ` ou `Indirectly, through ` dans [`SENTENCE_MODEL_EXPERIENCE`](../../scripts/verify-package-readme-model-experience.ts), suivie d’un H4 `KV Cache effect` et d’un paragraphe non vide ; un package générique indépendant des modèles peut rejoindre `NO_MODEL_EXPERIENCE_SECTION` à la place. Ne développez aucun de ces deux cas en une description du travail d’un autre package. La [liste d’exceptions des limitations](../../scripts/verify-package-readme-limitations.ts) est indépendante. L’[Agent Note Model Experience](../../.agents/notes/implemented/process/2026-07-12-package-model-experience-contract.md) consigne la décision durable.

## 5. Vérifier

```sh
pnpm install        # registers the workspace
pnpm run doc-sync
pnpm run constraints && pnpm run typecheck && pnpm run lint
pnpm run build && pnpm run hygiene
```

Suivez la [politique de test du dépôt](../testing.md) pour les vérifications comportementales spécifiques et la couverture requise par le nouveau package.
