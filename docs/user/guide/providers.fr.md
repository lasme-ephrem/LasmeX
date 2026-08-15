# Configurer les modèles

Ce guide suppose que vous avez démarré l’interface Web en suivant le [README racine](../../../README.md#run). Les modifications apportées aux modèles prennent effet à la requête suivante, sans redémarrer le serveur.

## Configurer DeepSeek

Ouvrez **Paramètres → Modèles**. La carte DeepSeek contient un champ de clé API ; saisissez la clé, puis enregistrez-la.

![La page Modèles : la carte DeepSeek, suivie des options Ajouter un fournisseur et Ajouter un fournisseur personnalisé](providers-models-page.png)

Les clés sont accessibles en écriture seule. Après l’enregistrement, la page reçoit un descripteur masqué, jamais le secret en clair. La clé est stockée dans `$LASMEX_HOME/.credentials.yaml`, tandis que les paramètres ne conservent que sa référence d’identifiant.

## Ajouter un fournisseur du catalogue

Choisissez **Ajouter un fournisseur**, sélectionnez un fournisseur tel qu’Anthropic ou OpenAI, saisissez sa clé API, puis enregistrez. Le catalogue installé fournit l’endpoint, le protocole et la liste des modèles.

Les fournisseurs dotés d’une authentification native exigent leurs propres identifiants. Bedrock, Vertex, Azure et Codex utilisent respectivement des identifiants AWS et une région, un projet ADC, une `api-version` et OAuth ; renseigner uniquement le champ de clé API ne suffit pas à les configurer.

## Ajouter un fournisseur personnalisé

Choisissez **Ajouter un fournisseur personnalisé** pour une passerelle d’entreprise, un serveur auto-hébergé ou un fournisseur absent du catalogue installé. Indiquez un identifiant de fournisseur en minuscules, une URL de base, un protocole API, un identifiant et au moins un modèle.

![Le formulaire de fournisseur personnalisé : identifiant du fournisseur, nom d’affichage, URL de base, protocole API et clé API](providers-custom-form.png)

L’identifiant du fournisseur est définitif, car les requêtes, les sessions enregistrées, les modèles par défaut et les références d’identifiants l’utilisent. Pour renommer un fournisseur, ajoutez-en un nouveau, puis supprimez l’ancien. Le nom d’affichage, l’URL de base, le protocole, l’identifiant et les modèles restent modifiables.

Dans **Catalogue de modèles**, choisissez **Récupérer les modèles disponibles** pour interroger l’URL de base et l’identifiant actuellement affichés dans le formulaire. La sélection de modèles met à jour le brouillon ; le fournisseur n’est enregistré qu’au moment de la sauvegarde. Les fournisseurs du catalogue utilisent leur catalogue installé sans effectuer de requête réseau.

### Entrée image

Un modèle saisi manuellement est considéré comme limité au texte tant qu’il ne déclare pas le contraire, car aucun endpoint ne permet de demander quelles modalités il accepte. L’ajout d’une image à un tel modèle est refusé avant l’envoi, avec le nom du modèle concerné.

Un modèle de vision rattaché à un fournisseur personnalisé nécessite donc une ligne de configuration. Le formulaire ne comporte aucun champ pour cela ; ajoutez `input` au modèle dans `$LASMEX_HOME/settings.yaml` :

```yaml
llm-pi-ai:
  providers:
    my-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://gateway.example/v1
      models:
        - id: legacy-chat
        - id: vision-preview
          input: [text, image]
```

`input` accepte `text` et `image` et ne s’applique qu’à ce modèle ; une même route peut donc servir les deux types. Si vous omettez ce champ — ou fournissez une liste vide, ce qui revient au même — le modèle conserve les modalités enregistrées dans le catalogue installé. Pour un modèle absent du catalogue, le système utilise la valeur `defaultInput` de la route.

Si tous les modèles saisis manuellement acceptent les images, définissez une seule fois la valeur de repli sur la route au lieu de la répéter sur chaque modèle :

```yaml
llm-pi-ai:
  providers:
    vision-gateway:
      apiKeyEnv: GATEWAY_API_KEY
      api: openai-completions
      baseURL: https://vision.example/v1
      defaultInput: [text, image]
      models:
        - id: first-model
        - id: second-model
```

`defaultInput` est une valeur de repli, pas une substitution, et vaut `[text]` par défaut. Pour un fournisseur du catalogue, ce champ ne s’applique qu’aux modèles que le catalogue ne décrit pas ; il ne retire donc jamais la prise en charge des images à un modèle qui la déclare dans le catalogue. Pour restreindre l’un de ces modèles, définissez son propre champ `input`. Un fournisseur du catalogue ne possède pas de liste `models` où placer ce réglage : inscrivez-le dans `modelOverrides`, avec l’identifiant du modèle comme clé :

```yaml
llm-pi-ai:
  providers:
    anthropic:
      modelOverrides:
        claude-sonnet-4-5:
          input: [text]
```

Chaque liste doit contenir au moins une modalité, sauf celle propre à un modèle, pour laquelle une liste vide équivaut à l’absence du champ. Toute modalité inconnue est refusée, quel que soit son emplacement.

Ces deux champs déclarent les capacités de votre endpoint sans les vérifier. Si un modèle déclare accepter les images alors que son endpoint ne les prend pas en charge, cette incohérence n’est pas détectée ici ; le fournisseur rejette la requête.

## Sélectionner un modèle

Les fournisseurs configurés apparaissent dans le sélecteur de modèles. La sélection d’un modèle le définit également comme modèle par défaut des nouvelles sessions. Une session ayant déjà envoyé une requête conserve le modèle enregistré dans son propre journal.

Si le modèle par défaut enregistré désigne un fournisseur supprimé, la zone de saisie affiche **Sélectionner un modèle** et bloque la saisie jusqu’à ce qu’un autre modèle soit choisi.

## Résolution des problèmes

- **`MISSING_CREDENTIAL`** — Enregistrez la clé du fournisseur depuis la page Modèles ou fournissez la variable d’environnement référencée.
- **`UNKNOWN_MODEL`** — Sélectionnez un modèle configuré ou ajoutez le modèle manquant au fournisseur personnalisé.
- **La récupération des modèles disponibles renvoie une erreur 401** — Vérifiez la clé. La découverte des modèles appelle l’endpoint compatible OpenAI `GET /models` ; saisissez les modèles manuellement si l’endpoint ne le fournit pas.
- **Une image est refusée avant l’envoi** — Le modèle ne déclare aucune modalité image. Ajoutez `input: [text, image]` au modèle d’un fournisseur personnalisé ; la route chat-completions propre à DeepSeek est limitée au texte et ne peut pas être configurée autrement.
- **Le fournisseur rejette une requête contenant une image** — Le modèle déclare accepter les images alors que son endpoint ne les prend pas réellement en charge. Retirez `image` de la liste qui l’a autorisée — le champ `input` du modèle ou le champ `defaultInput` de la route — puis démarrez une nouvelle session : l’image jointe reste dans le journal de session, de sorte que la même requête se répète tant que la session ne l’a pas dépassée.

## Configuration avancée

Le [catalogue généré de configuration des plugins](../../config-catalog.md) répertorie tous les champs pris en charge et leurs valeurs par défaut. Les références [`lasmex-llm-pi-ai`](../../../packages/llm/llm-pi-ai/README.md) et [`lasmex-llm-deepseek`](../../../packages/llm/llm-deepseek/README.md) décrivent la configuration directe dans `settings.yaml`, la résolution du catalogue, les contrôles de raisonnement, les identifiants et les erreurs d’adaptateur.
