# Utiliser l’interface Web

Lancez l’interface Web en suivant le [README racine](../../../README.md#run) ; la commande affiche son URL. Ce guide commence une fois le serveur démarré. Le processus `lasmex` utilise le répertoire depuis lequel il est lancé comme emplacement par défaut du système de fichiers, mais une nouvelle interface Web ne sélectionne aucun espace de travail tant que vous n’en avez pas ajouté un.

## Configurer un modèle

Ouvrez **Paramètres → Modèles**, saisissez une clé API DeepSeek, puis enregistrez-la. La route du modèle devient immédiatement utilisable, sans redémarrer le serveur.

Le [guide de configuration des modèles](./providers.md) présente les autres fournisseurs et les endpoints personnalisés compatibles avec OpenAI.

## Choisir un espace de travail

Cliquez sur **Choisir un espace de travail**, ajoutez le répertoire du projet depuis lequel vous avez démarré `lasmex`, puis sélectionnez-le. La zone de saisie de la session reste indisponible tant qu’aucun espace de travail n’est sélectionné.

## Exécuter une tâche

Démarrez une session et envoyez :

> Résume ce dépôt et identifie ses principaux packages.

L’agent peut lire et modifier les fichiers de l’espace de travail, exécuter des commandes, déléguer du travail et tenir un plan à jour. L’interface Web demande une confirmation avant les opérations qui nécessitent une approbation selon la politique de permissions active.

## Continuer

- [Configurer les modèles](./providers.md)
- [Utiliser le SDK Python](./python-sdk.md)
- [Utiliser les autres modes de la CLI](../../../apps/cli/README.md)
- [Développer un plugin](../develop/basic/)
