# Démarrer avec le SDK Python

Ce tutoriel présente l’alternative programmatique à l’interface Web. Il installe le SDK Python publié, exécute une composition d’agent versionnée dans le dépôt et montre comment appeler la même API depuis votre propre programme.

## Prérequis

- Python 3.10 ou une version ultérieure
- Un checkout des sources de LasmeX
- Linux x64, Linux arm64 ou macOS 14 ou une version ultérieure sur arm64
- Un endpoint compatible avec DeepSeek et un identifiant d’accès
- Un espace de travail isolé que l’agent peut modifier

## Installer le SDK

Ouvrez un checkout des sources de LasmeX pour utiliser son exemple exécutable, créez un environnement virtuel, puis installez le SDK avec son runtime intégré de même version :

```sh
cd /path/to/lasmex
python -m venv .venv
. .venv/bin/activate
python -m pip install lasmex-sdk
```

Le runtime installé ne nécessite aucun Node.js système. Les contributeurs du dépôt qui doivent compiler le runtime ou les wheels depuis les sources doivent suivre les [procédures Python pour les contributeurs](../../../python/development.md).

## Exécuter l’exemple versionné dans le dépôt

Définissez l’identifiant d’accès dans l’environnement. Définissez également `DEEPSEEK_BASE_URL` lorsque le modèle est servi par un proxy compatible avec OpenAI plutôt que par l’endpoint DeepSeek par défaut.

```sh
export DEEPSEEK_API_KEY=sk-your-key-here
# export DEEPSEEK_BASE_URL=http://127.0.0.1:8000/v1
# export LASMEX_MODEL=deepseek-v4-flash
# export LASMEX_SYSTEM_PROMPT='You are a helpful software engineer assistant.'
```

Les contrôles du runtime utilisent l’espace de noms d’environnement `LASMEX_*`. Les distributions, modules, classes, exécutables et identités serveur Python utilisent la même identité produit LasmeX.

Exécutez une tâche dans un espace de travail et un répertoire de session isolés :

```sh
python examples/jsonrpc-agent/minimal.py \
  --workspace /absolute/path/to/workspace \
  --session-root /absolute/path/to/sessions \
  --session-id example-001 \
  "Inspect the repository and fix the failing tests."
```

Le script affiche la réponse finale de l’assistant. Le répertoire de session reçoit un journal JSONL contenant les requêtes de modèle assemblées et les appels d’outils.

## Utiliser le SDK dans votre propre programme

L’exemple versionné dans le dépôt est une fine couche autour de cet appel au SDK :

```python
from pathlib import Path

from lasmex import LasmeX

config = Path("examples/jsonrpc-agent/minimal.cordis.yml").resolve()
workspace = Path("/absolute/path/to/workspace").resolve()
sessions = Path("/absolute/path/to/sessions").resolve()

with LasmeX(
    provider="deepseek-official",
    model="deepseek-v4-flash",
    max_tokens=49_152,
    cwd=str(workspace),
    session_root=str(sessions),
    cordis=str(config),
) as lasmex:
    result = lasmex.run(
        "Inspect the repository and fix the failing tests.",
        session_id="example-001",
    )

print(result.final_response)
```

`LasmeX` démarre le runtime intégré à la demande et le réutilise jusqu’à la sortie du gestionnaire de contexte. La réutilisation de la même instance LasmeX et du même identifiant de session conserve le processus Bash propre à la session, notamment son répertoire de travail, ses variables exportées et ses fonctions shell. Utilisez un nouvel identifiant de session pour une tâche indépendante ; ne réutilisez un identifiant que si l’appel suivant doit poursuivre la même conversation durable.

## Comprendre la composition de l’exemple

| Propriété | Valeur |
|---|---|
| Prompt système | `LASMEX_SYSTEM_PROMPT`, avec `You are a helpful software engineer assistant.` comme valeur de repli |
| Modèle dans `minimal.py` | `--model`, puis `LASMEX_MODEL`, puis `deepseek-v4-flash` |
| Outils exposés au modèle | `bash` persistant et `str_replace_editor` uniquement |
| Délai d’expiration Bash | 300 secondes |
| Limite de sortie de l’éditeur | 16 000 caractères |
| Compression du contexte | Désactivée |
| Système de fichiers | Backend local brut ; les chemins absolus de l’éditeur peuvent désigner tout chemin visible par le processus du runtime |
| Persistance de session | JSONL non compressé sous `LASMEX_SESSION_ROOT` |

La composition omet l’identité du harness, le texte de prompt de l’espace de travail, les skills, Bash en exécution unique, les outils de tâche, la compression et tous les autres plugins exposés au modèle. Les informations sur la politique de bac à sable sont consignées comme contexte utilisateur du runtime au lieu d’être ajoutées au prompt système.

## Choisir l’espace de travail et les identifiants de session

`cwd` sélectionne l’espace de travail accessible à l’agent, tandis que `session_root` stocke les journaux et l’état des sessions. Utilisez un nouvel identifiant de session pour une tâche indépendante ; ne réutilisez un identifiant que si l’appel suivant doit poursuivre la même conversation et le même état de shell persistant.

La composition utilise `danger-full-access`. Exécutez-la uniquement dans un checkout jetable ou un conteneur : Bash et l’éditeur peuvent modifier tout chemin autorisé au processus du runtime. Le backend PTY persistant nécessite un environnement de terminal POSIX ; cette composition ne prend donc pas en charge les agents Windows.

La [référence de l’exemple `jsonrpc-agent`](../../../examples/jsonrpc-agent/README.md) décrit la composition exacte. La [référence du SDK Python](../../../python/sdk/README.md) couvre le cycle de vie, les résultats, les notifications, la sélection du runtime et la configuration ; l’[introduction à Cordis](../../cordis-primer.md) présente la syntaxe de composition.
