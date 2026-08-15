# Introduction à Cordis

Cordis est le framework de plugins intégré à LasmeX. Cette introduction présente les notions de Cordis dont l’auteur d’un plugin LasmeX a besoin avant de consulter la référence générée des services et événements dans les [pages des sous-systèmes](subsystems/core.md). Le [tutoriel Cordis](cordis-tutorial/index.md) permet de mettre en pratique les mêmes notions. Le code source intégré et la procédure de synchronisation se trouvent dans [vendor/README.md](../vendor/README.md).

## Cordis en cinq notions

- **Un plugin est un objet qui implémente un service.** Il peut s’agir d’une fonction dotée des champs facultatifs `inject` et `apply(ctx)`, ou d’une sous-classe de `Service` dont Cordis monte le cycle de vie dans le contexte courant.
- **Un contexte est un registre de services.** Un service réserve dans un contexte une clé stable `ctx.<key>`, comme `ctx.tools`, `ctx.llm` ou `ctx.sessions`. Les autres plugins trouvent le service par sa clé au lieu d’importer une implémentation concrète.
- **Les dépendances de service se déclarent avec `inject`.** Un plugin qui énumère des services obligatoires attend leur disponibilité. L’ordre de chargement découle donc des dépendances entre services plutôt que d’une séquence de démarrage écrite à la main.
- **Les événements typés assurent la communication.** Les services déclarent les noms d’événements par fusion de déclarations TypeScript, puis les répartissent avec `emit`, `waterfall`, `parallel` ou `serial` selon que les écouteurs doivent observer, envelopper, s’exécuter simultanément ou s’exécuter dans l’ordre.
- **Les enregistrements sont des effets réversibles.** Les sections d’invite, schémas d’outils, adaptateurs, fournisseurs et écouteurs sont installés avec `ctx.effect()` ou `ctx.on()`, afin que leur rechargement et leur démontage les retirent de manière prévisible.

## Modes de répartition
<a id="dispatch-modes"></a>

Chaque événement possède l’un des modes de répartition suivants et doit être émis par la méthode correspondante.

| Mode | Attendu ? | Ordre de répartition | Valeur renvoyée ? |
|---|---|---|---|
| `emit` | Non | les écouteurs observent dans l’ordre d’enregistrement | Non |
| `waterfall` | Non | les écouteurs observent dans l’ordre d’enregistrement | Oui |
| `parallel` | Oui | tous les écouteurs observent l’événement en parallèle | Non |
| `serial` | Oui | les écouteurs observent dans l’ordre d’enregistrement | Oui |

Le mode de répartition fait partie du contrat public de l’événement. Les nouveaux événements de LasmeX le documentent avec une balise `@mode`, afin que le catalogue généré puisse comparer les déclarations aux sites de répartition.

## Sémantique des cascades Cordis
<a id="cordis-waterfall-semantics"></a>

`ctx.waterfall` est un intergiciel enveloppant. Un écouteur reçoit `(...args, next)`. Appelez `next()` pour déléguer le résultat, éventuellement enveloppé, au service suivant ; renvoyez une valeur sans appeler `next()` pour interrompre la cascade. Les valeurs se propagent au moyen de la valeur renvoyée par `next()`.

Les écouteurs coopératifs modifient généralement un objet partagé de requête ou de décision, puis délèguent. Un écouteur peut aussi remplacer entièrement le résultat ; les écouteurs suivants ne verront alors que le résultat remplacé. N’utilisez `prepend: true` que lorsque l’écouteur doit s’exécuter avant les enregistrements ordinaires.

Pour les événements qui produisent une seule décision, l’interruption est voulue. Un écouteur de politique peut renvoyer une valeur sans appeler `next()` lorsqu’il prend la décision, tandis qu’un écouteur qui se contente d’annoter ou d’observer doit déléguer.

## Configuration du chargeur
<a id="loader-configuration"></a>

`@deepseek-ai/cordis-plugin-include` analyse `!!js` sous forme de nœuds d’expression. Le chargeur interpole le champ `config` d’une entrée après l’activation des injections déclarées, dans le contexte du plugin (`ctx.serviceName`), et son champ `disabled` à chaque décision de montage, dans le contexte du chargeur. Include conserve les expressions des lignes imbriquées jusqu’à l’activation de la cible. Les autres métadonnées d’entrée restent littérales. Utilisez des surcharges lorsque l’environnement détermine les plugins à charger.

## Règles pratiques

Encapsulez le comportement dans des plugins : un événement du pipeline d’outils appartient à `ctx.tools`, le streaming du modèle à `ctx.llm` et la coordination en direct des agents à `ctx.agents`. Préférez les événements pour l’interception et les politiques ; préférez les méthodes de service pour les appels directs de fonctionnalités.

Chaque enregistrement doit disposer d’une fonction de nettoyage, soit renvoyée depuis `ctx.effect()`, soit fournie par un utilitaire Cordis. Si l’ordre de démontage est important, regroupez les opérations concernées dans un même effet afin qu’elles soient retirées dans l’ordre voulu.
