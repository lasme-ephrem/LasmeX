# 1. Votre premier plugin

Dans la configuration du Loader utilisée ici, un module de plugin Cordis exporte une fonction nommée `apply`. Lorsque Cordis charge ce module, il appelle `apply` avec un **contexte** : l’objet `ctx` par lequel le plugin enregistre toutes ses contributions.

## Écrire le plugin

Dans votre répertoire `tmp/cordis-tutorial` (voir l’[installation](index.md#setup)), créez `hello.ts` :

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('hello from my first plugin')
}
```

L’exportation `name` fournit une métadonnée d’affichage facultative ; elle identifie le plugin dans les diagnostics.

## Composer l’application

Le lanceur de ce tutoriel assemble l’application depuis la configuration. Créez `cordis.yml` :

```yaml
- name: './hello.ts'
```

Le fichier est une liste d’entrées de plugins. `name` est un spécificateur de module — un chemin relatif ou le nom d’un package npm — et le Loader monte chaque entrée. Toutes les entrées démarrent simultanément : leur position dans la liste ne garantit donc pas l’ordre de chargement. Cet ordre provient des dépendances de services (`inject`, [chapitre 3](03-services.md)), pas de la position dans le fichier.

## L’exécuter

```sh
node --import tsx ../../vendor/cordis/bin.js
```

Résultat attendu :

```
hello from my first plugin
```

Le processus se termine de lui-même lorsque plus aucune tâche n’est active. Voici ce qui s’est passé :

1. Le lanceur a créé un `Context` racine et monté le plugin **Loader**.
2. Le Loader a lu `cordis.yml`, résolu `./hello.ts` et l’a monté comme plugin enfant.
3. Cordis a appelé votre fonction `apply(ctx)`.

Votre fichier ne contient aucun code d’amorçage du framework : un plugin décrit ses contributions et `cordis.yml` compose l’application. La configuration [LasmeX base](../../packages/bundle/base/cordis.patch.yml), par exemple, compose davantage de plugins et reçoit les surcharges de déploiement.

## Les deux autres formes de plugin

La fonction est la forme la plus courante, mais Cordis en accepte trois :

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

// 1. Function plugin (what you just wrote).
export function apply(ctx: Context) {}

// 2. Object plugin: an object with an `apply` method.
export const objectPlugin = {
  name: 'object-plugin',
  apply(ctx: Context) {},
}

// 3. Class plugin: a Service subclass (covered in chapter 3).
export class MyService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myTutorialService')
  }
}
```

Utilisez la forme fonctionnelle tant que vous n’avez pas besoin d’exposer un service ; le [chapitre 3](03-services.md) explique quand la forme fondée sur une classe se justifie.

## Provoquer une erreur

Modifiez `apply` pour qu’elle lève une exception :

```ts ignore-check
export function apply(ctx: Context) {
  throw new Error('apply exploded')
}
```

Relancez la commande : le processus s’arrête avec votre erreur. L’échec du chargement d’un plugin est signalé explicitement ; l’entrée n’est pas ignorée.

Attention toutefois : lorsqu’un module indiqué dans la configuration ne peut pas être **résolu** — à cause d’une faute dans le chemin ou le nom du package — l’erreur passe par le service de journalisation Cordis au lieu de faire planter le processus. Au démarrage, ce message peut se perdre avant qu’un exporteur vers la console soit à l’écoute. Si une entrée nouvellement ajoutée semble ne rien faire, vérifiez d’abord son orthographe.

Suite : [Cycle de vie et effets](02-lifecycle-and-effects.md) — ce qui se produit lorsqu’un plugin est déchargé.

[![](https://img.shields.io/badge/powered_by-LasmeX-4D6BFE?style=flat-square)](https://github.com/lasme-ephrem/LasmeX)
