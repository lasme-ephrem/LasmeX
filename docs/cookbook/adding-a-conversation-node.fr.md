# Ajouter un nœud de conversation au client Web

Ce tutoriel ajoute une ligne métier à la vue Chat du client Web. Le plugin terminé regroupe une famille durable d’événements de session dans un même contexte, construit progressivement un état métier, publie des données d’étape typées et affiche un nœud Chat associé à une clé, sans parcourir la fenêtre de session ni les autres nœuds affichés. Il suppose que l’hôte enregistre déjà les événements et que le plugin client est composé dans le bundle Web. Les interfaces externes côté hôte et les autres vues cibles, comme Trajectory, ne sont pas abordées.

L’[Agent Note sur l’assemblage des nœuds de conversation](../../.agents/notes/implemented/architecture/2026-08-09-client-conversation-node-assembly.md) décrit la justification et le modèle complet du moteur. Ce guide présente le chemin d’implémentation.

## 1. Concevoir une famille d’événements rejouable

Choisissez un identifiant métier stable avant d’écrire la définition. Chaque événement qui contribue au même nœud doit contenir cet identifiant ou le dériver indépendamment de sa propre charge utile. Le client ne doit jamais attribuer une mise à jour au contexte « inachevé le plus récent ».

Pour une tâche de relecture, le contrat d’événements pourrait être le suivant :

| Événement | Rôle | Données durables obligatoires |
|---|---|---|
| `review/start` | début unique | `reviewId`, coordonnées du tour et de l’étape, titre |
| `review/progress` | mise à jour | même `reviewId`, coordonnées, progression rejouable |
| `review/end` | mise à jour | même `reviewId`, coordonnées, résumé final |

Utilisez le type d’identifiant marqué appartenant au producteur de part et d’autre de la limite du processus. Placez la fusion de `SessionEventMap` et les types de charges utiles dans l’export de types du producteur, puis importez cet export pour ses effets de bord depuis le package client. Chaque couple `(kind, id)` accepte au plus un événement de début. Une activité métier constituée d’un seul événement peut employer l’identité stable de cet événement, comme `event.seq`, en guise d’identifiant local à la définition.

Les événements incrémentaux sont pris en charge. Préférez les points de contrôle contenant une valeur complète lorsque le producteur peut les émettre à faible coût, car ils restent utiles lorsque le début se trouve hors de la fenêtre chargée. Chaque delta doit contenir l’identifiant stable et produire un état déterministe lorsqu’il est rejoué selon l’ordre croissant de `seq`. Il ne doit dépendre d’aucune mémoire disponible uniquement en direct. Si la fenêtre d’historique courante ne contient que des mises à jour, l’assembleur conserve un contexte en attente et ne construit aucun état jusqu’à ce qu’une page plus ancienne fournisse le début. Si le produit doit effectuer le rendu avant le chargement du début, un événement terminal ou un point de contrôle doit contenir suffisamment d’état complet de repli pour que la définition construise directement le résultat. Ne le reconstituez pas en parcourant des événements sans rapport.

## 2. Implémenter la définition et la charge utile Chat typée

L’exemple réunit les déclarations du producteur et la contribution du client dans un même bloc afin de rendre leur relation visible. Dans une famille de packages, conservez l’identifiant marqué et la déclaration de `SessionEventMap` avec le producteur de l’événement, puis placez la définition, la fusion des données Chat et le moteur de rendu dans le plugin client.

```ts ignore-check
import { createElement } from 'react'
import type { Branded } from 'lasmex-brand'
import type {
  ClientContext, ConversationLocation, ConversationNodeContext,
  ConversationNodeDefinition,
} from 'lasmex-client-runtime/client'
import type { ChatNodeViewProps } from 'lasmex-client-ui-conversation/client'

type ReviewId = Branded<'ReviewId'>

interface ReviewStartData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly title: string
}

interface ReviewProgressData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly completed: number
}

interface ReviewEndData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly summary: string
}

declare module 'lasmex-session/types' {
  interface SessionEventMap {
    /**
     * Opens one durable review job.
     * @mode emit
     * @param data - stable identity, location, and initial display state.
     */
    'review/start': ReviewStartData
    /**
     * Records replayable progress for one review job.
     * @mode emit
     * @param data - stable identity, location, and latest progress.
     */
    'review/progress': ReviewProgressData
    /**
     * Closes one review job with its final summary.
     * @mode emit
     * @param data - stable identity, location, and final display state.
     */
    'review/end': ReviewEndData
  }
}

interface ReviewChatData {
  readonly title: string
  readonly completed: number
  readonly status: 'running' | 'completed'
  readonly summary?: string
}

declare module 'lasmex-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    'review-job': ReviewChatData
  }
}

declare module 'lasmex-client-runtime/client' {
  interface ConversationStepDataMap {
    'review-job': ReviewChatData
  }
}

interface ReviewState extends ReviewChatData {
  readonly turn: number
  readonly step: number
}

function locationOf(context: ConversationNodeContext): ConversationLocation {
  return context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' }
}

function viewData(state: ReviewState): ReviewChatData {
  return {
    title: state.title,
    completed: state.completed,
    status: state.status,
    ...state.summary === undefined ? {} : { summary: state.summary },
  }
}

const reviewDefinition: ConversationNodeDefinition<ReviewState> = {
  kind: 'review-job',
  target: 'chat',
  match: (event) => {
    if (event.type === 'review/start') {
      return { id: String(event.data.reviewId), role: 'start' }
    }
    if (event.type === 'review/progress' || event.type === 'review/end') {
      return { id: String(event.data.reviewId), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'review/start') throw new Error('review-job requires review/start')
    return {
      turn: match.event.data.turn,
      step: match.event.data.step,
      title: match.event.data.title,
      completed: 0,
      status: 'running',
    }
  },
  update: (context, match) => {
    if (match.event.type === 'review/progress') {
      return { ...context.state, completed: match.event.data.completed }
    }
    if (match.event.type === 'review/end') {
      return { ...context.state, completed: 100, status: 'completed', summary: match.event.data.summary }
    }
    return context.state
  },
  publication: match => match.event.type === 'review/progress'
    ? 'animation-frame'
    : 'immediate',
  buildLocationData: (context, scope) => {
    if (scope !== 'step' || context.state === undefined) return null
    return {
      kind: 'step',
      turn: context.state.turn,
      step: context.state.step,
      key: 'review-job',
      value: viewData(context.state),
    }
  },
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    return {
      key: context.key,
      kind: 'review-job',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start?.event.seq ?? context.matches[0]?.event.seq ?? 0,
      location: locationOf(context),
      visibility: 'visible',
      data: viewData(context.state),
    }
  },
}

function ReviewNodeView({ node }: ChatNodeViewProps<'review-job'>) {
  const text = node.data.summary ?? `${node.data.title}: ${node.data.completed}%`
  return createElement('p', null, text)
}

export const inject = ['conversationEvents', 'slots']

export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(reviewDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'review-job',
  }, ReviewNodeView))
}
```

`match(event)` extrait une identité ; ce n’est pas une réduction. Il ne reçoit que l’événement courant et renvoie l’identifiant local à la définition ainsi que le rôle dans le cycle de vie. Après une correspondance, l’assembleur trouve le contexte au moyen de `(kind, id)`, puis appelle `start` une fois ou `update` avec l’état courant. Les deux fonctions renvoient l’état adopté par le moteur. Il est préférable de renvoyer une nouvelle valeur immuable, mais une fonction qui modifie puis renvoie le même objet possède la même sémantique d’adoption.

`buildLocationData(context, scope)` publie facultativement des données appartenant à la définition sur un tour ou une étape appartenant au moteur. Utilisez la fusion de déclarations pour attribuer à chaque clé un type de valeur précis. Un autre nœud du même emplacement peut lire cette valeur au moyen de son hook d’emplacement restreint, comme `useTurnData(key)`, sans recevoir la session ni parcourir `snapshot.chat.nodes`.

`target` et `buildViewNode(context)` déclarent une contribution de rendu appartenant à une cible et doivent apparaître ensemble. Conservez `context.key` comme identité destinée à React, choisissez `anchorSeq` à partir d’un indice d’ordre durable et ne renvoyez que des données prêtes pour le moteur de rendu. Une fois qu’un nœud cible a été publié, continuez de renvoyer la même clé. Utilisez `visibility: 'hidden'` lorsqu’il doit quitter temporairement le flux visible, au lieu de le retirer avec `null`.

## 3. Interroger un contexte métier antérieur uniquement au démarrage

Certaines définitions ont besoin du dernier état antérieur d’un autre type métier. `start` reçoit un `ConversationContextReader`. Appelez-y `reader.previous<State>(kind)` au lieu d’accepter une collection de contextes ou de parcourir les événements. Le lecteur renvoie, en lecture seule, le contexte démarré le plus proche avant le `seq` du début courant.

L’assembleur enregistre cette dépendance. Si l’ajout ultérieur d’une page plus ancienne fournit un prédécesseur plus proche, comble une lacune jusque-là inconnue dans la fenêtre ou modifie l’état du prédécesseur, il réexécute le contexte dépendant depuis `start`, puis rejoue ses mises à jour dans l’ordre croissant de `seq`. La définition interrogée reste responsable de produire un état utile. Le lecteur n’expose aucune méthode de requête propre au métier et n’accorde aucun droit de modification sur un autre contexte.

## 4. Comprendre les trois chemins d’ingestion

L’historique peut être demandé depuis sa fin, une page à la fois vers le passé, mais chaque page acceptée est normalisée dans l’ordre croissant de `seq` avant le rejeu de l’état.

| Chemin | Travail du moteur | Comportement visible par la définition |
|---|---|---|
| Remplacement à l’ouverture, à la resynchronisation ou à la réparation d’une lacune | Reconstruit la fenêtre chargée, fait correspondre chaque événement une fois par définition, puis rejoue chaque contexte démarré | `start`, suivi de ses mises à jour dans l’ordre croissant de `seq` ; les contextes en attente qui ne contiennent que des mises à jour restent sans état |
| Ajout d’une page plus ancienne | Fait correspondre uniquement les nouveaux événements plus anciens, les fusionne dans les contextes par `(kind, id)`, conserve les nœuds existants associés à une clé, puis rejoue uniquement les contextes et dépendances concernés | Un début nouvellement trouvé active les mises à jour accumulées ; un emplacement ou prédécesseur modifié peut réexécuter le contexte |
| Ajout d’un événement en direct | Appelle une fois `match` de chaque définition, trouve le contexte correspondant par sa clé, puis ne met à jour que ce contexte | Une mise à jour `update` et une publication demandée pour un événement qui correspond après le début ; aucun parcours des contextes existants |

Avec `D` définitions enregistrées, un événement entrant effectue `D` correspondances sur l’événement courant, puis une recherche du contexte en temps constant après une correspondance. Le code d’une définition doit préserver cette propriété : ne parcourez pas toute la fenêtre d’événements, tous les contextes, `context.matches` ni la collection de nœuds affichés sur le chemin normal d’ajout. Employez l’état pour les données accumulées, les données d’emplacement pour le partage au sein d’un même tour ou d’une même étape, et `reader.previous()` pour les dépendances indexées envers un prédécesseur.

`publication` détermine quand l’état modifié est matérialisé. Utilisez `immediate` pour les modifications structurelles ou terminales, `animation-frame` pour les deltas visibles fréquents et `none` lorsque la modification d’état alimente uniquement une publication ultérieure. Le moteur applique tout de même chaque mise à jour dans l’ordre du journal ; la cadence ne fait que regrouper les publications de la vue.

## 5. Vérifier le rejeu, la pagination et le rendu

Ajoutez des tests ciblés qui établissent les résultats suivants :

1. Une fenêtre complète transmise par remplacement produit l’état final, les données d’emplacement, la charge utile du nœud et l’`anchorSeq` attendus.
2. Une fin qui ne contient que des mises à jour reste en attente ; l’ajout de l’unique début produit le même résultat qu’un remplacement complet.
3. Un historique initial suivi d’un ajout en direct produit le même résultat que le rejeu de la fenêtre combinée.
4. L’ajout d’une page plus ancienne insère les lignes antérieures sans remplacer les valeurs des nœuds existants associés à une clé lorsque leurs données n’ont pas changé.
5. Des deltas visibles répétés conservent `context.key` et publient au plus une fois par trame d’animation lorsque cette cadence est demandée.
6. Le moteur de rendu associé à une clé consomme uniquement `node.data` et les hooks d’emplacement restreints. Il ne parcourt ni la fenêtre d’événements de la session, ni les contextes, ni les nœuds Chat.

Utilisez [`packages/client/ui-conversation/src/client/conversation-nodes/assistant.ts`](../../packages/client/ui-conversation/src/client/conversation-nodes/assistant.ts) pour le streaming et les interruptions, [`inbox.ts`](../../packages/client/ui-conversation/src/client/conversation-nodes/inbox.ts) avec [`message.ts`](../../packages/client/ui-conversation/src/client/conversation-nodes/message.ts) pour les requêtes de prédécesseur, et [`packages/client/ui-deliverables`](../../packages/client/ui-deliverables) pour une définition qui publie des données de tour sans créer son propre nœud.
