# Architecture de LasmeX

Lisez cette page avant de modifier quoi que ce soit sous `packages/`. Elle suppose une connaissance de Cordis. Sinon, commencez par le [guide d’introduction](cordis-primer.md) ou le [tutoriel](cordis-tutorial/index.md).

Nous vous recommandons d’utiliser un agent pour explorer la base de code et comprendre son architecture.

## Cordis

[Cordis](cordis-primer.md) est le framework qui sous-tend LasmeX. Les plugins fournissent des services, des événements typés et des effets réversibles à un contexte partagé. Chaque partie du produit est un plugin, y compris l’adaptateur de modèle, le registre d’outils, le journal de session et la boucle de l’agent. Chaque partie peut donc être remplacée par la configuration.

Il n’existe aucun cœur privilégié à modifier : pour étendre LasmeX, montez un plugin à côté des autres. Les enregistrements sont des effets qui sont annulés au déchargement de leur plugin.

## Profils et bundles

Un processus `lasmex` en cours d’exécution est un arbre de plugins composé au démarrage à partir de couches ordonnées.

Un **profil** est une composition nommée stockée dans le répertoire personnel de LasmeX. Il énumère les bundles qu’il superpose, contient les plugins externes au dépôt qu’il installe et conserve le fichier `cordis.patch.yml` de l’utilisateur. `web` et `headless` sont fournis comme modèles.

Un **bundle** est un format de distribution pour des lignes de configuration Cordis et le code qu’elles montent. Tout ce qu’il insère reste donc modifiable par les couches supérieures.

Chacun se déclare dans son propre `package.json` sous un champ `lasmex` : `lasmex.profile` énumère les bundles d’un profil, tandis que `lasmex.bundle` désigne le fichier de patch d’un bundle.

[`lasmex-base`](../packages/bundle/base/README.md) est la première couche de chaque profil : adaptateurs de modèles, outils, persistance, politique de sandbox et d’approbation, réglages, identifiants et télémétrie. [`lasmex-web-app`](../packages/bundle/web-app/README.md) ajoute l’application de navigateur. [`lasmex-headless`](../packages/bundle/headless/README.md) ajoute un exécuteur ponctuel qui ne démarre aucun serveur.

Les couches s’appliquent à une liste d’entrées vide dans l’ordre suivant : chaque bundle dans l’ordre déclaré par le profil, puis le fichier `cordis.patch.yml` du profil, celui du répertoire personnel et enfin toute surcouche `--patch`. Un patch cible une ligne par son identifiant et remplace toute sa configuration, ou insère de nouvelles lignes.

Pour afficher l’arbre réellement démarré sur votre machine :

```sh
lasmex --profile web --dump-config
```

Chaque ligne affichée peut être remplacée par votre propre patch.

Le fonctionnement de la composition est décrit dans [app-boot](../packages/boot/app-boot/README.md#profiles). Les champs de configuration figurent dans le [catalogue de configuration](config-catalog.md) généré.

## Packages principaux

Voici quelques packages principaux qui contribuent à l’arbre Cordis.

| Package | Responsabilité | Clé `ctx` |
|---|---|---|
| [`core/session`](subsystems/session.md) | Le journal en ajout seul `SessionEvent` et son stockage en mémoire | `ctx.sessions` |
| [`core/system-prompt`](subsystems/system-prompt.md) | L’assemblage des sections d’invite et des schémas d’outils | `ctx.systemPrompt` |
| [`core/tools`](subsystems/tools.md) | Le registre d’outils à portée limitée et le pipeline d’exécution protégé | `ctx.tools` |
| [`core/agent`](subsystems/core.md) | L’interface `Agent`, le registre en direct et les événements `agent/*` | `ctx.agents` |
| [`core/agent-loop`](subsystems/core.md) | Le pilote par défaut qui implémente cette interface | `ctx.agentLoop` |
| [`core/scope`](subsystems/scope.md) | La primitive d’enregistrement propre à chaque agent | Bibliothèque, aucune clé |
| [`llm/llm`](subsystems/llm-streaming.md) | Le vocabulaire des messages et du flux, ainsi que le seam d’adaptateur | `ctx.llm` |

## Événements
<a id="events"></a>

Les événements sont les points d’extension. Dans la plupart des modifications, la première décision consiste à choisir le bon domaine.

- Les **événements de session** sont des faits durables ajoutés au journal et diffusés par `session/event`. Utilisez-les lorsqu’un fait doit survivre à un rechargement.
- Les **événements d’agent** (`agent/*`) transportent un `Agent` actif : boîte de réception, étape, état, requête, validation et continuation. Utilisez-les pour observer ou intercepter un travail en cours.
- Les **événements de capacité** attachent des politiques et des adaptateurs à un seam (`fs/*`, `tools/*`, `telemetry/*`) sans importer la boucle.

La [carte des événements](event-producer-consumer.md) répertorie tous leurs producteurs et consommateurs.

## Déroulement d’un tour
<a id="turn-flow"></a>

Une **étape** comprend une requête au modèle et les outils qu’elle appelle. Un **tour** comprend zéro ou plusieurs étapes : il s’ouvre avant que sa première entrée soit réclamée et se ferme lorsque plus rien n’est dû.

```text
turn/start
  claim next-step input plus one queued message
  assemble prompt sections + tool schemas
  -> agent/pre-step                   reject | enter(messages)
     reject, or a first enter rewritten empty -> close the turn with no step
     stable-partition entered messages: context first, direct user input last
     enforce maxStepsPerTurn before admitting another request
     step/start
     append entered messages as user/message
     derive model history from the log
     agent/request -> llm/stream -> assistant/chunk* -> assistant/message
     tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*
     step/end
     tools owe another request, or next-step input arrived -> claim -> next step
       result-only continuation -> append completed-tools notice + quoted direct request
  -> agent/turn-stopping
turn/end
```

`turn/*`, `step/*`, `user/message`, `assistant/*` et `tool/*` sont des événements de session durables. Les autres sont des points d’extension en direct répartis dans trois domaines. `agent/pre-step`, `agent/request`, `llm/stream` et les trois événements `tools/*` sont des cascades dont les écouteurs doivent appeler `next()` pour déléguer. `agent/turn-stopping` est séquentiel et ne possède pas de `next()`.

Les entrées atteignent le pilote par une boîte de réception unique. Certains messages le réveillent immédiatement ; le contexte injecté attend dans la boîte qu’un autre message le réveille.

`agent/pre-step` détermine ce que voit le modèle. Les écouteurs peuvent réécrire les messages réclamés ou les rejeter entièrement. Après une décision d’entrée, la boucle place de manière stable chaque message ne provenant pas de l’utilisateur avant ceux dont `source.kind === 'user'`. Les deux groupes conservent l’ordre de leurs producteurs et l’identité des messages : les instructions, le contexte d’exécution et les catalogues précèdent donc l’invite directe dans le journal durable comme dans la requête au modèle. Lorsqu’un résultat d’outil impose une nouvelle requête sans nouvelle entrée directe, la boucle enregistre un avis de plugin après ce résultat. Cet avis nomme chaque outil déjà appelé pendant le tour, interdit de les répéter uniquement pour satisfaire la requête citée et cite le texte de la dernière requête directe, afin que l’instruction de réponse encore à exécuter reste en dernière position. Le message d’origine et l’historique des outils demeurent inchangés. Le rejet ou la réécriture vide de la première entrée ferme tout de même un tour durable sans étape, de sorte que le journal conserve la tentative. `maxStepsPerTurn` rejette par `MAX_STEPS` la première étape de modèle qui dépasse la limite positive configurée. Chaque étape admise lit les sections d’invite et les schémas d’outils enregistrés par les plugins.

Voir aussi le [diagramme de séquence](agent-lifecycle.md), le [pipeline d’outils](tool-execution-pipeline.md), ainsi que l’[annulation et la récupération après erreur](subsystems/core.md#the-agent-handle).

## Journal de session

Le journal de session est la source du contexte présenté au modèle. `deriveMessages()` en projette l’historique du modèle, tandis que les événements `assistant/chunk` bruts préservent la fidélité du rejeu et de l’interface. Les forks, les reprises, les transcriptions, la télémétrie et la persistance dérivent tous de ce flux.

**Tout contenu visible par le modèle doit être journalisé.** Chaque élément d’une requête au modèle doit pouvoir être reconstruit depuis le journal ; une vérification de propriété à l’exécution garantit cette reconstruction. C’est pourquoi une nouvelle entrée visible par le modèle exige un nouvel événement de session : étendez `SessionEventMap`, puis effectuez le rendu depuis le journal.

## Seams de capacité

Un **seam** est une capacité remplaçable composée de trois rôles : une **définition de service** qui déclare l’interface, un **fournisseur de service** qui l’implémente et un **consommateur** qui l’utilise, souvent sous la forme d’un outil destiné au modèle. Un package peut réunir plusieurs rôles, mais un rôle isolé ne constitue pas un seam. Ajouter une capacité implique de concevoir les trois ([graphe des capacités](capability-seams.md)).

Grâce aux seams, remplacer un fournisseur modifie le produit entier. Les fournisseurs de système de fichiers et de sous-processus partagent un même environnement d’exécution. Les diriger vers un sandbox distant y déplace Bash, PTY et LSP sans créer de variantes des fournisseurs. Les [fournisseurs de sous-agents](subsystems/subagent.md) présentent la même diversité derrière une interface unique, depuis un nouvel agent enfant jusqu’à un tour délégué dans un autre produit.

## Emplacement des nouveaux comportements

Un nouveau comportement se rattache à un point d’extension documenté. Une modification de la boucle met cette carte à jour.

| Objectif | Mécanisme |
|---|---|
| Ajouter un fournisseur de modèle | Enregistrer son adaptateur dans `ctx.llm` |
| Ajouter une capacité destinée au modèle | L’enregistrer dans `ctx.tools` ; son schéma rejoint l’assemblage de l’invite |
| Donner un ensemble de capacités différent à une session | Composer un préréglage d’agent ; une ligne de service doit y employer un domaine `isolate` |
| Ajouter l’exécution d’un shell | Enregistrer un backend `ctx.shell` ; le backend local crée ses processus par `ctx.subprocess` |
| Ajouter l’exécution dans un terminal persistant | Enregistrer un backend `ctx.terminals` et `lasmex-tool-terminal` |
| Ajouter une commande humaine | L’enregistrer dans `ctx.commands` ; elle s’exécute sans tour de modèle |
| Ajouter un travail en arrière-plan | L’enregistrer dans `ctx.jobs` ; les outils `job_*` le récupèrent ou l’arrêtent |
| Ajouter un accès au système de fichiers ou une politique | Enregistrer un fournisseur `ctx.fs` ou écouter les événements `fs/*` |
| Confiner les processus créés | Employer un backend `ctx.sandbox` ; les consommateurs enveloppent argv avant la création |
| Intercepter une requête, un outil ou un tour | Employer son événement `agent/*` ou `tools/*` ; `agent/turn-stopping` arrête un tour |
| Ajouter un contexte destiné au modèle | Appeler `agent.inject()` ; il est inclus dans la prochaine requête admise |
| Ajouter une intégration d’interface ou d’éditeur | Piloter `ctx.agents` et effectuer le rendu depuis `session/event` |
| Ajouter un nœud de discussion au client Web | Enregistrer une `ConversationNodeDefinition` et son renderer indexé |
| Ajouter un état de session durable | Étendre `SessionEventMap`, puis effectuer le rendu et le rejeu depuis le journal |
| Générer les titres de session | Enregistrer l’unique fournisseur `ctx.sessionTitle` |
| Gérer un objectif dans la même session | Employer `ctx.goals` et poursuivre au moyen de `agent/*` |
| Forker une session active | `ctx.sessions.fork(source, boundary?, childSessionId?)` |
| Limiter un enregistrement à un agent | Employer le `agent.ctx` de cet agent |

Le [guide d’extension](cookbook/extension-cookbook.md) associe les fonctionnalités aux capacités et répertorie les procédures détaillées pour les [packages](cookbook/adding-a-package.md), les [outils](cookbook/adding-a-tool.md), les [adaptateurs LLM](cookbook/adding-an-llm-adapter.md) et les [nœuds de discussion](cookbook/adding-a-conversation-node.md).
