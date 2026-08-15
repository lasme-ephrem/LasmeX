# Commandes humaines

Le service de registre des commandes humaines provient de [`lasmex-commands`](../../packages/interaction/commands). Les adaptateurs interactifs l’utilisent pour découvrir et exécuter directement les commandes appartenant aux plugins pour un agent précis, sans créer de message destiné au modèle. L’[Agent Note sur les commandes](../../.agents/notes/implemented/feature/2026-07-19-plugin-command-registration.md) explique la répartition et le cycle de vie ; le [README du package](../../packages/interaction/commands/README.md) décrit la composition et les limites.

Source : [`packages/interaction/commands/src/index.ts`](../../packages/interaction/commands/src/index.ts)

## Métadonnées d’entrée

Le service expose une indication facultative pour les entrées non structurées. La disponibilité des commandes dépend de la composition des plugins : chaque adaptateur qui consomme le registre voit toutes les définitions applicables.

```ts type-equiv
/** Immutable metadata for a command's optional unstructured input. */
interface CommandInputDescriptor {
  /** Placeholder shown before the user supplies free-form input. */
  readonly hint: string
}
```

## Définition

`CommandDefinition` est l’enregistrement fourni par le plugin. Le registre valide et fige une définition applicable détachée.

```ts type-equiv
/** Plugin-owned command registration. */
interface CommandDefinition {
  /** Lowercase command name without the leading slash. */
  readonly name: string
  /** Human-readable summary used in discovery UI. */
  readonly description: string
  /** Optional free-form input hint advertised to capable clients. */
  readonly input?: CommandInputDescriptor
  /**
   * Whether `command/run` records `rawInput`. Defaults to true. A command
   * whose domain event owns the payload sets this false to avoid duplicating
   * that payload in the session log.
   */
  readonly recordInput?: boolean
  /** Execute against the receiving agent without sending the command to the model. */
  readonly handler: (invocation: CommandInvocation) => CommandResult | Promise<CommandResult>
}
```

## Invocation et résultat

L’adaptateur possède l’annulation et transmet l’agent cible exact. `rawInput` commence immédiatement après le nom analysé et conserve le séparateur ainsi que le suffixe fournis par l’adaptateur. Les résultats sont destinés directement à l’interface ; ce ne sont ni des résultats d’outils ni des événements de session.

```ts type-equiv
/** Invocation passed to one registered command handler. */
interface CommandInvocation {
  /** Pairing id already written to this invocation's `command/run` event. */
  readonly commandId: CommandId
  /** Exact agent whose UI received the command. */
  readonly agent: Agent
  /** Exact text following the registered command name, including separator whitespace. */
  readonly rawInput: string
  /** Cancellation signal owned by the dispatching UI request. */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/** Expected command outcome rendered directly by the dispatching UI. */
type CommandResult =
  | {
    readonly kind: 'success'
    readonly text?: string
    /** Earlier authoritative domain event that owns a richer presentation. */
    readonly sourceEventSeq?: number
  }
  | { readonly kind: 'error'; readonly text: string }
```

`sourceEventSeq` est facultatif et réservé aux résultats réussis. Lorsqu’il est présent, il désigne un événement antérieur, distinct d’une commande, dans le journal de la session destinataire. `command/done` persiste la même référence, afin qu’un client puisse combiner le cycle de vie de la commande avec la projection du domaine sans analyser `text` ni dépendre de lignes adjacentes.

## Vues de découverte et d’analyse

Après la résolution de la portée, les adaptateurs reçoivent des descripteurs immuables sans gestionnaire. `parseCommand()` renvoie un `ParsedCommand` avant la résolution dans le registre ; une entrée syntaxiquement valide peut donc encore désigner une commande indisponible.

```ts type-equiv
/** Handler-free immutable command view returned to UI adapters. */
interface CommandDescriptor {
  /** Lowercase command name without the leading slash. */
  readonly name: string
  /** Human-readable summary used in discovery UI. */
  readonly description: string
  /** Optional free-form input hint advertised to capable clients. */
  readonly input?: CommandInputDescriptor
}
```

```ts type-equiv
/** Syntactically valid slash command before registry resolution. */
interface ParsedCommand {
  /** Lowercase command name without the leading slash. */
  readonly name: string
  /** Exact text following the command name. */
  readonly rawInput: string
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Générée depuis les sources par `scripts/gen-cordis-catalog.ts` (sa fraîcheur est vérifiée par `pnpm run verify-cordis-catalog` dans doc-sync ; régénérez-la avec `pnpm run gen-cordis-catalog`) — cette section est identique octet pour octet dans les deux langues de la page. Les blocs de signature utilisent une clôture `ts cordis-catalog` et conservent la JSDoc source d’origine. Les modes de répartition sont définis dans le [guide d’introduction](../cordis-primer.md#dispatch-modes), et l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcommands--commandruntime"></a>

### `ctx.commands` — `CommandRuntime`

Registre des commandes humaines. Les définitions enregistrées dans un contexte ordinaire sont globales. Celles enregistrées depuis un enfant du contexte d’un agent, auquel le service de commandes a été injecté, masquent les définitions globales pour cet agent.

```ts cordis-catalog
/**
 * Register a global or calling-agent-scoped command.
 * @param definition - discovery metadata and direct UI handler.
 * @returns the exact effect disposer that unregisters this definition.
 */
register(definition: CommandDefinition): () => void

/**
 * List the effective immutable command descriptors for one agent.
 * @param agent - exact receiving agent and scoped-layer key.
 * @returns name-sorted descriptors after scoped shadowing.
 */
@Remote list(agent: Agent): readonly CommandDescriptor[]

/**
 * Resolve one effective command definition.
 * @param agent - exact receiving agent and scoped-layer key.
 * @param name - command name without a slash.
 * @returns the scoped shadow or global definition.
 */
find(agent: Agent, name: string): CommandDefinition | undefined

/**
 * Parse and execute a known command without sending it to the model.
 *
 * A resolved command's lifecycle is logged: `command/run` is appended
 * before the handler is invoked and `command/done` after settlement (a
 * thrown or aborted handler settles as `kind: 'error'`). Both are direct
 * log-only appends — no turn wraps them, and persistence drains them at
 * ordinary checkpoints. Admission misses (syntax or unknown name) log
 * nothing — they never entered a handler. A `command/run` append failure
 * fails the execution loud; a `command/done` append failure on the
 * handler-failure path is contained so the handler's own error stays the
 * reported failure.
 *
 * @param agent - exact receiving agent.
 * @param line - complete slash-command line.
 * @param signal - cancellation signal owned by the UI request.
 * @returns the settled execution (result + lifecycle pairing id), or
 *   `undefined` when syntax or name does not resolve.
 */
@Remote async execute( agent: Agent, line: string, signal: AbortSignal, ): Promise<CommandExecution | undefined>
```

Types : [Agent](core.md)

Source : [`packages/interaction/commands/src/index.ts:225`](../../packages/interaction/commands/src/index.ts)

<a id="commands-events"></a>

### Événements `commands/*`

<a id="commandschange--emit"></a>

#### `commands/change` — emit

Une commande a été enregistrée ou retirée. Cette notification du registre n’est pas filtrée, car une modification globale ou limitée à une portée peut affecter n’importe quelle vue de l’interface. Les échecs des observateurs sont confinés et ne peuvent pas annuler la modification du registre.

```ts cordis-catalog
/**
 * A command was registered or unregistered. This is an unfiltered registry
 * notification because a global or scoped change may affect any UI view.
 * Observer failures are contained and cannot veto the registry mutation.
 * @mode emit
 */
'commands/change'(): void
```

Source : [`packages/interaction/commands/src/types.ts:72`](../../packages/interaction/commands/src/types.ts)
<!-- END GENERATED cordis-surface -->
