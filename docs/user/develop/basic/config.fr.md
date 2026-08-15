# Configuration d’un plugin

Acceptez la configuration fournie par `cordis.yml`.

## Définir le type Config

Exportez un type `Config` et un schéma Schemastery portant le même nom. Déclarez les valeurs par défaut directement sur les champs du schéma :

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'my-plugin'

export interface Config {
  greeting: string
  maxRetries: number
  verbose?: boolean
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
  verbose: Schema.boolean().default(false),
})

export function apply(ctx: Context, config: Config) {
  console.log(config.greeting)  // User value or schema default.
}
```

Ajoutez la configuration à la ligne du plugin local insérée dans `scratch-plugin/cordis.yml` :

```yaml
- insert:
    - id: hello
      name: './src/my-plugin.ts'
      config:
        greeting: 'Hi there'
        maxRetries: 5
```

Lors du chargement du plugin, Cordis utilise le schéma exporté pour valider la configuration et compléter les valeurs par défaut. N’exportez pas un objet ordinaire sous le nom `Config` : il n’implémente pas l’interface Standard Schema requise par Cordis.

## Validation du schéma

Utilisez Schemastery pour exprimer des contraintes plus strictes :

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'validated-plugin'

export interface Config {
  apiKey: string
  timeout: number
  mode: 'fast' | 'accurate'
}

export const Config = Schema.object({
  apiKey: Schema.string().required(),
  timeout: Schema.number().default(30000),
  mode: Schema.union(['fast', 'accurate']).default('fast'),
})

export function apply(ctx: Context, config: Config) {
  // config is validated and type-safe.
}
```

Le schéma est évalué pendant le chargement du plugin. Une configuration invalide interrompt le chargement avec un message exploitable.

## Principes de conception

### Ne pas coder en dur les valeurs ajustables

LasmeX exige que **toute valeur que deux déploiements pourraient vouloir régler différemment soit un champ de configuration**.

```ts
// Wrong: hardcoded timeout.
const TIMEOUT = 30000

// Correct: configurable.
export interface Config {
  timeoutMs: number  // Defaults to 30000.
}
```

Le critère est simple : `cordis.yml` doit pouvoir changer la valeur sans modification du code.

### Échouer explicitement en cas de configuration invalide

Exprimez les contraintes autonomes dans le schéma afin qu’une configuration invalide échoue dès le chargement du plugin. Les références à des services ou à des ressources enregistrées nécessitent l’injection de dépendances ; le [tutoriel sur les services](../framework/service.md) présente cette obligation.

## Travailler avec le HMR

Une modification de configuration remplace le plugin à chaud : le framework décharge l’ancienne instance et en charge une nouvelle. Comme les enregistrements sont des effets et se nettoient eux-mêmes, le remplacement ne conserve aucun enregistrement de l’ancienne instance.

## Étapes suivantes

- [Empaqueter et installer un plugin](./publish.md) — distribuer le plugin sous forme de package installable
- [Plugins et cycle de vie](../framework/) — comprendre tout le cycle de vie d’un plugin
- [Services et dépendances](../framework/service.md) — fournir un service à d’autres plugins
