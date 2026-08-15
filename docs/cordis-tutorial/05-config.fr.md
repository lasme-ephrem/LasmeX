# 5. Configuration

Chaque entrée de `cordis.yml` peut contenir un bloc `config`, et le plugin déclare un schéma qui le valide avant l’exécution de `apply`. Une configuration incorrecte fait échouer le chargement avec une erreur précise : le plugin ne démarre jamais dans un état partiellement configuré.

## Un plugin configurable

Créez `config-demo.ts` dans `tmp/cordis-tutorial` :

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'config-demo'

export interface Config {
  greeting: string
  targets: string[]
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  targets: Schema.array(String).default(['world']),
})

export function apply(ctx: Context, config: Config) {
  for (const target of config.targets) {
    console.log(`${config.greeting}, ${target}!`)
  }
}
```

L’export `Config` est à la fois une interface TypeScript et un schéma d’exécution portant le même nom : les consommateurs obtiennent le type, tandis que Cordis obtient le validateur. Ce dépôt utilise [Schemastery](https://github.com/shigma/schemastery) pour les schémas ; Cordis accepte tout validateur conforme à [Standard Schema](https://standardschema.dev/), si bien qu’un simple objet exporté sous le nom `Config` ne fonctionnera pas.

Configurez-le :

```yaml
- name: './config-demo.ts'
  config:
    targets: ['alpha', 'beta']
```

Exécutez-le :

```
Hello, alpha!
Hello, beta!
```

Comme `greeting` a été omis, le schéma a appliqué sa valeur par défaut : `apply` reçoit toujours une configuration complète et validée.

## Échouer explicitement

Fournissez-lui maintenant une valeur incorrecte :

```yaml
- name: './config-demo.ts'
  config:
    targets: 'not-an-array'
```

```
ValidationError: invalid config:
  - $.targets expected array but got not-an-array (at targets)
```

La fiber du plugin passe à l’état FAILED, puis le lanceur de ce tutoriel affiche l’erreur et se termine avec le code 1. Un plugin doit également rejeter une configuration valide au regard du schéma mais qui désigne une ressource ou un fournisseur indisponible, dès qu’il peut résoudre cette référence.

## Valeurs de configuration calculées

Le loader utilisé dans ce dépôt prend en charge la balise `!!js` pour les valeurs de configuration qui doivent être calculées au chargement :

```yaml
- name: './config-demo.ts'
  config:
    greeting: !!js process.env.DEMO_GREETING ?? 'Hello'
```

`!!js` fonctionne uniquement dans `config` et dans le champ `disabled` d’une entrée. `disabled: !!js ...` est évalué avec le contexte du loader à chaque décision de montage — une extension propre à ce dépôt — afin qu’une ligne puisse s’activer selon la plateforme ou l’environnement. Les autres métadonnées (`name`, `id`, `inject`, ...) restent statiques ; une expression y constitue donc une simple donnée truthy. Consultez la [configuration du loader](../cordis-primer.md#loader-configuration).

Suite : [Composition et HMR](06-composition-and-hmr.md) — considérer `cordis.yml` comme l’application.

[![](https://img.shields.io/badge/powered_by-LasmeX-4D6BFE?style=flat-square)](https://github.com/lasme-ephrem/LasmeX)
