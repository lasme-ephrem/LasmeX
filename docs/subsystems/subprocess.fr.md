# Sous-processus

Le seam des sous-processus se répartit entre une Service Definition ([lasmex-subprocess](../../packages/subprocess/subprocess), `ctx.subprocess`) et un Service Provider ([lasmex-subprocess-local](../../packages/subprocess/subprocess-local)). Ses Consumers sont d’autres seams de capacité et des backends hors processus : la [famille d’exécuteurs bash](shell.md) utilise une sortie collectée par lot, LSP emploie des pipes de protocole bruts, le backend PTY se sert de la primitive de terminal, et le backend de subagent ACP utilise du ndjson transporté par pipe avec stderr hérité. Ce seam possède l’espace de noms d’environnement géré `LASMEX_*`, le nettoyage partagé des identifiants (`scrubbedParentEnv`) et la structure `CollectedOutput` ; [lasmex-shell](../../packages/shell/shell) réexporte ce vocabulaire afin que les consommateurs bash conservent une seule racine d’import.

Source : [`packages/subprocess/subprocess/src/types.ts`](../../packages/subprocess/subprocess/src/types.ts) et [`packages/subprocess/subprocess/src/index.ts`](../../packages/subprocess/subprocess/src/index.ts)

## Recherche d’un exécutable

Les répertoires de travail des processus lancés, chemins d’exécutables, processus ordinaires et sessions de terminal d’un même fournisseur appartiennent au même espace de noms de chemins et de processus que le fournisseur de système de fichiers monté. `resolveExecutable(command, env?, signal?)` vérifie les chemins absolus d’exécutables ou résout les noms simples au moyen du `PATH` nettoyé du fournisseur et des surcharges explicites.

## Espace de noms d’environnement géré et sortie capturée

Les variables `LASMEX_*` sont des faits propres aux processus enfants du Harness. Les implémentations retirent les noms `LASMEX_*` ambiants avant de fusionner le `env` explicite de l’appelant ; un fait actuel n’arrive ainsi que sous la forme d’une entrée chaîne volontaire, tandis qu’une valeur tombstone explicitement égale à `undefined` retire une valeur ambiante ordinaire. Chaque flux collecté indique son état de troncature et de récupération par spill au moyen de `CollectedOutput`.

```ts type-equiv
/** One environment key inside the managed {@link LASMEX_ENV_PREFIX} namespace. */
type LasmexEnvironmentKey = `${typeof LASMEX_ENV_PREFIX}${string}`
```

```ts type-equiv
/** Trusted LasmeX variables for one child-process execution. */
type LasmexEnvironment = Readonly<Record<LasmexEnvironmentKey, string> & { LASMEX_HOME?: string }>
```

```ts type-equiv
/** One captured stream: the (possibly truncated) text plus recovery info. */
interface CollectedOutput {
  /** Collected text — the TAIL of the stream when truncated. */
  text: string
  /** True when bytes were dropped from `text`. */
  truncated: boolean
  /** Path to a file holding the COMPLETE stream, when truncated and available. */
  spillPath?: string
}
```

## Dispositions stdio inspirées de Node

La disposition de chaque flux est explicite et choisie par le consommateur : pipes bruts pour le découpage des protocoles — LSP JSON-RPC ou ACP ndjson —, héritage pour transmettre directement les diagnostics, et mode de collecte pour une sortie de lot bornée. Le fichier de spill est facultatif, afin qu’une fin de diagnostic, telle que stderr d’un serveur de langage, soit mise en mémoire tampon sans laisser de fichier.

```ts type-equiv
/**
 * stdin disposition. `'ignore'` leaves fd 0 on `/dev/null`; `'pipe'` exposes
 * {@link SubprocessHandle.stdin} for the caller's ongoing protocol writes;
 * `{ data }` writes the bytes and closes (the batch shape).
 */
type SubprocessStdinMode = 'ignore' | 'pipe' | { readonly data: string }
```

```ts type-equiv
/**
 * Bounded in-memory collection for one output stream, with an optional
 * full-stream spill file. Omitting `spill` keeps only the in-memory tail —
 * the diagnostic-tail shape (a language server's stderr); including it makes
 * the complete stream recoverable up to its cap (the bash tool shape).
 */
interface SubprocessCollect {
  /** In-memory cap in bytes; overflow keeps the TAIL. */
  maxBytes: number
  /** Full-stream spill file; absent disables spilling entirely. */
  spill?: {
    /** Whole-stream byte cap; a larger stream discards its now-incomplete spill. */
    maxBytes: number
  }
}
```

```ts type-equiv
/**
 * stdout/stderr disposition. `'pipe'` exposes the raw `Readable` for the
 * caller's protocol decoding; `'inherit'` passes the parent's descriptor
 * through (child diagnostics land on the harness's own stream); a
 * {@link SubprocessCollect} object buffers boundedly with offset-based reads.
 */
type SubprocessOutputMode = 'pipe' | 'inherit' | SubprocessCollect
```

```ts type-equiv
/** Per-stream stdio dispositions, all explicit — this seam applies no defaults. */
interface SubprocessStdio {
  stdin: SubprocessStdinMode
  stdout: SubprocessOutputMode
  stderr: SubprocessOutputMode
}
```

## Spécification de lancement entièrement explicite

Le seam n’applique aucune valeur par défaut : chaque disposition, limite et répertoire est explicite dans la spécification. La configuration de l’appelant, et non une valeur par défaut cachée du service de sous-processus, en décide donc. `argv` n’est jamais interprété par un shell.

```ts type-equiv
/**
 * A fully-specified spawn request. This seam applies no defaults: every
 * disposition, limit, and directory is explicit, so the caller's own config —
 * not a hidden subprocess-service default — decides them (the `lasmex-shell`
 * request/spec split is the owning template).
 */
interface SubprocessSpawnSpec {
  /** Executable and arguments; `argv[0]` is the program. Never shell-interpreted here. */
  argv: readonly string[]
  /** Working directory for the child. */
  cwd: string
  /** Per-stream stdio dispositions. */
  stdio: SubprocessStdio
  /**
   * Positive finite grace period in milliseconds, no greater than
   * `MAX_TIMER_DELAY_MS`, for the {@link SubprocessHandle.terminate} escalation
   * and for draining still-open collected pipes after the process exits (an
   * inherited descriptor held by a surviving descendant cannot hold the
   * outcome open indefinitely).
   */
  graceMs: number
  /**
   * Abort signal — starts the terminate escalation on the process tree when
   * it fires. The caller owns deadlines and cause classification; this seam
   * only reacts to the abort.
   */
  signal?: AbortSignal | undefined
  /**
   * Explicit environment entries merged onto the implementation's scrubbed
   * parent base (see `scrubbedParentEnv`), with no namespace validation. A
   * string is a deliberate caller opt-in, so a forwarded credential-shaped
   * entry or current `LASMEX_*` fact survives the scrub; `undefined` is a
   * tombstone that removes an ordinary ambient entry from the child.
   */
  env?: NodeJS.ProcessEnv | undefined
}
```

## Handles : flux, lecteurs et terminaison de l’arbre

Un lancement renvoie immédiatement un handle actif. Les lecteurs en mode collecte utilisent des offsets en octets du flux entier et ne consomment jamais les données ; des lecteurs indépendants ne peuvent donc pas se dérober leurs deltas. Les flux transportés par pipe appartiennent à l’appelant. La terminaison porte sur tout l’arbre sur chaque plateforme : `terminate()` — l’unique verbe de terminaison — applique l’escalade SIGTERM→délai de grâce→SIGKILL, et `waitForExit()` observe l’arbre entier. Un consommateur peut ainsi construire sa propre séquence de teardown ; le `disposeAcpChild` du backend ACP, qui commence par EOF sur stdin, sert de modèle.

```ts type-equiv
/**
 * A live child process rooted in its own process tree. Collected output
 * remains readable after exit; piped streams belong to the caller.
 *
 * Termination is tree-scoped everywhere: POSIX signals the detached process
 * group (falling back to the direct child when the group is gone), Windows
 * terminates the tree via `taskkill /T`, so helper processes cannot outlive
 * the handle unnoticed.
 */
interface SubprocessHandle {
  /** Process id (tree root); -1 when the spawn itself failed. */
  readonly pid: number
  /** The child's stdin, present iff spawned with `stdin: 'pipe'`. */
  readonly stdin: Writable | undefined
  /** The child's raw stdout, present iff spawned with `stdout: 'pipe'`. */
  readonly stdout: Readable | undefined
  /** The child's raw stderr, present iff spawned with `stderr: 'pipe'`. */
  readonly stderr: Readable | undefined
  /** Offset-based readers for collect-mode streams (also readable after exit). */
  readonly collected: SubprocessCollectedOutputs
  /** Resolves at process close with exit facts; rejects only for spawn-level failures. */
  readonly done: Promise<SubprocessOutcome>
  /**
   * Begin the SIGTERM → `graceMs` → SIGKILL escalation on the process tree
   * (Windows force-terminates immediately) — the seam's only termination
   * verb. Idempotent, a no-op once the tree is gone (the pid may be reused),
   * and also triggered by the spec's abort signal.
   */
  terminate(): void
  /**
   * Wait until the process tree has exited — the tree, not just the direct
   * child, so a still-running helper is observable before teardown returns.
   * @param signal - optional bound for the wait.
   * @returns `true` when the tree exited, `false` when the signal aborted first.
   */
  waitForExit(signal?: AbortSignal): Promise<boolean>
}
```

```ts type-equiv
/**
 * Cursor-free incremental access to one collected output stream. Offsets are
 * whole-stream byte coordinates owned by the caller, so independent readers
 * cannot consume one another's output; `readFrom(0)` after settlement is the
 * batch result (`lossy` then means the in-memory tail lost its head — the
 * {@link CollectedOutput.truncated} fact).
 */
interface SubprocessOutputReader {
  /**
   * Read everything captured since `fromByte`. When that offset has slid out
   * of the in-memory tail window the read is `lossy` — it returns the whole
   * retained tail and the gap is only recoverable from the spill file.
   * @param fromByte - whole-stream offset to resume from (a prior read's `nextOffset`; 0 for the first read).
   * @returns the delta text, the next offset, the `lossy` flag, and the spill path when one exists.
   */
  readFrom(fromByte: number): SubprocessOutputRead
}
```

```ts type-equiv
/** One incremental {@link SubprocessOutputReader.readFrom} read. */
interface SubprocessOutputRead {
  /** Stream text from the requested offset (the whole retained tail when lossy). */
  text: string
  /** Whole-stream offset to resume from on the next read. */
  nextOffset: number
  /** True when the requested offset slid out of the in-memory tail window. */
  lossy: boolean
  /** Path to the full-stream spill file, when one was created and remains intact. */
  spillPath?: string
}
```

```ts type-equiv
/** Offset-based readers for the streams spawned in collect mode. */
interface SubprocessCollectedOutputs {
  /** Present iff stdout is a {@link SubprocessCollect}. */
  readonly stdout?: SubprocessOutputReader
  /** Present iff stderr is a {@link SubprocessCollect}. */
  readonly stderr?: SubprocessOutputReader
}
```

## Les résultats contiennent uniquement les faits de sortie

`done` rapporte le vocabulaire de l’événement close de Node sans classifier la cause : le service tue le processus lors d’un abort, mais n’en détermine jamais la raison. L’appelant lit le signal de délai qu’il possède, par exemple la distinction `timedOut`/`aborted` de l’exécuteur bash. La sortie collectée reste accessible par `handle.collected` après la résolution, afin que les appelants par lot et en streaming partagent un même chemin d’accès.

```ts type-equiv
/**
 * Exit facts of one closed process — Node's `close`-event vocabulary.
 * Deliberately carries NO timeout or cancellation classification (the caller
 * reads the signal it owns to classify causes) and NO output: collected
 * streams stay readable through {@link SubprocessHandle.collected} after
 * settlement, so batch and streaming callers share one access path.
 */
interface SubprocessOutcome {
  /** Exit code; null when the process died from a signal. */
  exitCode: number | null
  /** Terminating signal (e.g. 'SIGTERM'); null on normal exit. */
  signal: NodeJS.Signals | null
}
```

## Primitive de processus avec terminal

`spawnTerminal(spec)` est la primitive de processus sans pipe. Le fournisseur alloue le terminal de contrôle et possède le transport de texte UTF-8, l’inspection et la signalisation du groupe de processus au premier plan, ainsi qu’une opération attendue TERM-vers-KILL qui atteint la quiescence pour chaque membre de la session que le fournisseur peut encore observer ; les fournisseurs documentent les limites d’observation propres à leur substrat. Le backend PTY reste responsable de la détection du prompt, de l’inférence de disponibilité, du scrollback, de la politique de bac à sable et de la propriété de la session persistante ; un `spawn()` ordinaire ne peut pas reconstruire la sémantique d’un terminal de contrôle.

La spécification de terminal décrit entièrement l’argv, le cwd, les surcharges d’environnement, les dimensions, le délai de nettoyage et l’annulation facultative de l’allocation. Son handle expose `pid`, la sortie ordonnée, `done`, `write`, `inspectForeground`, `signalForeground` et la méthode attendue `terminate` ; les structures publiques exactes sont générées dans le [catalogue du service `ctx.subprocess`](#ctxsubprocess--subprocessruntime-abstract-seam).

## Comportement du service

La Service Definition abstraite [`SubprocessRuntime`](../../packages/subprocess/subprocess/src/index.ts) définit les coordonnées du monde d’exécution, la recherche d’exécutables, le `spawn` ordinaire et `spawnTerminal`. [`LocalSubprocessRuntime`](../../packages/subprocess/subprocess-local/src/index.ts) les fournit avec des arbres de processus détachés, un câblage propre à chaque disposition, le nettoyage des identifiants, `node-pty`, l’inspection des processus par plateforme et une libération qui termine puis rejoint les processus. Consultez [`lasmex-subprocess`](../../packages/subprocess/subprocess/README.md) pour les règles de la Service Definition et [`lasmex-subprocess-local`](../../packages/subprocess/subprocess-local/README.md) pour les mécanismes locaux.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Cette section est générée depuis le code source par `scripts/gen-cordis-catalog.ts` ; `pnpm run verify-cordis-catalog` vérifie sa fraîcheur dans doc-sync et `pnpm run gen-cordis-catalog` la régénère. Les blocs de signatures utilisent une fence `ts cordis-catalog` et conservent le JSDoc original. Les modes de distribution sont définis dans le [primer](../cordis-primer.md#dispatch-modes), tandis que l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxe2b--e2bruntime"></a>

### `ctx.e2b` — `E2BRuntime`

Crée un handle SDK E2B consommable à la demande et supprime le bac à sable à l’expiration ou à la libération. La création commence lors de la construction du plugin ; les adaptateurs attendent getSandbox avant leur première opération.

```ts cordis-catalog
/**
 * Return the shared live SDK handle.
 * @returns the created sandbox after the configured cwd exists.
 * @throws when E2B rejects creation or the service is disposing.
 */
async getSandbox(): Promise<Sandbox>
```

Source : [`packages/e2b/e2b/src/index.ts:74`](../../packages/e2b/e2b/src/index.ts)

<a id="ctxsubprocess--subprocessruntime-abstract-seam"></a>

### `ctx.subprocess` — `SubprocessRuntime` (seam abstrait)

Service abstrait de sous-processus. Créez une sous-classe, implémentez spawn et chargez-la comme plugin : elle s’enregistre sous `ctx.subprocess`. Une seule implémentation est admise par contexte ; en charger une seconde lève une erreur, conformément au comportement standard de Cordis pour les services en double.

Les implémentations doivent respecter les règles suivantes :

- Les chemins d’exécutables appartiennent à un monde d’exécution partagé avec le fournisseur de système de fichiers monté.
- spawn renvoie immédiatement un handle actif ; `done` est résolu à la fermeture du processus avec les faits de sortie et n’est rejeté que pour un échec au niveau du lancement.
- Les lecteurs en mode collecte sont fondés sur des offsets et ne consomment pas les données ; des lecteurs indépendants ne consomment donc jamais mutuellement leur sortie. Les lectures avec perte signalent la troncature et le fichier de spill qui contient le flux complet lorsqu’il existe. Les flux transportés par pipe sont remis bruts à l’appelant et ne sont jamais mis en mémoire tampon ici.
- SubprocessHandle.terminate — ainsi que le signal d’abandon de la spécification — applique l’escalade SIGTERM→délai de grâce→SIGKILL à tout l’arbre sur chaque plateforme ; c’est l’unique verbe de terminaison. SubprocessHandle.waitForExit observe la vie de l’arbre entier, afin qu’une séquence de teardown appartenant au consommateur puisse attendre la quiescence réelle à chaque palier.
- La libération du service termine tous les processus gérés encore actifs et attend leur sortie.
- spawnTerminal possède l’allocation du terminal, le transport de texte, les groupes au premier plan, leur signalisation et la quiescence de toute la session derrière une méthode de terminaison attendue. La disponibilité et la politique de shell persistant restent dans le consommateur PTY. Son flux de sortie se termine après la sortie de terminal mise en file d’attente lorsque le processus principal s’arrête.

```ts cordis-catalog
/**
 * Resolve one configured executable in this provider's execution world.
 * Absolute paths are verified; bare names use the provider's scrubbed PATH
 * plus explicit environment overrides. Relative paths containing separators
 * are rejected: the resolution base is undefined, so providers fail loud
 * instead of guessing.
 * @param command - absolute executable path or bare PATH name.
 * @param env - explicit environment entries used for lookup.
 * @param signal - aborts remote or local lookup.
 * @returns a canonical executable path.
 */
abstract resolveExecutable( command: string, env?: Readonly<Record<string, string>>, signal?: AbortSignal, ): Promise<string>

/**
 * Start one managed child process from a fully-specified spec; this seam
 * applies no defaults.
 * @param spec - argv, directory, stdio dispositions, grace, cancellation, and environment.
 * @returns the live process handle (streams/readers, signalling, outcome promise).
 */
abstract spawn(spec: SubprocessSpawnSpec): SubprocessHandle

/**
 * Allocate a real terminal and start one owned process session. This is the
 * only non-pipe process primitive: implementations own terminal byte I/O,
 * foreground groups, signals, and complete session-tree cleanup.
 * @param spec - fully specified argv, cwd, environment, dimensions, grace, and allocation cancellation.
 * @returns the live terminal handle after allocation succeeds.
 */
abstract spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle>
```

Source : [`packages/subprocess/subprocess/src/index.ts:102`](../../packages/subprocess/subprocess/src/index.ts)
<!-- END GENERATED cordis-surface -->
