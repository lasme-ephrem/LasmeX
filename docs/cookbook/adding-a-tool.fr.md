# Référence de création d'outils

Cette référence décrit les obligations d’un outil exposé au modèle. Pour créer un premier outil pas à pas, suivez [Créer un outil](../user/develop/basic/tool.md). `packages/shell/tool-bash` fournit l’exemple complet d’une capacité répartie en trois packages.

## La forme minimale

```ts
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from 'lasmex-tools'

export const name = 'my-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'read_file',
    description: 'Read a file from disk.',          // what the model sees
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path' },
      limit: { type: 'number' },                     // optional by default
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      // args is TYPED from the schema: { path: string; limit?: number }
      // exec carries immutable identity + token; signal is the operational field
      return readFile(args.path, { encoding: 'utf8', signal: exec.signal })
    },
  }))
}
```

L’enregistrement est un effet : la destruction de la fiber du plugin désenregistre l’outil. Les schémas rejoignent automatiquement l’assemblage du prompt système.

## Obligations du contrat execute()

- **Les arguments sont validés avant votre code.** `defineTool` valide les `arguments` produits par le modèle à partir du `ParameterSchemaSpec` unifié avant d’appeler `execute` : types, clés obligatoires, littéraux, unions à une branche exacte et valeurs imbriquées ([validation des arguments à l’exécution](../../.agents/notes/implemented/architecture/2026-06-11-runtime-arg-validation.md)). Dans `execute`, les arguments correspondent donc à `InferArgs`. Les nœuds objet explicites déclarent `additionalProperties: true | false`, tandis que la racine implicite des paramètres reste ouverte. Vérifiez vous-même les contraintes que le DSL ne sait pas exprimer, comme une chaîne non vide, un nombre positif ou une règle entre plusieurs champs. Un outil enregistré directement avec un schéma JSON brut reste responsable de la validation de ses entrées.
- **L’enregistrement conserve votre définition en lecture seule.** Une contribution typée dans le même processus n’est pas une frontière de sérialisation : ne modifiez pas son schéma et ne remplacez pas ses callbacks après l’enregistrement. `schemas()` matérialise uniquement la projection explicitement visible du modèle. Pour remplacer un outil à chaud, détruisez l’effet qui le possède, puis enregistrez son remplaçant. Un état mutable fermé par le callback reste un état de plugin ordinaire.
- **L’identité d’exécution est protégée.** Le registre matérialise `arguments` en JSON détaché et sans perte lors d’un seul parcours récursif, fige cette valeur avant l’application de la politique et attribue un `exec.token` opaque. `callId`, `name`, `arguments`, `agent`, `token`, le `signal` obligatoire possédé par l’appelant et l’éventuel jeton `parent` du transport englobant restent immuables pendant la distribution. `parent` sert uniquement d’identité et ne donne aucun accès à l’exécution externe active. Traitez `args` comme une entrée en lecture seule. Seul un wrapper autour de la distribution reçoit une vue mutable ; il peut remplacer puis restaurer `exec.signal` pour imposer une échéance, mais pas le supprimer.
- **Déclarez et renvoyez une seule valeur JSON canonique.** `output.schema` utilise `ValueSchemaSpec` et accepte à sa racine un objet, un tableau, un scalaire ou null. `execute` renvoie uniquement la valeur déduite ; le registre en crée immédiatement un instantané JSON sans perte, la valide, la fige et la transmet à `output.render(args, value)`. Ne renvoyez pas de blocs de contenu depuis le corps de l’outil et n’obligez pas les appelants à extraire des identifiants ou des champs depuis de la prose.
- **Une exception ou une valeur invalide produit `isError`.** Le registre intercepte les exceptions et circonscrit les échecs de schéma, de rendu, de projection des métadonnées et de conversion JSON sans perte avant l’exécution des observateurs. Levez une exception pour un échec d’infrastructure. Placez un résultat de domaine réussi dans la valeur canonique, même si son rendu Native décrit un état défavorable, comme un code de sortie de processus non nul.
- **Respectez `exec.signal`.** Annulez le travail en cours lorsque celui-ci se déclenche.
- **Projetez les données durables d’une carte avec `presentationMeta` si nécessaire.** `output.presentationMeta(args, value)` dérive un JSON rejouable de la même valeur canonique. Le cœur le persiste dans `tool/result` et le transmet à `presentResult`. Une carte qui dépend de faits connus à la fin de l’outil, comme les fragments appliqués par `write` ou `edit`, peut ainsi être reconstruite au rejeu sans persister la valeur canonique. Le projecteur n’est pas appelé pour les distributions Code imbriquées, car elles n’ont pas de cartes.
- **Utilisez `exec.agent` pour les notifications asynchrones.** `agent.inject({ content, source: { kind: 'plugin', plugin: '<name>' } })` ajoute un contexte durable visible par la prochaine requête au modèle. Cette injection ne réveille pas un agent inactif. Gérez le cas d’un agent déjà détruit avec un try/catch ciblé.

## Travail de longue durée

Conditionnez `run_in_background` avec la configuration du producteur, puis enregistrez le travail au moyen de `ctx.jobs.start({ kind, label, owner: exec.agent, run })`. Le registre rejette un appel déjà annulé avant d’entrer dans le producteur. Le runtime vérifie ensuite la propriété et la disponibilité du contrôleur de tâche avant de lancer `run()`, puis fournit l’identifiant, la clôture de session, les outils de contrôle génériques, les notifications et le nettoyage lié au propriétaire. Une branche d’arrière-plan réussie renvoie une référence canonique typée telle que `{ kind: 'background', jobId }`. Son rendu Native peut conserver un texte destiné à l’humain comme `started background job bash-1`, mais Code Mode ne doit jamais analyser ce texte pour retrouver l’identifiant.

Le producteur fournit un `cancel` synchrone, une promesse `done` qui ne rejette pas et se résout après la libération des ressources, ainsi qu’un éventuel `readOutput` consommateur dont le formatage borne la sortie. Un appel déjà annulé est un échec, puisqu’aucune tâche n’existe et qu’aucun identifiant ne peut satisfaire le schéma de réussite. Dès que `ctx.jobs.start()` publie l’identifiant, utilisez un signal d’annulation possédé par la tâche plutôt que `exec.signal` : l’annulation ultérieure de l’appel externe interrompt l’attente, mais pas le travail déjà publié. `job_kill`, la destruction du propriétaire et l’arrêt du service possèdent cette durée de vie. Le travail au premier plan reste lié à `exec.signal`. Consultez l’[Agent Note sur le runtime générique des outils de longue durée](../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.md) et `lasmex-tool-bash` pour un producteur de flux.

## Politique d'exécution et observation
<a id="execution-policy-and-observation"></a>

N’intégrez pas une politique de déploiement directement dans l’outil. Utilisez `tools/pre-execute` pour une politique extensible autoriser-refuser-demander (voir l’[exemple de contrôle des permissions](extension-cookbook.md#a-hook-plugin-permission-gate-example)), `ctx.tools.guard()` pour un refus final et monotone qu’aucun listener ultérieur ne peut annuler, `tools/execute` pour entourer la distribution d’une échéance, d’une nouvelle tentative ou d’une collecte de métriques, `tools/post-execute` pour remplacer le contenu présenté ou la valeur renvoyée, bloquer le résultat ou joindre un contexte visible du modèle, et `tools/result` pour observer le résultat normalisé et immuable. Le remplacement du contenu préserve l’accès programmatique à `value` ; une politique de confidentialité bloque ou remplace la valeur elle-même. Le bac à sable peut aussi être appliqué dans l’exécuteur de l’outil. Le [README de `lasmex-tools`](../../packages/core/tools/README.md#extension-points) définit les entrées, l’ordre, les valeurs de retour et les échecs de chaque point d’extension.

## Code Mode expose automatiquement votre outil

Dans [Code Mode](../../packages/core/tools/README.md), chaque outil enregistré et visible devient disponible sous la forme `await tools.<name>(args)` sans intégration supplémentaire. Les types générés `ToolArgsMap` et `ToolOutputMap` dérivent les arguments exacts et la valeur canonique renvoyée à partir des mêmes schémas ; les appels repassent par le pipeline d’exécution normal. Un appel réussi produit la valeur JSON canonique finale après application des politiques, et non le contenu Native rendu. Un appel en échec rejette avec le véritable `ToolCallError`. Les programmes peuvent lire uniquement `name`, `toolName` et le `message` destiné à l’humain, sans accéder aux codes internes ni à une union d’échecs.

Concevez `output.schema` comme une API programmatique utile : renvoyez directement les références et les champs, acceptez une racine scalaire, tableau ou null lorsqu’elle représente honnêtement la valeur, et réservez l’explication destinée à l’humain à `output.render`. Les valeurs intermédiaires restent locales à l’exécution ; elles ne sont ni persistées ni tronquées dans le prompt et ne possèdent aucune limite d’octets. Les limites d’acquisition déclarées par le producteur et la mémoire du processus restent donc déterminantes. Seuls les journaux et le résultat externes de `run_code` traversent la limite de sortie configurable et le mécanisme de débordement visible du modèle.

## Affichage de votre outil dans l’interface

La méthode `output.render` de votre outil renvoie un contenu destiné au modèle. Sa **carte d’interface** est une responsabilité distincte, déclarée au moyen de projections de présentation pures et des méthodes facultatives `presentCall` et `presentResult`. Concevez ces éléments avec la valeur canonique. Sans présentation spécifique, l’outil utilise une carte générique dont le titre est son nom et l’entrée ses arguments bruts.

Les deux méthodes renvoient une intention de rendu **identifiée par `card`**. Choisissez le type de carte correspondant au travail de l’outil :

- `presentCall(args)` produit un `ToolCallView`, c’est-à-dire la carte en attente :
  - `{ card: 'generic', title, kind?, rawInput?, content?, locations? }` est la valeur par défaut. Définissez `kind` pour choisir une icône (`read`, `search`, etc.). Déclarez `locations: [{ path, line? }]` pour chaque fichier touché afin qu’un éditeur compatible puisse le suivre ou l’ouvrir.
  - `{ card: 'terminal', title, description?, cwd? }` convient lorsque l’appel est une commande shell. `title` contient la commande et `description` s’affiche au-dessus de la carte de terminal (tool-bash).
  - `{ card: 'diff', title, diffs, locations? }` convient lorsque l’appel crée ou modifie un fichier. `diffs: [{ path, oldText, newText }]`, avec `oldText: null` pour un nouveau fichier, s’affiche sous forme de diff intégré (`write` et `edit` de tool-fs).
- `presentResult(args, { content, isError, meta? })` produit la carte terminée :
  - `generic` fournit un titre facultatif et du contenu.
  - `terminal` fournit la sortie brute et, si elles existent, les métadonnées de fin. Chaque interface affiche sa vue spécialisée ou une solution de repli.
  - `diff` fournit les fragments appliqués, souvent dérivés par `output.presentationMeta` et transportés dans le champ persistant `result.meta` afin de permettre leur reconstruction au rejeu. Les outils de modification conservent un résultat diff, car la vue terminée remplace la carte en attente.
  - `search` fournit un résultat de découverte reconstruit à partir du champ persistant `result.meta` : des correspondances regroupées par fichier (`shape: 'matches'` pour grep) ou une liste plate de chemins (`shape: 'paths'` pour glob), avec `truncated` et `total` pour qu’une interface ne présente jamais un résultat limité comme complet. La vue ne contient pas de copie textuelle du résultat ; une interface dépourvue de carte de recherche utilise son contenu brut. Il n’existe pas de vue d’appel `search` : avant `execute`, les correspondances ne sont pas encore connues et l’appel conserve donc une carte générique (`grep` et `glob` de tool-fs-search).
  - `web` fournit une récupération web terminée, distinguée par `kind: 'search' | 'fetch'` et dérivée de `result.meta` : sources structurées d’une recherche ou résumé d’une récupération. Elle ne copie pas le corps ; une interface dépourvue de la capacité `web` utilise le contenu brut du résultat (`web_search` et `web_fetch` de tool-web).

Règles impératives :

- **Pureté.** Ces méthodes s’exécutent pendant le flux en direct comme pendant le rejeu du journal de session. Elles doivent donc être des fonctions pures de `args` et, pour le résultat, de la valeur fournie : aucune entrée-sortie, aucune lecture de l’état de session, aucune horloge ni valeur aléatoire. Un diff est dérivé des arguments ; `write` utilise `oldText: null`, car le présentateur d’un appel ne connaît pas encore l’ancien contenu du fichier. L’adaptateur d’interface, et non l’outil, fournit le contexte de session. Si `presentCall` semble avoir besoin de l’ancien contenu ou du répertoire de travail, placez cette donnée dans les métadonnées durables du résultat ou dans l’adaptateur, pas dans le présentateur.
- **Le formatage propre à l’interface reste hors du résultat du modèle.** Un bloc délimité ` ```console `, un diff ou un chemin relativisé n’appartient ni à la valeur canonique ni au contenu Native dans le seul but d’alimenter une interface. `output.render` possède le texte visible du modèle ; `presentationMeta` et les présentateurs de cartes possèdent l’état d’interface rejouable. Une vue de résultat `terminal` contient la sortie brute, et l’adaptateur ajoute la présentation de repli.
- **`defineTool` valide le chemin d’affichage sans interrompre le rejeu.** Si des arguments enregistrés sont anciens ou mal formés, le wrapper renvoie `undefined` pour sélectionner la carte générique au lieu de lever une exception. L’affichage ne doit jamais faire échouer le rejeu d’une session.

Le vocabulaire neutre appartient à `lasmex-tools` ; les outils n’importent jamais un type d’interface ou de transport. Les runtimes Host et Client adaptent chaque `card` à leur propre vue. La conception durable est décrite dans l’[Agent Note render-intent-union](../../.agents/notes/implemented/architecture/2026-07-02-tool-render-intent-union.md). `lasmex-tool-fs` pour les cartes generic et diff, ainsi que `lasmex-tool-bash` pour terminal, servent d’implémentations de référence.

## Vérification

Suivez la [politique de test du dépôt](../testing.md) et la documentation de test du package propriétaire. Tout changement visible du modèle ou de l’interface doit disposer de la couverture assemblée qui y est exigée.
