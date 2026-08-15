# 6. Composition et rechargement à chaud

Chaque capacité construite jusqu’ici est un plugin, et `cordis.yml` sélectionne l’arbre de plugins de l’application. Ce chapitre modifie cette composition, recharge un plugin à chaud et aide à diagnostiquer un plugin qui ne se charge jamais.

## Une entrée ne se résume pas à un nom

Une entrée de configuration accepte d’autres métadonnées que `name` et `config` :

```yaml
- id: greeter          # stable identity for this entry
  name: './greeter.ts'
- id: consumer
  name: './consumer.ts'
  disabled: true       # keep the entry, skip mounting it
```

`id` attribue une identité stable à l’entrée, ce qui permet au chargeur de distinguer la modification d’une entrée existante d’une suppression suivie d’un ajout. `disabled: true` démonte un plugin sans supprimer son entrée : repassez cette valeur à faux pour recharger le plugin, ainsi que tout ce qui attendait ses services à l’état PENDING.

Les groupes imbriquent une sous-liste d’entrées qui se chargent et se déchargent comme un ensemble. De son côté, `isolate` donne au groupe sa propre instance d’un nom de service : deux groupes peuvent ainsi utiliser chacun un fournisseur `shell` configuré différemment sans interférer. L’[introduction à Cordis](../cordis-primer.md) et l’[exemple d’isolation des services](../user/develop/framework/service.md#service-isolation) présentent ces mécanismes en détail.

## Rechargement de module à chaud

Puisque le déchargement libère les effets ([chapitre 2](02-lifecycle-and-effects.md)) et que le chargement suit les dépendances ([chapitre 3](03-services.md)), le rechargement à chaud peut remplacer un plugin en cours d’exécution en le déchargeant puis en le rechargeant. Le plugin `@deepseek-ai/cordis-plugin-hmr` surveille vos fichiers et effectue précisément cette opération à chaque enregistrement.

Dans `tmp/cordis-tutorial`, créez `cordis.yml` :

```yaml
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
- id: hmr
  name: '@deepseek-ai/cordis-plugin-hmr'
  config:
    root: ['.']
- id: hello
  name: './hello.ts'
```

Deux plugins auxiliaires ont rejoint la liste. Le rechargement à chaud écrit ses messages via le service de journalisation Cordis : sans exportateur vers la console, vous ne les verriez pas. Il utilise aussi ses `inject` pour demander le service `timer` afin de temporiser les événements : sans `@deepseek-ai/cordis-plugin-timer`, il reste silencieusement à l’état PENDING. Ce silence fait l’objet de la section suivante.

Le rechargement à chaud accède aux mécanismes internes du chargeur Node par l’intermédiaire de l’utilitaire natif du Loader. Exécutez Cordis avec tsx :

```sh
node --import tsx ../../vendor/cordis/bin.js
```

Modifiez maintenant `hello.ts` — changez le message journalisé — puis enregistrez le fichier :

```
hello from my first plugin
2026-07-22 15:44:36 [I] hmr watching [ '.' ]
2026-07-22 15:44:39 [I] hmr reload plugin at hello.ts
hello from my EDITED plugin
```

L’ancienne instance a été déchargée et tous ses effets ont été annulés ; le nouveau code a ensuite été chargé, puis `apply` s’est exécuté de nouveau. Arrêtez le processus avec Ctrl-C. Les modifications de `cordis.yml` sont elles aussi détectées : le chargeur compare les entrées selon leur `id` et ne monte, démonte ou reconfigure que celles qui ont changé. C’est pourquoi les entrées précédentes possèdent un `id` explicite. Sans celui-ci, une entrée reçoit un identifiant généré à chaque lecture ; après toute modification du fichier de configuration, elle est donc considérée comme supprimée puis ajoutée et se remonte même si ses propres lignes n’ont pas changé.

## Diagnostiquer un plugin qui ne se charge jamais

Le chargement piloté par les dépendances a une contrepartie : si le champ `inject` d’un plugin désigne un service qu’aucun autre ne fournit, ce plugin attend indéfiniment sans rien afficher. Il ne s’agit pas d’une erreur : PENDING est un état légitime, puisque le fournisseur peut être monté ultérieurement.

Vous pouvez consulter directement ces états. Chaque contexte peut parcourir le registre de plugins ; créez `diagnose.ts` :

```ts
import { FiberState, type Context } from '@deepseek-ai/cordis'

export const name = 'diagnose'

export function apply(ctx: Context) {
  setTimeout(() => {
    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        if (fiber.state === FiberState.PENDING) {
          console.log(`${fiber.name} is PENDING — a required service is missing`)
        }
      }
    }
  }, 500)
}
```

Ajoutez ensuite un plugin doté d’une dépendance impossible à satisfaire, dans `needs-timer.ts` :

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'needs-timer'
export const inject = ['timer']

export function apply(ctx: Context) {
  console.log('needs-timer loaded')
}
```

```yaml
- name: './needs-timer.ts'
- name: './diagnose.ts'
```

Exécutez cet exemple avec la commande simple `node --import tsx ../../vendor/cordis/bin.js`, puis arrêtez-le avec Ctrl-C :

```
needs-timer is PENDING — a required service is missing
```

`inject: ['timer']` ne trouve aucun fournisseur. Ajoutez `- name: '@deepseek-ai/cordis-plugin-timer'` à la liste pour que le plugin se charge. Lorsqu’un plugin ne fait rien et n’affiche aucun diagnostic, inspectez l’état de sa fibre. En parcourant le registre sans filtrer l’état PENDING, vous verrez aussi les plugins propres au chargeur (Loader et Include) sous forme de fibres ACTIVE, car ce sont des plugins qui montent le fichier de configuration lui-même.

Suite : [Passer au harness](07-into-the-harness.md) — les mêmes principes appliqués aux véritables services du harness.

[![](https://img.shields.io/badge/powered_by-LasmeX-4D6BFE?style=flat-square)](https://github.com/lasme-ephrem/LasmeX)
