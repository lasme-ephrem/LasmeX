# Tutoriel Cordis

Cordis est le framework de plugins sur lequel repose LasmeX : un environnement d’exécution compact où chaque capacité — outils, adaptateurs LLM, accès aux fichiers et boucle d’agent comprise — est un plugin monté dans un contexte partagé. Ce tutoriel vous enseigne Cordis par la pratique : chaque chapitre propose un exemple exécutable que vous construisez dans un répertoire temporaire de ce dépôt, jusqu’à intégrer un plugin aux véritables services de LasmeX.

Il s’adresse aux développeurs d’agents. Une maîtrise approfondie de TypeScript n’est pas nécessaire : les [notes sur TypeScript](#typescript-notes) ci-dessous expliquent les syntaxes qui pourraient vous être inconnues, et chaque chapitre fournit les commandes exactes ainsi que le résultat attendu.

Si vous préférez une présentation conceptuelle condensée à ce parcours guidé, consultez le [guide d’introduction à Cordis](../cordis-primer.md). La référence exhaustive de l’API se trouve dans les régions `cordis-surface` générées des [pages des sous-systèmes](../subsystems/core.md) et dans les pages de l’[API principale de Cordis](../cordis-api/context.md).

Pour écrire des plugins destinés à LasmeX — chargés depuis un fichier `cordis.yml` et pilotés depuis l’interface Web plutôt que par le lanceur ci-dessous — commencez par [votre premier plugin LasmeX](../user/develop/basic/index.md).

<a id="setup"></a>

## Installation

Vous avez besoin d’un clone de ce dépôt dont les dépendances sont installées ; le [guide de développement](../development.md#setup-tutorial) énumère les prérequis. Ce tutoriel ne nécessite aucune clé API : tous les exemples s’exécutent sans clé.

```sh
git clone https://github.com/lasme-ephrem/LasmeX.git
cd deepseek-harness
pnpm install
```

Créez le répertoire temporaire utilisé dans les chapitres. `tmp/` est ignoré par Git : aucun fichier que vous y écrivez ne sera suivi.

```sh
mkdir -p tmp/cordis-tutorial
cd tmp/cordis-tutorial
```

Chaque chapitre exécute la même commande depuis ce répertoire :

```sh
node --import tsx ../../vendor/cordis/bin.js
```

Ce lanceur, qui tient dans un seul fichier (voir [vendor/cordis/bin.js](../../vendor/cordis/bin.js)), crée un `Context` racine, monte le plugin Loader et lui demande de charger `./cordis.yml` depuis le répertoire courant. Tout le reste — les plugins disponibles et leur configuration — provient de ce fichier YAML, que vous allez bientôt écrire. L’option `--import tsx` permet à Node d’exécuter les fichiers TypeScript indiqués par la configuration sans étape de compilation.

## Chapitres

1. [Votre premier plugin](01-first-plugin.md) — un plugin est une fonction que le Loader monte.
2. [Cycle de vie et effets](02-lifecycle-and-effects.md) — les enregistrements gérés par Cordis sont annulés lorsque leur plugin est déchargé.
3. [Services](03-services.md) — exposez une capacité sur `ctx` et déclarez-en la dépendance avec `inject`.
4. [Événements](04-events.md) — événements typés, diffusion et court-circuit d’une waterfall.
5. [Configuration](05-config.md) — configuration validée depuis `cordis.yml` et échec explicite en cas d’entrée incorrecte.
6. [Composition et HMR](06-composition-and-hmr.md) — le fichier de configuration comme arbre de plugins, le remplacement à chaud et le diagnostic d’un plugin qui ne se charge jamais.
7. [Intégration à LasmeX](07-into-the-harness.md) — enregistrez un outil appelable par le modèle auprès des véritables services de LasmeX.

<a id="typescript-notes"></a>

## Notes sur TypeScript

Les exemples emploient trois fonctionnalités TypeScript qui vont au-delà du JavaScript moderne ordinaire :

- Les **annotations de type** décrivent les valeurs sans modifier le comportement à l’exécution : `ctx: Context` indique que `ctx` expose l’API de contexte Cordis, `who: string` accepte du texte et `string[]` représente un tableau de chaînes.
- **`import type { Context } from '@deepseek-ai/cordis'`** importe uniquement des informations de type. Cet import disparaît à l’exécution ; un fichier de plugin qui utilise `Context` seulement dans ses annotations n’ajoute donc aucune dépendance d’exécution.
- La **fusion de déclarations** (`declare module '@deepseek-ai/cordis' { ... }`) ajoute vos entrées aux interfaces déjà déclarées par Cordis, par exemple le type d’une nouvelle propriété `ctx.greeter` ou d’un nom d’événement. Elle ne génère aucun câblage à l’exécution : le plugin doit fournir le service ou émettre l’événement séparément. Le chapitre 3 présente ce modèle en entier.

Le chapitre 5 utilise aussi une `interface` pour décrire les champs d’un objet de configuration et un type générique comme `Schema<Config>` pour indiquer quels champs un schéma valide. Vous pouvez reprendre ces déclarations telles quelles ; le texte qui les accompagne explique le rôle de chacune.

[![](https://img.shields.io/badge/powered_by-LasmeX-4D6BFE?style=flat-square)](https://github.com/lasme-ephrem/LasmeX)
