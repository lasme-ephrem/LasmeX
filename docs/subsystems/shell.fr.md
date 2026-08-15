# Exécuteur Bash

La capacité d’exécution Bash se répartit entre une définition de service ([lasmex-shell](../../packages/shell/shell), `ctx.shell`), des fournisseurs ([lasmex-bash-local](../../packages/shell/bash-local) et [lasmex-bash-sandbox](../../packages/shell/bash-sandbox)) et un consommateur ([lasmex-tool-bash](../../packages/shell/tool-bash), qui expose le schéma `bash`). Les identifiants, la propriété et les commandes des tâches génériques en arrière-plan sont décrits dans [jobs.md](jobs.md) ; cette capacité renvoie une référence de processus sans tâche. Les mécanismes bruts de groupe de processus restent derrière la [capacité subprocess](subprocess.md).

Source : [`packages/shell/shell/src/types.ts`](../../packages/shell/shell/src/types.ts)

## Espace de noms de l’environnement shell géré

Les variables `LASMEX_*` décrivent des informations sur les processus enfants qui appartiennent au Harness. L’outil Bash exposé au modèle les recueille par `ctx.shellEnv` et les transmet dans `ShellExecRequest.lasmexEnv`; le service subprocess supprime les noms `LASMEX_*` hérités avant de fusionner l’instantané courant. Le vocabulaire `LasmexEnvironmentKey`/`LasmexEnvironment` appartient à la [capacité subprocess](subprocess.md) et est réexporté par `lasmex-shell`.

## Requête et spécification : séparation par `resolve()`

La capacité distingue la **requête exposée au modèle ou aux plugins** — dont `workdir`/`timeoutMs`/`stdoutMaxBytes` sont facultatifs et complétés selon la configuration ou la politique de requête — de la **spécification entièrement résolue** qu’exécute le moteur, où ces champs sont obligatoires. Entre les deux, la couche d’outil appelle `ctx.shell.resolve(request)`, conformément à la règle du dépôt qui exige des limites de package explicites ; une `ShellExecSpec` contient les valeurs résolues.

```ts type-equiv
/**
 * A caller's execution REQUEST: `workdir` and `timeoutMs` are optional and
 * filled by {@link ShellExecutor.resolve} from the implementation's config.
 * This is the model-/plugin-facing shape; pass it to `resolve()` to obtain a
 * fully-resolved {@link ShellExecSpec}.
 */
interface ShellExecRequest {
  command: string
  /** Working directory override (default: implementation-configured). */
  workdir?: string | undefined
  /** Timeout override in milliseconds (implementations cap it). */
  timeoutMs?: number | undefined
  /**
   * Foreground stdout capture budget in bytes. Absent uses the executor's
   * default output cap. Trusted in-process consumers use this when they must
   * parse complete stdout up to their own bounded limit; the model-facing bash
   * tool does not expose it as a parameter.
   */
  stdoutMaxBytes?: number | undefined
  /** Abort signal — implementations kill the command when it fires. */
  signal?: AbortSignal | undefined
  /**
   * Bytes to write to the command's stdin, then close it. Absent leaves stdin
   * closed/empty (the default for model-driven tool calls). Set by in-process
   * plugins (e.g. the hooks bridges, which write a hook command's JSON payload
   * to its stdin); the model-facing bash tool does not expose it as a parameter
   * (a model that needs stdin uses shell syntax like a heredoc or a pipe).
   */
  stdin?: string | undefined
  /**
   * Ordinary environment entries for the command, merged after the credential
   * scrub. Managed facts belong in {@link lasmexEnv}, which merges after this
   * map, so an entry here can never displace one. Set by in-process plugins
   * (the hooks bridges set `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, …); the
   * model-facing bash tool does not expose it as a parameter.
   */
  env?: Record<string, string> | undefined
  /**
   * Harness-owned `LASMEX_*` variables for this execution (typed to managed
   * keys). Executors discard ambient `LASMEX_*` entries before merging this
   * snapshot last, so an unavailable current fact cannot inherit a stale
   * value from the harness process and a caller {@link env} entry cannot
   * displace a managed one.
   */
  lasmexEnv?: LasmexEnvironment | undefined
  /** Fully resolved per-call sandbox policy; sandboxing executors default it. */
  sandboxPolicy?: SandboxExecutionPolicy | undefined
}
```

```ts type-equiv
/**
 * A resolved execution spec. {@link ShellExecutor.resolve} fills and caps the
 * required fields; {@link ShellExecutor.start} ignores `timeoutMs` because
 * background processes have no executor timeout.
 */
interface ShellExecSpec {
  command: string
  workdir: string
  timeoutMs: number
  /**
   * Resolved foreground stdout capture budget in bytes. `run()` uses it for
   * stdout; background jobs and stderr keep the executor's own output cap.
   */
  stdoutMaxBytes: number
  /** Abort signal — implementations kill the command when it fires. */
  signal?: AbortSignal | undefined
  /** Bytes to write to stdin before closing it; absent means no stdin. */
  stdin?: string | undefined
  /**
   * Ordinary environment entries carried through from
   * {@link ShellExecRequest.env}; {@link lasmexEnv} still merges after them.
   * OPTIONAL on the spec for the same reason as `stdin`: absent means no
   * ordinary extra environment.
   */
  env?: Record<string, string> | undefined
  /** Managed `LASMEX_*` snapshot (typed to managed keys); merges after {@link env}. */
  lasmexEnv?: LasmexEnvironment | undefined
  /** Resolved sandbox policy; ignored by executors that do not confine. */
  sandboxPolicy: SandboxExecutionPolicy | undefined
}
```

`stdin` et `env` sont des entrées de confiance réservées aux plugins du même processus ; `lasmex-tool-bash` ne les expose pas. L’exécuteur local supprime les identifiants ambiants avant de fusionner les variables d’environnement explicites de l’appelant. Consultez l’[Agent Note sur stdin et l’environnement Bash](../../.agents/notes/implemented/architecture/2026-06-30-bash-stdin-env-trusted-plugin-api.md).

`stdoutMaxBytes` est lui aussi réservé aux plugins de confiance. Il permet à un consommateur au premier plan de demander une sortie standard complète, jusqu’à la limite bornée de son analyseur, sans modifier la sortie d’erreur, les tâches en arrière-plan ni la limite ordinaire de l’outil Bash exposé au modèle.

## Exécutions au premier plan : `ShellRunResult`

Ce type décrit l’issue d’une exécution au premier plan terminée ou interrompue. Les résultats orthogonaux sont signalés **indépendamment** : un processus peut à la fois dépasser le délai ET se terminer avec le code 0 s’il intercepte le signal. `timedOut`, `aborted`, `signal` et `exitCode` possèdent donc chacun leur champ ; un appelant ne confond jamais une exécution interrompue avec un succès normal.

```ts type-equiv
/** The outcome of one completed (or killed) foreground run. */
interface ShellRunResult {
  /** Exit code; null when the process died from a signal. */
  exitCode: number | null
  /** Terminating signal (e.g. 'SIGTERM'); null on normal exit. */
  signal: NodeJS.Signals | null
  /**
   * True when the executor's own timeout was the FIRST cause to cut the command
   * short. Mutually exclusive with {@link aborted}: one fused deadline drives
   * both the timeout and the caller's cancellation, so a timeout and an abort
   * racing before process close report the single first-abort cause, not both
   * (see the [timeout-library Agent Note](../../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md)).
   */
  timedOut: boolean
  /**
   * True when the caller's `AbortSignal` was the FIRST cause to kill the command
   * (and it was not the executor's own timeout). Mutually exclusive with
   * {@link timedOut} — see there for the first-cause classification.
   */
  aborted: boolean
  /** The effective timeout applied to this run (after defaulting/capping). */
  timeoutMs: number
  stdout: CollectedOutput
  stderr: CollectedOutput
  /** Sandbox execution facts, absent for an unsandboxed executor. */
  sandbox?: ShellSandboxInfo
}
```

Chaque flux est un `CollectedOutput` : il contient le texte, éventuellement tronqué, et les informations nécessaires pour récupérer le reste. En cas de troncature, `text` correspond à la **fin** et le flux complet est déporté dans un fichier privé. Ces champs appartiennent à la [capacité subprocess](subprocess.md) et sont réexportés par `lasmex-shell`.

## Bac à sable des fichiers : `ShellSandboxInfo`

Un exécuteur qui utilise le bac à sable expose son mode de repli configuré dans `ShellExecutor.sandboxMode`. La couche d’outil demande à [`lasmex-sandbox-policy`](../../packages/sandbox/sandbox-policy/README.md) de convertir le remplacement durable `sandbox/mode` de la session appelante et son répertoire courant immuable en `ShellExecRequest.sandboxPolicy`; un appel ponctuel approuvé et strictement plus permissif ne remplace que le mode. Le vocabulaire du mode, de la racine et du niveau d’application appartient à la [capacité `lasmex-sandbox`](sandbox.md) ; les modes ne régissent que les effets sur les fichiers.

Une exécution confinée indique son mode, une classification prudente des refus et l’exhaustivité de l’application. `runnerFailed` signale l’échec du moteur de bac à sable avant le démarrage de la commande. Une exécution au premier plan lève alors `SANDBOX_UNAVAILABLE`, tandis qu’un processus d’arrière-plan terminé ne dispose que de son canal d’informations.

```ts type-equiv
/**
 * Sandbox facts for one run, present iff a sandboxing executor handled it.
 * Facts are reported independently of process exit status so callers can
 * distinguish command failures from policy denials and runner failures.
 */
interface ShellSandboxInfo {
  /** The mode the command actually ran under. */
  mode: SandboxMode
  /** Whether the sandbox denied a file operation. */
  denied: boolean
  /** How completely the selected runner enforced the requested mode. */
  enforcement?: SandboxEnforcement
  /** Whether the sandbox runner failed before the command could run. */
  runnerFailed?: boolean
}
```

Le code d’erreur `SANDBOX_UNAVAILABLE`, qui appartient à la [capacité de bac à sable](sandbox.md), est levé par le fournisseur `ctx.sandbox` — puis propagé par l’exécuteur — lorsqu’un mode confiné ne dispose d’aucun moteur utilisable. Le refus du profil par le moteur sélectionné produit la même erreur au premier plan, conformément au principe de fermeture en cas d’échec ; une tâche d’arrière-plan terminée enregistre `runnerFailed`. Le modèle reçoit les informations sur les refus et les défaillances du moteur, ne découvre le mode effectif que lorsqu’un marqueur de refus le nomme, et peut demander une nouvelle tentative ponctuelle strictement plus permissive par `sandbox_permissions` accompagné de `justification`. `ctx.approval` doit accorder cet appel exact avant toute exécution. La politique complète et le changement de mode sont décrits dans l’[Agent Note sur le bac à sable](../../.agents/notes/implemented/feature/2026-07-06-sandbox.md).

## Processus en arrière-plan : `ShellProcess`

`start()` renvoie une référence dépourvue d’identifiant et de propriétaire. `lasmex-tool-bash` l’adapte aux fonctions de rappel de `ctx.jobs.start()`; le moteur générique gère alors l’identité et le cycle de vie de la tâche. `done` se résout à la fermeture du processus et ne rejette jamais sa promesse, les lectures restent possibles après la fin et les informations de bac à sable sont enregistrées avant la résolution de `done`.

```ts type-equiv
/**
 * A background process handle returned by {@link ShellExecutor.start}. It is the
 * only access path; buffered output remains readable after exit. Composition
 * teardown (the subprocess service's disposal) kills running processes and
 * awaits {@link done}; an executor-only reload leaves them running.
 */
interface ShellProcess {
  /** Process lifecycle state (settled exactly once). */
  status: ShellProcessStatus
  /** Exit code once finished (null = killed by signal / still running). */
  exitCode: number | null
  /** Terminating signal name, when signal-killed. */
  signal: NodeJS.Signals | null
  /** Resolves when the underlying process closes (never rejects — a spawn failure settles as `killed` with the error on stderr). */
  readonly done: Promise<void>
  /** Sandbox facts, stamped once a confined process settles. */
  sandbox?: ShellSandboxInfo
  /**
   * Read output produced since the previous read (consuming — consecutive
   * reads never re-deliver). Reads that lost data flag `lossy` and point at
   * full-stream spill files when available.
   */
  readOutput(): ShellProcessRead
  /**
   * Kill the process group. Returns false when it had already finished
   * (no-op); idempotent.
   */
  kill(): boolean
}
```

`readOutput()` renvoie le fragment incrémental et les informations de récupération des sorties déportées :

```ts type-equiv
/** One incremental {@link ShellProcess.readOutput} read. */
interface ShellProcessRead {
  /** Output produced since the previous read (stderr in a marked section). */
  delta: string
  /** True when truncation dropped unread bytes the delta cannot include. */
  lossy: boolean
  /** Full stdout spill file, when stdout truncation occurred and a safe path is available. */
  stdoutSpillPath?: string
  /** Full stderr spill file, when stderr truncation occurred and a safe path is available. */
  stderrSpillPath?: string
}
```

## Service

`ShellExecutor` gère `resolve`, l’exécution `run` au premier plan, le démarrage `start` d’un processus en arrière-plan et l’information de capacité `sandboxMode`. `lasmex-bash-local` définit les valeurs par défaut des commandes, la classification des dépassements de délai et des annulations, l’environnement du terminal et la fusion des lectures en arrière-plan. Les groupes de processus, les collecteurs bornés, les fichiers de déport, la suppression des identifiants et le retour au repos lors de la libération appartiennent au [service subprocess](subprocess.md). `lasmex-tool-bash` gère le rendu exposé au modèle et adapte les références d’arrière-plan au [moteur générique de tâches](jobs.md). `lasmex-shell` définit le contrat partagé sur l’état de sortie des outils shell : les exports `parseExitStatus`/`ParsedExitStatus` interprètent les marqueurs `[exit code: N]` / `[killed by signal: X]` que `lasmex-tool-bash` ajoute par `renderResult` et `lasmex-tool-pwsh` par `renderPwshResult`; les méthodes `presentResult` des deux outils s’en servent pour séparer le texte rendu entre le corps de sortie de la carte terminal et sa pastille d’état de sortie.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxshell--shellexecutor-abstract-seam"></a>

### `ctx.shell` — `ShellExecutor` (abstract seam)

Abstract bash execution service. Subclass, implement the abstract methods, and load the subclass as a plugin — it registers as `ctx.shell` (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

Implementations must honor these semantics:

- run rejects only for infrastructure failures. Nonzero exits, timeout kills, and abort kills resolve with a ShellRunResult.
- start returns immediately; no timeout applies to background processes. `done` settles at process close and never rejects; spawn failures settle as `killed` with the error on stderr.
- ShellProcess.readOutput is incremental: consecutive reads never repeat output. Lossy reads report truncation and available spill files.
- A still-running background process is stopped and awaited when its owning composition tears down. With the subprocess seam that boundary is `ctx.subprocess` disposal, so a background process survives an executor-only reload.

```ts cordis-catalog
/**
 * Apply implementation-owned defaults and caps to a request before execution.
 * @param request - the caller's request; omitted fields get this
 *   implementation's defaults, capped fields are clamped.
 * @returns the fully-specified spec to hand to {@link run}/{@link start}.
 */
abstract resolve(request: ShellExecRequest): ShellExecSpec

/**
 * Run a command in the foreground; resolves when it finishes.
 * @param spec - a resolved spec from {@link resolve}, never a raw request.
 * @returns the outcome; nonzero exits, timeout kills, and abort kills
 *   resolve with a descriptive result rather than reject.
 */
abstract run(spec: ShellExecSpec): Promise<ShellRunResult>

/**
 * Start a background process and return its handle immediately.
 * @param spec - a resolved spec from {@link resolve}, never a raw request.
 * @returns the live process handle (reads, kill, quiescence promise).
 */
abstract start(spec: ShellExecSpec): ShellProcess
```

Source: [`packages/shell/shell/src/index.ts:65`](../../packages/shell/shell/src/index.ts)

<a id="ctxshellenv--shellenvregistry"></a>

### `ctx.shellEnv` — `ShellEnvRegistry`

Registry (`ctx.shellEnv`) for trusted, per-execution `LASMEX_*` variables. The namespace is rebuilt for every model shell call: ambient `LASMEX_*` values are discarded by the executor, then the registry's current snapshot is injected. Built-in shell facts remain owned by the registry itself while plugins can register additional, enumerable facts with effect-scoped disposal.

```ts cordis-catalog
/**
 * Register one environment contributor. Names and keys are unique; built-in
 * keys are reserved. Registration is disposed with the calling plugin fiber.
 * @param contributor - declared key ownership and per-execution resolver.
 * @returns the disposer that unregisters the contribution.
 */
register(contributor: BashEnvContributor): () => void

/**
 * Build the trusted `LASMEX_*` snapshot for one shell tool execution.
 * @param execution - the current tool execution.
 * @returns an immutable environment overlay containing built-ins and current contributions.
 */
collect(execution: ToolExecution): LasmexEnvironment

/**
 * Enumerate plugin-contributed variables without executing their resolvers.
 * @returns declarations sorted by environment variable name.
 */
list(): BashEnvVariableInfo[]
```

Types: [LasmexEnvironment](subprocess.md) · [ToolExecution](tools.md)

Source: [`packages/shell/shell-env/src/index.ts:88`](../../packages/shell/shell-env/src/index.ts)
<!-- END GENERATED cordis-surface -->
