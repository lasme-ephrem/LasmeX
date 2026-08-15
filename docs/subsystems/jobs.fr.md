# Runtime des tâches en arrière-plan

Types partagés par les producteurs de longue durée, `ctx.jobs` et les commandes de tâches. L’[Agent Note du runtime](../../.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.md) décrit la conception. Cette page consigne les champs et variantes exacts de [`packages/jobs/jobs/src/types.ts`](../../packages/jobs/jobs/src/types.ts).

## Identifiants et états

`JobId` est un [identifiant marqué](core.md#branded-ids) généré sous la forme `<kind>-N`. Le contrôle d’accès repose sur l’autorisation du propriétaire, pas sur le secret de l’identifiant. `JobKind` dérive d’une carte extensible par fusion ; le registre traite les types comme des espaces de noms opaques d’identifiants.

```ts type-equiv
/**
 * Producer-defined job kinds. Plugins extend this map by declaration merging;
 * the registry treats every value as an opaque id namespace.
 */
interface JobKindMap {
  bash: 'bash'
  subagent: 'subagent'
}
```

`JobStatus` est `'running' | 'stopping' | 'completed' | 'killed' | 'failed'`. Les faits propres à un producteur appartiennent à `JobSnapshot.detail`.

## Contrat du producteur

`JobStart` déclare une identité et une fonction de démarrage. Le runtime termine ses vérifications préalables avant d’appeler `run()` et valide l’enregistrement sans étape ultérieure susceptible d’échouer. Les producteurs possèdent les ressources d’exécution ; le runtime possède l’identité, l’accès et l’état du cycle de vie.

```ts type-equiv
/**
 * Producer declaration passed to {@link JobRegistry.start}. The runtime
 * preflights access and cleanup before invoking {@link run}; the producer owns
 * execution resources while the runtime owns identity and lifecycle state.
 */
interface JobStart {
  /** Producer kind — also the id prefix (`bash`, `subagent`, …). */
  kind: JobKind
  /** One-line model-facing label (the command; the delegation description). */
  label: string
  /**
   * Optional UTF-8 byte cap for each complete model-facing completion notice or
   * output read, including controller status metadata.
   */
  outputLimitBytes?: number
  /**
   * Owning live agent. Access is fenced by its session id, and agent disposal
   * cancels and awaits the job. The instance must be the one currently
   * registered under its agent id. Omitting the owner creates an unowned job,
   * open to any caller until service disposal.
   */
  owner?: Agent
  /**
   * Start the work after preflight and synchronously return its hooks. Called
   * once; a throw leaves nothing registered, and the producer must clean up any
   * partially started resources.
   */
  run(): JobHooks
}
```

`JobHooks.done` est résolu après que le producteur a libéré ses ressources, pas seulement lorsque le travail est terminé. Le membre facultatif `readOutput` distingue les tâches à flux consommable de celles qui ne fournissent qu’une sortie finale.

```ts type-equiv
/** Hooks through which the runtime controls and observes producer work. */
interface JobHooks {
  /**
   * Request termination. Must be synchronous, idempotent, and eventually settle
   * {@link done}; throws propagate. The optional reason is forwarded verbatim.
   */
  cancel(reason?: string): void
  /**
   * Resolves after the producer releases its resources, not merely when work
   * finishes. Must not reject; the runtime converts a rejection to `failed`.
   * If teardown cancellation throws, the runtime may force-fail only the
   * registry record without claiming that the work stopped.
   */
  done: Promise<JobOutcome>
  /**
   * Consume output produced since the previous call. The producer formats
   * truncation and spill notices. Absence marks a final-output-only job; each
   * job has one consuming cursor.
   */
  readOutput?(): string
}
```

```ts type-equiv
/** Terminal result supplied by a producer through {@link JobHooks.done}. */
interface JobOutcome {
  /** How the job ended: finished (`completed`), cancelled (`killed`), or broke (`failed`). */
  status: 'completed' | 'killed' | 'failed'
  /** Kind-specific detail rendered into status lines ('exit code: 3', 'max-tokens'). */
  detail?: string
  /** Final output for jobs without `readOutput`; stream jobs leave it unset. */
  output?: string
}
```

## Vues des consommateurs

Les instantanés sont de nouvelles projections en lecture seule. `ownerSession` transporte le `SessionId` partagé utilisé pour l’autorisation. Les écouteurs de fin reçoivent séparément l’objet propriétaire exact employé pour le nettoyage du cycle de vie. `reported` supprime un avis de fin lorsqu’un autre rapporteur a déjà livré, ou s’est engagé à livrer, l’état terminal. Cela inclut l’annulation au démontage qui vide un propriétaire ou le service.

```ts type-equiv
/**
 * A read-only projection of one job, safe to hand to listeners and tools —
 * a fresh object per call, never live registry state.
 */
interface JobSnapshot {
  /** The registry-issued id (`<kind>-N`). */
  id: JobId
  /** The producer kind the job was registered with. */
  kind: JobKind
  /** The producer-supplied one-line label. */
  label: string
  /** Producer-owned cap for complete model-facing notices and output reads. */
  outputLimitBytes?: number
  /**
   * Owner session id used for authorization and correlation; absent for
   * unowned jobs. Completion listeners receive the exact {@link Agent}
   * separately through {@link JobDoneListener}.
   */
  ownerSession?: SessionId
  /** Current lifecycle state. */
  status: JobStatus
  /** Kind-specific status detail, present once the producer supplied one (usually terminal). */
  detail?: string
  /** Epoch ms when the job was registered. */
  startedAt: number
  /** Epoch ms when the job settled; absent while `running`/`stopping`. */
  finishedAt?: number
  /**
   * True when a kill, read, wait, or teardown cancel has reported or committed
   * to report the terminal state. Completion reporters suppress redundant
   * notices when set. Teardown claims it because the owner or service being
   * destroyed leaves no reader: a reporter that opens a turn on notice would
   * otherwise spend a model request per teardown layer.
   */
  reported: boolean
}
```

```ts type-equiv
/** Output and post-read state returned by {@link JobRegistry.read}. */
interface JobRead {
  /**
   * Stream kinds: the consuming delta since the previous read. Final-output
   * kinds: empty while live, the terminal {@link JobOutcome.output} (or
   * empty) once settled — idempotent, never consumed.
   */
  text: string
  /** The job's state at read time. */
  snapshot: JobSnapshot
}
```

## Comportement du service

La définition de service abstraite [`JobRegistry`](../../packages/jobs/jobs/src/index.ts) précise les opérations atomiques `start`, `get` et `list` limitées à l’appelant, `read`, `kill`, `wait` borné, les écouteurs `onJobDone` et `onJobsChanged` isolés des échecs, ainsi que le moment où `attachController` devient disponible. [`LocalJobRegistry`](../../packages/jobs/jobs-local/src/index.ts) est le fournisseur de service propre au processus. L’autorisation compare les sessions propriétaires ; le nettoyage du propriétaire et l’admission emploient l’instance `Agent` enregistrée exacte. La configuration entière positive sûre `maxConcurrentJobsPerOwner` du fournisseur local vaut `10` par défaut. Elle compte les enregistrements `running` et `stopping` par propriétaire exact, avec un compartiment partagé pour les tâches sans propriétaire. La résolution terminale du producteur libère la capacité. Consultez [`lasmex-jobs`](../../packages/jobs/jobs/README.md) pour le contrat de la définition de service, [`lasmex-jobs-local`](../../packages/jobs/jobs-local/README.md) pour le cycle de vie du registre et sa politique d’admission, et [`lasmex-tool-jobs`](../../packages/jobs/tool-jobs/README.md) pour le consommateur destiné au modèle.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Générée depuis les sources par `scripts/gen-cordis-catalog.ts` (sa fraîcheur est vérifiée par `pnpm run verify-cordis-catalog` dans doc-sync ; régénérez-la avec `pnpm run gen-cordis-catalog`) — cette section est identique octet pour octet dans les deux langues de la page. Les blocs de signature utilisent une clôture `ts cordis-catalog` et conservent la JSDoc source d’origine. Les modes de répartition sont définis dans le [guide d’introduction](../cordis-primer.md#dispatch-modes), et l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxjobs--jobregistry-abstract-seam"></a>

### `ctx.jobs` — `JobRegistry` (seam abstrait)

Registre abstrait des tâches en arrière-plan. Créez une sous-classe, implémentez les méthodes abstraites et chargez-la comme plugin : elle s’enregistre sous `ctx.jobs`. Une seule implémentation est autorisée par contexte ; en charger une seconde lève une erreur, conformément au comportement standard des services Cordis.

Les implémentations doivent respecter les règles suivantes :

- Les enregistrements survivent aux fibres du producteur et du contrôleur. La libération du propriétaire ou du service annule le travail actif et attend les producteurs conformes. Une annulation au démontage qui lève une exception ne force que l’échec de l’enregistrement. L’annulation au démontage marque aussi l’enregistrement comme rapporté : lorsque son propriétaire est détruit, plus aucun lecteur ne reste.
- L’accès à une tâche possédée est limité par l’identifiant de session du propriétaire. Les identifiants sont prévisibles ; l’autorisation, et non le secret, constitue la protection.
- La première résolution l’emporte : un enregistrement terminal, la libération des attentes et un seul cycle de notification confinée, même face à un résultat tardif du producteur. La fin est annoncée en dernier, après la validation de l’enregistrement et son observation par tous les autres observateurs, car un rapporteur peut ouvrir un tour du modèle de manière synchrone.
- start refuse le travail lorsqu’aucun contrôleur de tâches attaché ne sert le propriétaire de la spécification. Un producteur ne peut ainsi lancer un travail que son propriétaire ne pourrait ni récupérer ni arrêter. Un registre sert toutes les compositions du processus. Cette décision et la livraison aux écouteurs de fin sont donc relatives au propriétaire, pas au processus entier : les enregistrements provenant d’un contexte sans portée servent tous les propriétaires ; ceux provenant de la portée d’une composition d’agent servent exactement les agents composés sous celle-ci.

```ts cordis-catalog
/**
 * Preflight access, validation, owner cleanup, and implementation-owned
 * admission before starting and atomically registering work. Any preflight
 * rejection leaves no job id or execution resource. A throwing starter
 * leaves nothing registered; after it returns, registration cannot fail.
 * Settlement records the outcome, notifies listeners, and releases waiters.
 * @param spec - job identity, owner, and synchronous starter.
 * @returns the registry-issued `<kind>-N` id.
 */
abstract start(spec: JobStart): JobId

/**
 * List caller-owned and unowned jobs in registration order without exposing
 * another session's labels.
 * @param caller - reading agent; a non-agent caller sees only unowned jobs.
 * @returns fresh snapshots.
 */
abstract list(caller?: Agent): JobSnapshot[]

/**
 * Return a non-consuming snapshot without changing its read cursor or notice
 * state. Throws for an unknown or foreign job.
 * @param id - job to look up.
 * @param caller - reading agent checked against the owner.
 * @returns a fresh snapshot.
 */
abstract get(id: JobId, caller?: Agent): JobSnapshot

/**
 * Read the next stream delta, or the idempotent final output after settlement.
 * A terminal read marks the job reported. Throws for an unknown or foreign
 * job.
 * @param id - job to read.
 * @param caller - reading agent checked against the owner.
 * @returns output text and the post-read snapshot.
 */
abstract read(id: JobId, caller?: Agent): JobRead

/**
 * Request cancellation, then mark the job stopping and reported. A producer
 * throw propagates without changing job state. Throws for an unknown or
 * foreign job.
 * @param id - job to cancel.
 * @param caller - killing agent checked against the owner.
 * @param reason - logged reason forwarded to the producer.
 * @returns `requested` for live work, otherwise `already-finished`.
 */
abstract kill(id: JobId, caller?: Agent, reason?: string): 'requested' | 'already-finished'

/**
 * Wait for settlement or timeout without cancelling the job. Caller abort
 * rejects only while the job is live; after settlement the terminal
 * snapshot wins so a notice suppressed for this waiter is still delivered.
 * Throws for invalid, unknown, or foreign input.
 * @param id - job to wait for.
 * @param timeoutMs - positive finite wait bound in milliseconds.
 * @param caller - waiting agent checked against the owner.
 * @param signal - optional cancellation of the wait itself.
 * @returns snapshot at settlement or timeout.
 */
abstract wait(id: JobId, timeoutMs: number, caller?: Agent, signal?: AbortSignal): Promise<JobSnapshot>

/**
 * Register an effect-scoped completion listener. It receives the settlements
 * of the owners its registering context's scope covers; each listener is
 * contained; returned promises are observed but not awaited. No listener runs
 * after service disposal.
 * @param listener - receives each terminal snapshot and its exact owner.
 * @returns disposer that unregisters the listener.
 */
abstract onJobDone(listener: JobDoneListener): () => void

/**
/**
 * Register an effect-scoped observer of visible-set changes. It fires after
 * every commit that changes what {@link list} returns for that owner —
 * registration, every stopping transition (including the one teardown
 * performs before it awaits a slow producer), settlement, owner-disposal
 * removal, and the emptying that service disposal commits — so an observer
 * re-reads rather than accumulating deltas.
 *
 * Delivery is owner-relative on the same terms as {@link onJobDone}: an
 * observer registered from an unscoped context — a host composition's own
 * carrier — sees every owner, while one registered under an agent
 * composition's scope sees exactly the agents composed under it.
 *
 * This is not a superset of {@link onJobDone}: that one delivers the terminal
 * record under first-wins semantics a job controller couples to notice
 * delivery, while this one carries no delivery meaning and marks nothing
 * reported. Listeners are contained and never awaited.
 * @param listener - receives the owner whose visible set changed, or
 *   `undefined` when an unowned job changed and every caller's set did.
 * @returns disposer that unregisters the listener.
 */
abstract onJobsChanged(listener: JobsChangedListener): () => void

/**
 * Attach an effect-scoped controller that can read and stop jobs. It serves the
 * owners its registering context's scope covers, and {@link start} refuses an
 * owner no attached controller serves.
 * @param name - diagnostic label; duplicate names remain independent.
 * @returns disposer that detaches this controller.
 */
abstract attachController(name: string): () => void
```

Types : [Agent](core.md)

Source : [`packages/jobs/jobs/src/index.ts:62`](../../packages/jobs/jobs/src/index.ts)
<!-- END GENERATED cordis-surface -->
