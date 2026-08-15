# Guide pratique : ajouter un adaptateur LLM

Ce guide explique comment connecter un nouveau fournisseur de modèles. Deux implémentations servent de référence : `packages/llm/llm-deepseek` (HTTP direct, avec des événements SSE délimités par `eventsource-parser`) et `packages/llm/llm-pi-ai` (qui encapsule une bibliothèque LLM). Commencez par lire la documentation de `StreamChunk` dans `packages/llm/llm/src/types.ts` : elle décrit les conventions de protocole vérifiées avec ces deux adaptateurs.

## Forme générale

```ts ignore-check
class MyAdapter extends LlmAdapter {
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> { … }
}

export const name = 'llm-myprovider'
export const inject = ['llm']
export const Config: z<Config> = z.object({ apiKey: z.string(), … })

export function apply(ctx: Context, config: Config) {
  ctx.llm.registerAdapter(['my-provider'], new MyAdapter(…))
}
```

L’enregistrement repose sur les effets et reste donc compatible avec le rechargement à chaud. Une seule instance d’adaptateur peut posséder une route de fournisseur : les doublons provoquent une erreur et l’enregistrement de plusieurs routes est atomique. `options.provider` sélectionne l’adaptateur et `options.model` désigne le modèle chez le fournisseur ; un adaptateur doté d’un catalogue dynamique peut ainsi proposer de nouveaux modèles sans reconfigurer son cycle de vie. Les secrets suivent le mécanisme Cordis : un schéma Schemastery dans Config définit les valeurs de repli issues de l’environnement, puis cordis.yml les transmet avec `!!js process.env.MY_KEY`. Le code ne doit jamais lire directement un fichier de clés créé pour l’occasion.

## Obligations du protocole vérifiées par les deux implémentations

- Émettez `usage` AVANT `finish` et n’émettez RIEN après `finish`. La méthode robuste consiste à mettre en attente la fin et l’usage jusqu’au marqueur de fin de flux du fournisseur, puis à les transmettre ; elle prend aussi en charge les fournisseurs qui envoient un dernier fragment contenant uniquement l’usage.
- Les `arguments` d’un appel d’outil restent des chaînes JSON BRUTES de bout en bout ; diffusez leurs fragments dans `argumentsDelta`. Si le fournisseur renvoie des objets déjà analysés, sérialisez-les de nouveau lors de `block-end`.
- Attribuez les `index` de bloc dans l’ordre de première apparition dans le flux, puis réutilisez le même index pour chaque fragment du bloc concerné.
- Deux voies d’erreur seulement sont admises : LEVER une exception depuis `stream()` pour les défaillances de transport ou de protocole — utilisez `LlmError` avec un code stable —, ou terminer le flux avec `finish {kind: 'error' | 'aborted'}` pour les défaillances signalées dans le flux du fournisseur. Les consommateurs gèrent les deux voies ; choisissez-en une pour chaque catégorie de défaillance et documentez ce choix.
- Respectez `options.signal` en le transmettant à fetch ou au SDK utilisé.
- Si le fournisseur ne peut pas respecter un champ de `GenerateOptions` — par exemple une liste `stop` lorsque les séquences d’arrêt ne sont pas prises en charge —, levez `LlmError(..., 'UNSUPPORTED')` au lieu de l’ignorer silencieusement.
- Si les requêtes suivantes exigent des identifiants de réponse, des signatures ou d’autres métadonnées propres au fournisseur, émettez leur projection JSON minimale et sans perte dans `finish.replayState`. Validez-la lors de la reconstruction de l’historique. `LlmRuntime` ne la transmet que si la route du fournisseur historique et celle du fournisseur cible appartiennent actuellement à la même instance exacte d’adaptateur ; il revient à votre adaptateur de décider si la restauration est autorisée entre modèles identiques, entre modèles différents ou entre fournisseurs. En l’absence de cet état, ne déduisez jamais la possibilité d’une reprise native à partir des seuls noms du fournisseur et du modèle.

Les options propres au fournisseur qui activent le mode raisonnement restent dans la Config de l’adaptateur. Les métadonnées exactes des modèles passent par une seule capacité indépendante du fournisseur : implémentez `resolveModel()` avec l’identité du fournisseur et du modèle, ainsi que les champs facultatifs `context` et `reasoning`; ne déclarez un `defaultEffort` configuré que s’il existe, et respectez l’éventuel `AbortSignal` du résolveur. Les niveaux d’effort de raisonnement sont des identifiants opaques ordonnés que l’adaptateur convertit en requêtes propres au fournisseur. Conservez la liste de choix qui fait autorité dans l’adaptateur, y compris une valeur `off` définie par celui-ci lorsqu’elle est prise en charge, sans exposer les valeurs finales du protocole ni ramener les valeurs non prises en charge dans une plage arbitraire ; l’identifiant peut différer de sa représentation sur le réseau.

## Structure de l’implémentation

Séparez les types du protocole, la sérialisation des requêtes, l’analyse du transport, la conversion des fragments et la classe de l’adaptateur ; [`llm-deepseek`](../../packages/llm/llm-deepseek/README.md) fournit l’organisation de référence.

## Vérification

Suivez la [politique de test du dépôt](../testing.md), qui définit la couverture des adaptateurs, les vérifications auprès du fournisseur réel et les exigences applicables aux points d’entrée publiés.
