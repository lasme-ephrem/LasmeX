# Services et dépendances

Un service est une capacité qu’un plugin expose à d’autres plugins. `inject` déclare les services dont un plugin dépend.

## Qu’est-ce qu’un service ?

Dans LasmeX, `tools`, `llm` et `agents` sont des services. Chacun est une capacité nommée montée sur `ctx` :

```ts ignore-check
ctx.tools    // ToolRuntime service
ctx.llm      // LLM service
ctx.agents   // Agent service
```

Tout plugin peut fournir un service que d’autres plugins consommeront.

## Consommer un service

Déclarez `inject` pour utiliser un service existant :

```ts ignore-check
export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools exists and is ready here.
  ctx.tools.register(/* ... */)
}
```

Lorsque `apply` s’exécute, tous les services déclarés par `inject` sont prêts. Si l’un d’eux ne l’est pas, le plugin attend au lieu de s’exécuter.

## Fournir un service

### Étendre Service

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MetricsService extends Service {
  static inject = ['llm']  // A service may depend on other services.

  constructor(ctx: Context) {
    super(ctx, 'metrics')  // 'metrics' is the service name.
  }

  // Public service method.
  record(event: string, value: number) {
    // ...
  }
}
```

Une fois ce plugin chargé, ses consommateurs accèdent au service par `ctx.metrics` :

```ts ignore-check
export const inject = ['metrics']

export function apply(ctx: Context) {
  ctx.metrics.record('tool_call', 1)
}
```

### Déclarer son type

Utilisez la fusion de déclarations TypeScript pour typer `ctx.metrics` :

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    metrics: MetricsService
  }
}

export default class MetricsService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'metrics')
  }

  record(event: string, value: number) { /* ... */ }
}
```

## Comportement des dépendances

### Dépendances requises et facultatives

```ts ignore-check
// Required: the plugin does not load while the service is absent.
export const inject = ['tools']

// Optional: omit inject and query with ctx.get() at the use site.
export function apply(ctx: Context) {
  const metrics = ctx.get('metrics')
  metrics?.record('plugin_loaded', 1)
}
```

### Lorsqu’un service disparaît

Si un service requis disparaît pendant l’exécution de l’application, par exemple parce que son fournisseur est déchargé :

1. les plugins qui en dépendent sont automatiquement libérés ;
2. ils se rechargent lorsque le service revient.

Ainsi, aucun plugin ne peut appeler un service qui n’existe plus.

## Isolation des services
<a id="service-isolation"></a>

`cordis.yml` peut isoler des services afin que différents groupes de plugins disposent d’instances distinctes d’un même service :

```yaml
- id: group-a
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate:
    shell: true
  config:
    - name: 'lasmex-bash-local'
      config:
        timeoutMs: 5000
    - name: './src/plugin-a.ts'

- id: group-b
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate:
    shell: true
  config:
    - name: 'lasmex-bash-local'
      config:
        timeoutMs: 60000
    - name: './src/plugin-b.ts'
```

`plugin-a` et `plugin-b` voient chacun l’instance Bash de leur propre groupe, sans effet entre les groupes.

## Services intégrés à LasmeX

Le dépôt génère les noms des services, leurs méthodes publiques et leurs emplacements sources dans la [page du sous-système](../../../subsystems/core.md) de chaque service. Pendant le développement d’un plugin, utilisez ces régions générées et l’interface TypeScript du service ; ne maintenez pas une seconde liste statique.

## Étapes suivantes

- [Système d’événements](./events.md) — faire communiquer les plugins sans couplage fort
- [Découpage des capacités](../practice/) — utiliser les services comme interfaces de capacité
