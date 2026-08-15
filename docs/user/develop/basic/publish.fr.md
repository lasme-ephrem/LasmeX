# Empaqueter et installer un plugin

Les tutoriels précédents ont chargé un plugin local au moyen d’une surcouche `--patch`. Ce tutoriel l’empaquette sous forme de **bundle** installable, l’installe dans un **profil** avec `lasmex plugin add` et explique l’ordre des couches qui détermine la configuration composée. Il suppose que la CLI `lasmex` est installée. Terminez d’abord la [configuration d’un plugin](./config.md).

Pour utiliser à la place une copie de travail récente des sources, suivez la section [lancer depuis les sources](../../../../README.md#run-from-source), conservez le répertoire `hello-plugin` de ce tutoriel à la racine du dépôt et exécutez depuis cette racine les commandes `lasmex ...` restantes sous la forme `pnpm lasmex ...`. Consultez l’[exécution depuis les sources](../../../../apps/cli/reference/README.md#source-execution) pour le comportement de la construction et du lanceur.

## Deux concepts, deux manifestes

L’installation repose sur deux concepts. Tous deux sont décrits par un `package.json`, mais transportent des types de manifestes différents sous la clé `lasmex` et répondent à des questions distinctes :

- Un **bundle** est un package npm qui livre une couche de configuration. Son manifeste déclare `lasmex.bundle` et répond à la question « que fournit ce package ? » : un fichier de patch qui insère ou remplace des lignes de plugins.
- Un **profil** est un répertoire sous `$LASMEX_HOME/profiles/<name>` qui décrit une composition exécutable. Son manifeste déclare `lasmex.profile` et répond à la question « quels bundles composent cette configuration, et dans quel ordre ? ».

Vous créez et distribuez un bundle ; l’utilisateur démarre un profil avec `lasmex --profile <name>`. Un même élément ne peut pas remplir les deux rôles.

### Le manifeste du bundle

Créez le répertoire du package :

```sh
mkdir -p hello-plugin
```

```
hello-plugin/
├── package.json       # declares lasmex.bundle
├── cordis.patch.yml   # the layer applied when a profile lists this bundle
└── index.js           # plugin modules the patch rows reference
```

Créez `hello-plugin/package.json` :

```json
{
  "name": "lasmex-hello-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "lasmex": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

Créez le point d’entrée du plugin dans `hello-plugin/index.js` :

```js
export const name = 'hello-plugin'

export function apply() {
  console.log('[hello-plugin] plugin loaded!')
}
```

Créez `hello-plugin/cordis.patch.yml`. Le patch est un tableau YAML semblable aux surcouches `--patch` déjà écrites, à ceci près que ses lignes de plugins désignent le package par son nom et non par un chemin source relatif. La résolution de Node peut ainsi trouver le code installé :

```yaml
- insert:
    - id: hello
      name: lasmex-hello-plugin
```

Un package dépourvu de déclaration `lasmex.bundle` s’installe tout de même, mais seulement comme dépendance ordinaire : `lasmex plugin` affiche un avertissement et n’active aucune couche. Employez ce format pour une bibliothèque importée par des packages de plugins, plutôt que pour un plugin activé par les utilisateurs.

### Le manifeste du profil

Un répertoire de profil contient deux fichiers :

- `package.json` — les dépendances de plugins externes au dépôt, gérées par pnpm, ainsi que le manifeste `lasmex.profile` et sa liste ordonnée `bundles` ;
- `cordis.patch.yml` — la couche de patch propre à l’utilisateur, appliquée après toutes les couches de bundles.

Vous ne rédigez jamais le manifeste d’un profil à la main : `lasmex plugin` le crée et le maintient. La section suivante présente le résultat.

## Installer dans un profil

`lasmex plugin --profile <name> <args...>` transmet la commande à pnpm dans le répertoire du profil. Tous les verbes de pnpm sont donc disponibles. Depuis le répertoire qui contient `hello-plugin`, installez la copie de travail du package :

```sh
lasmex plugin --profile demo add ./hello-plugin
```

La première utilisation initialise le profil, avec `lasmex-base` comme premier bundle. pnpm lie ensuite le checkout et `lasmex` ajoute le bundle à `lasmex.profile.bundles`, puisque le package déclare `lasmex.bundle` :

```json
{
  "name": "lasmex-profile-demo",
  "private": true,
  "dependencies": {
    "lasmex-hello-plugin": "link:/path/to/hello-plugin"
  },
  "lasmex": {
    "profile": {
      "bundles": [
        "lasmex-base",
        "lasmex-hello-plugin"
      ]
    }
  }
}
```

Vérifiez la couche sans démarrer l’application, puis démarrez-la :

```sh
lasmex --profile demo --dump-config   # shows a "# == lasmex-hello-plugin" layer
lasmex --profile demo
```

`lasmex plugin --profile demo remove lasmex-hello-plugin` retire à la fois la dépendance et la couche.

## Ordre de chargement

La configuration effective est composée au-dessus d’une racine vide, en appliquant dans cet ordre :

1. Chaque patch de bundle nommé dans la liste `lasmex.profile.bundles` du profil, dans l’ordre de la liste : `lasmex-base` d’abord, puis chaque bundle installé dans son ordre d’ajout.
2. Le fichier `cordis.patch.yml` propre au profil.
3. Le fichier `$LASMEX_HOME/cordis.patch.yml` du répertoire personnel : les préférences locales à la machine partagées par tous les profils.
4. Chaque surcouche `--patch <path>`, dans l’ordre d’argv.

Les arguments de l’application ne constituent pas une couche de patch supplémentaire. Un bundle de surface peut les résoudre au moyen d’un service ordinaire appartenant à l’application, comme décrit plus bas.

Pour une même ligne, les couches ultérieures l’emportent. Un patch remplace toute la valeur `config` d’une ligne au lieu de fusionner ses clés en profondeur. Cela entraîne deux conséquences pour les auteurs de bundles :

- Votre patch peut remplacer par son `id` une ligne provenant d’une couche antérieure, comme le fait [le bundle `lasmex-web-app`](../../../../packages/bundle/web-app/cordis.patch.yml) avec des lignes de `lasmex-base`, mais il doit répéter toutes les clés nécessaires à cette ligne et pas uniquement celles qui changent.
- Les utilisateurs peuvent remplacer vos lignes dans le fichier `cordis.patch.yml` de leur profil sans modifier votre package. Choisissez donc des valeurs de configuration par défaut qu’ils conserveront probablement et laissez le schéma gérer le reste.

Les noms des bundles intégrés sont toujours résolus depuis l’installation de LasmeX elle-même. pnpm ne gère que les packages externes au dépôt ; votre bundle peut donc compter sur la présence et l’actualité de `lasmex-base`.

## Donner sa propre ligne de commande à un bundle de surface

Un bundle qui définit une application exécutable monte un plugin fournisseur ordinaire :

```yaml
- id: hello-startup
  name: 'lasmex-hello-plugin/startup'
```

Le plugin exporte `inject = ['cmdlineArgs']`, appelle `parseCmdline` depuis [`lasmex-cmdline`](../../../../packages/boot/cmdline/README.md) avec son propre programme commander, puis fournit son service appartenant à l’application depuis l’action du programme. Le lanceur transmet à chaque plugin le même instantané immuable des arguments qui suivent ses propres options. Les options propres à l’application ne nécessitent donc aucune modification du lanceur et plusieurs plugins peuvent analyser cet instantané. La ligne Loader n’a besoin d’aucun marqueur du lanceur ni d’aucun type spécial.

Les lignes configurées par ces arguments injectent le service du fournisseur et le lisent dans leurs propres options `!!js`, avec la valeur de déploiement indiquée à côté comme solution de repli :

```yaml
- id: my-app
  name: '@example/my-app'
  inject: [myAppStartup]
  config:
    port: !!js ctx.myAppStartup.port ?? 8080
```

Avec `--help`, le fournisseur ne publie aucun service : ces lignes ne sont donc jamais activées. Loader monte une seule fois la composition, attend les injections ordinaires de chaque ligne, puis évalue seulement la configuration `!!js` de cette ligne dans son contexte injecté.

## Installation depuis GitHub : attention au script de construction

La publication dans un registre n’est pas obligatoire : les utilisateurs peuvent installer directement depuis un hébergeur Git.

```sh
lasmex plugin --profile demo add github:you/hello-plugin
```

Une installation Git récupère toutefois **les sources, pas les artefacts construits**. Votre script `build` n’est pas exécuté : un package TypeScript arrive sans sa sortie `lib/` et ne peut pas se charger. Deux opérations sont nécessaires, une de chaque côté :

- **L’auteur** fournit un script `prepare`, que pnpm exécute après une installation Git, capable de construire les points d’entrée publiés depuis les sources de façon autonome. Il ne doit pas dépendre d’un contexte réservé au développement, comme le checkout voisin d’un monorepo. [turtle-ui](https://github.com/deepseek-harness/turtle-ui) est un exemple fonctionnel : son script `prepare` utilise une configuration tsdown dédiée qui transpile `src/` sans références de projet ni vérification de types.
- **L’utilisateur** autorise explicitement la construction. Depuis pnpm 10, le script `prepare` d’une dépendance Git n’est pas exécuté tant qu’il n’est pas autorisé. Le premier `add` échoue donc, puis `lasmex` indique la correction : recopiez exactement la clé de package affichée par pnpm dans le fichier `pnpm-workspace.yaml` du profil.

  ```yaml
  allowBuilds:
    lasmex-hello-plugin: true
  ```

  Relancez ensuite `add`.

Traitez cette autorisation pour ce qu’elle est : **la permission d’exécuter le code du package sur votre machine pendant l’installation**, en dehors de tout sandbox employé par l’agent. N’autorisez que les packages dont vous avez vérifié les sources et épinglez un commit (`github:you/hello-plugin#<sha>`) afin qu’un envoi ultérieur ne puisse pas changer silencieusement le code exécuté.

Si vous ne voulez pas demander cette autorisation aux utilisateurs, distribuez plutôt des artefacts déjà construits. Aucun de ces deux formats n’exige d’autorisation de construction :

- **Publiez sur npm** avec `lib/` construit au moment de `pnpm publish`. `lasmex plugin add your-package` installe alors le code prêt à l’emploi.
- **Livrez une archive** produite par `pnpm pack`. Les utilisateurs exécutent `lasmex plugin add ./hello-plugin-0.1.0.tgz`.

## Étapes suivantes

- [Plugins et cycle de vie](../framework/) — le cycle de vie complet des plugins
- [Référence du comportement de la CLI](../../../../apps/cli/reference/README.md) — priorité exacte des couches, options et fonctionnement des profils
