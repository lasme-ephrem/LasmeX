# Assemblage du prompt système

Le [package system-prompt](../../packages/core/system-prompt) définit les données échangées entre les contributeurs du prompt et un appel d’assemblage. Son [README](../../packages/core/system-prompt/README.md) documente l’enregistrement, l’ordre, la portée et le rendu ; cette page décrit les types inter-packages exacts que les plugins implémentent ou transmettent.

Source : [`packages/core/system-prompt/src/index.ts`](../../packages/core/system-prompt/src/index.ts).

## Contexte d’assemblage

`AssembleContext` identifie la couche de portée qu’un assemblage doit résoudre et peut contenir le signal de contrôle explicite de cette requête. Cette interface est extensible par fusion : `lasmex-agent` lui ajoute le champ actif facultatif `agent`, tandis que `assembleContextFor(agent, signal)` renseigne ensemble les champs explicites. Un assemblage simple ne possède ni portée ni signal.

```ts type-equiv
/** Merge-extensible context for one prompt assembly. */
interface AssembleContext {
  /**
   * Scope whose providers and waterfall listeners participate. When absent,
   * only global providers and subject-less listeners participate.
   */
  scope?: ScopeKey
  /** Explicit control signal for the turn that requested this assembly, when any. */
  signal?: AbortSignal
}
```

## Résultat d’un fournisseur d’outils

`ToolProviderResult.schemas` contient l’ensemble visible par le modèle pour l’assemblage en cours. `knownNames` représente l’univers des noms du fournisseur avant restriction ; il permet de distinguer une faute dans un nom configuré d’un outil connu mais délibérément masqué dans cette portée.

```ts type-equiv
/** Tool schemas visible in one assembly and their pre-restriction name set. */
interface ToolProviderResult {
  /** The schemas this provider contributes to THIS assembly. */
  readonly schemas: readonly ToolSchema[]
  /** The pre-restriction name universe for config validation (defaults to `schemas`' names). */
  readonly knownNames?: readonly string[]
}
```

## Sections du prompt

`PromptSection` définit un enregistrement immuable entre composants d’un même processus. Son texte peut être statique ou calculé à partir du contexte d’assemblage courant. Après l’assemblage coopératif, une unique section effective marquée `complete` devient la seule section du prompt.

```ts type-equiv
/** One contributed section of the system prompt (registry input). */
interface PromptSection {
  /** Unique name — a duplicate registration throws (see {@link SystemPrompt.section}). */
  readonly name: string
  /**
   * Sections are concatenated in ascending order. Convention: `-100` is the
   * harness identity, `0` the deployment persona, tool guidance uses 100–199;
   * other negative orders also render before the persona.
   */
  readonly order: number
  /**
   * Static text or a provider evaluated at each assembly with that assembly's
   * {@link AssembleContext}. The text may reference `{{variable}}`s — they are
   * interpolated later, by {@link renderPrompt}.
   */
  readonly text: string | ((context: AssembleContext) => string)
  /**
   * Treat this contribution as the complete system prompt. Assembly still
   * runs the cooperative waterfall so tools, contexts, and variables can be
   * resolved, then restores this exact section as the sole prompt section.
   * More than one effective complete section makes assembly fail.
   */
  readonly complete?: boolean
}
```

## Contexte dynamique du prompt

`PromptContext` est le pendant de `PromptSection` qui peut être mis en cache sans risque. L’assemblage résout et ordonne ces contributions. La boucle d’agent journalise leur instantané courant complet après l’historique du modèle conservé, uniquement lorsque cet instantané change ou que la compaction l’a supprimé.

```ts type-equiv
/** Dynamic model context materialized as a durable user-role snapshot. */
interface PromptContext {
  /** Unique name — a duplicate registration throws (see {@link SystemPrompt.context}). */
  readonly name: string
  /** Contexts are joined in ascending order. */
  readonly order: number
  /** Static text or a provider evaluated for each assembly. Empty text contributes nothing. */
  readonly text: string | ((context: AssembleContext) => string)
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsystemprompt--systemprompt"></a>

### `ctx.systemPrompt` — `SystemPrompt`

Registry service for the prompt inputs assembled before each model step.

```ts cordis-catalog
/**
 * Register an ordered prompt section in the calling context's scope. A scoped
 * section shadows a global section with the same name; duplicates within one
 * layer and non-finite orders throw. Registration and disposal emit
 * `system-prompt/change`.
 * @param section - the section to register.
 * @returns the exact Cordis effect disposer.
 */
section(section: PromptSection): () => void

/**
 * Register ordered dynamic context in the calling context's scope. Scoped
 * entries shadow global entries with the same name.
 * @param context - the context contribution to register.
 * @returns the exact Cordis effect disposer.
 */
context(context: PromptContext): () => void

/**
 * Suppress every dynamic runtime-context contribution in the calling
 * context's scope without changing the services that own or enforce those
 * facts. Multiple suppressors remain independently disposable.
 * @returns the exact Cordis effect disposer.
 */
suppressRuntimeContext(): () => void

/**
 * Register a tool-schema provider in the calling context's scope. Global and
 * matching scoped providers both contribute; returning the reserved
 * {@link TOOL_ORDER_REST} name makes assembly fail.
 * @param provider - evaluated for each assembly with its context.
 * @returns the exact Cordis effect disposer.
 */
tools(provider: (context: AssembleContext) => ToolProviderResult): () => void

/**
 * Register a prompt variable in the calling context's scope. Scoped values
 * shadow globals; invalid or duplicate names throw. A provider may return
 * `undefined`, but rendering a section that references that value then fails.
 * @param name - the `[a-z][a-z0-9_]*` reference name.
 * @param provider - evaluated for each assembly.
 * @returns the exact Cordis effect disposer.
 */
variable(name: string, provider: (context: AssembleContext) => string | undefined): () => void

/**
 * Assemble global and scoped providers, detach tool parameters, apply
 * canonical ordering, then run the assembly waterfall. Scoped sections and
 * variables shadow globals. The returned waterfall value is authoritative
 * except that an effective complete section is restored afterwards as the
 * sole prompt section.
 * @param context - the optional scope and plugin-defined assembly fields.
 * @returns the post-waterfall assembly with any complete prompt enforced.
 */
async assemble(context: AssembleContext = {}): Promise<PromptAssembly>
```

Source: [`packages/core/system-prompt/src/index.ts:340`](../../packages/core/system-prompt/src/index.ts)

<a id="system-prompt-events"></a>

### `system-prompt/*` events

<a id="system-promptassemble--waterfall"></a>

#### `system-prompt/assemble` — waterfall

Expert waterfall over the assembled sections, contexts, tools, and variables. Scope-filtered dispatch (`lasmex-scope`): scoped listeners receive only that scope's assemblies. The returned value is authoritative. A supplied signal controls only this explicit assembly request and must not be retained to control later turns. A registered complete section is restored after this waterfall, so listeners cannot add to or replace that scope's system prompt.

```ts cordis-catalog
/**
 * Expert waterfall over the assembled sections, contexts, tools, and variables.
 * Scope-filtered dispatch (`lasmex-scope`): scoped listeners
 * receive only that scope's assemblies. The returned value is authoritative.
 * A supplied signal controls only this explicit assembly request and must not
 * be retained to control later turns. A registered complete section is
 * restored after this waterfall, so listeners cannot add to or replace
 * that scope's system prompt.
 * @param assembly - the mutable assembly built from registered providers.
 * @param context - the caller's per-assembly context.
 * @mode waterfall
 */
'system-prompt/assemble'(this: Scoped<SystemPrompt>, assembly: PromptAssembly, context: AssembleContext, next: () => Promise<PromptAssembly>): Promise<PromptAssembly>
```

Types: [Scoped](scope.md)

Source: [`packages/core/system-prompt/src/index.ts:31`](../../packages/core/system-prompt/src/index.ts)

<a id="system-promptchange--emit"></a>

#### `system-prompt/change` — emit

Emitted when any prompt provider changes. This registry notification is unfiltered because a global change affects every scope.

```ts cordis-catalog
/**
 * Emitted when any prompt provider changes. This registry notification is
 * unfiltered because a global change affects every scope.
 * @mode emit
 */
'system-prompt/change'(): void
```

Source: [`packages/core/system-prompt/src/index.ts:37`](../../packages/core/system-prompt/src/index.ts)
<!-- END GENERATED cordis-surface -->
