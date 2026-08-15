# Bac à sable de processus

Le seam de bac à sable de processus de [lasmex-sandbox](../../packages/sandbox/sandbox) enveloppe l’argv d’un sous-processus exécuté dans le même monde avec une politique d’effets sur les fichiers, sans coupler les consommateurs à un exécuteur propre à une plateforme. [lasmex-sandbox-local](../../packages/sandbox/sandbox-local) fournit bwrap/Landlock sous Linux, Seatbelt sous macOS et le backend Windows associant ACL et jeton restreint ; [lasmex-bash-sandbox](../../packages/shell/bash-sandbox) et [lasmex-pwsh-sandbox](../../packages/shell/pwsh-sandbox) le consomment. Les conteneurs, microVM et exécutions distantes sont des implémentations sœurs de seams de capacité complets, et non des fournisseurs de `ctx.sandbox`.

Source : [`packages/sandbox/sandbox/src/index.ts`](../../packages/sandbox/sandbox/src/index.ts)

## Modes et application

`SandboxMode` régit uniquement les effets sur le système de fichiers. `read-only` demande au backend d’interdire les écritures : les exécuteurs POSIX autorisent en plus le puits `/dev/null` dont leurs shells ont besoin, tandis que l’exécuteur ACL Windows n’accorde explicitement aucune racine accessible en écriture et signale une application partielle à cause des lacunes de ses ACL ambiantes. `workspace-write` autorise les écritures sous la racine du workspace et dans la zone temporaire promise par le backend. `danger-full-access` contourne le confinement. La visibilité du réseau et des processus ne fait pas partie de ce vocabulaire.

```ts type-equiv
/**
 * File-effect policy for confined processes. `read-only` permits only required
 * sinks such as `/dev/null`; `workspace-write` also permits the workspace and a
 * backend-defined temp area; `danger-full-access` bypasses confinement. Network
 * and process visibility are outside this vocabulary.
 */
type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'
```

Seuls les deux premiers modes peuvent être transmis à un fournisseur. Un consommateur en `danger-full-access` lance son argv original et n’appelle pas `ctx.sandbox`.

```ts type-equiv
/** A confining (non-`danger-full-access`) mode — the modes a {@link SandboxPolicy} can carry. */
type ConfinedSandboxMode = Exclude<SandboxMode, 'danger-full-access'>
```

Le niveau d’application est un fait déclaré. `full` signifie que le backend contrôle chaque effet sur les fichiers promis par le mode. `partial` signifie qu’un backend actif ou une ancienne ABI du noyau n’en contrôle qu’une partie ; les consommateurs qui exigent une garantie absolue doivent rejeter ce niveau ou rendre la distinction visible. Les anciennes ABI Landlock ainsi que les limites Windows relatives au groupe Everyone et aux liens physiques constituent les cas partiels actuels.

```ts type-equiv
/**
 * Enforcement completeness for this host. `partial` means an active backend or
 * older kernel ABI cannot govern every promised file effect; callers requiring
 * an absolute boundary must not treat it as `full`.
 */
type SandboxEnforcement = 'full' | 'partial'
```

## Politique par appel

La politique d’exécution complète est résolue et transportée pour chaque appel de capacité. Elle inclut `danger-full-access`, afin qu’un consommateur puisse résoudre la politique une fois avant de décider s’il contourne le confinement. Les appels d’outils ordinaires dérivent `workspaceRoot` du cwd immuable de la session appelante ; la configuration du déploiement sert de repli en l’absence d’agent. La racine est canonisée selon la sémantique du système de fichiers avant la normalisation lexicale, de sorte qu’un cwd contenant `symlink/..` désigne le répertoire dans lequel le processus lancé s’exécute réellement.

```ts type-equiv
/**
 * The complete file-effect policy resolved for one capability call. The root
 * is carried even under modes that do not consume it so callers can resolve
 * policy once before choosing the enforcement path.
 */
interface SandboxExecutionPolicy {
  /** The file-effect mode this execution runs under. */
  mode: SandboxMode
  /** Absolute root directory `workspace-write` may write under. */
  workspaceRoot: string
  /**
   * Opaque identity of the calling session (the branded `lasmex-session`
   * SessionId). Backends key per-session state off it (e.g. windows-acl gives
   * each live session/workspace pair a random private temp directory and SID,
   * while the workspace SID and standing grant remain per-workspace); absent
   * for agentless calls, which fall back to per-call backend state.
   */
  sessionId?: SessionId
}
```

`ctx.sandboxPolicy.resolve()` accepte la session active et, lors d’une nouvelle tentative approuvée, un mode explicite. Le service possède les règles de priorité et la racine de repli, afin que bash et fs ne les reproduisent pas.

```ts type-equiv
/** Inputs that select the sandbox policy for one capability call. */
interface SandboxPolicyRequest {
  /** Calling session; its immutable cwd becomes the workspace boundary. */
  session?: Session
  /** Explicit approved mode override, which outranks session policy. */
  mode?: SandboxMode
}
```

Seule une exécution confinée atteint `ctx.sandbox` ; la politique de son fournisseur restreint le mode tout en conservant la même racine. Des sessions et consommateurs concurrents, ainsi que de nouvelles tentatives ponctuelles avec élévation, peuvent ainsi demander simultanément au même fournisseur des limites différentes sans modifier son état.

```ts type-equiv
/**
 * What one confined execution is allowed to touch — carried PER CALL, not
 * fixed on the provider: two consumers may confine under different policies
 * at the same instant (bash under `read-only` while a confined child agent
 * needs its state directory writable), and an approved escalated retry is a
 * new call with a wider policy. Defaulting/resolution is an explicit step at
 * the consumer boundary; the provider treats the policy as fully specified.
 */
interface SandboxPolicy extends SandboxExecutionPolicy {
  /** The file-effect mode this execution runs under. */
  mode: ConfinedSandboxMode
}
```

## Argv enveloppé et dialectes de classification

`RunnerFailureRule` combine les preuves qu’un exécuteur a échoué avant d’exécuter la commande. Un consommateur exige une sortie non nulle, le filtre facultatif des codes de sortie autorisés et une signature fatale insensible à la casse dans une même ligne stderr restante. Les exclusions informatives correspondant exactement à une ligne complète sans tenir compte de la casse sont retirées en premier, afin qu’un avis bénin de l’exécuteur ne puisse pas constituer à lui seul une preuve d’échec. La ligne correspondante reste disponible comme détail de l’erreur ; la classification ne réécrit pas stderr.

```ts type-equiv
/**
 * Evidence that identifies a sandbox runner failing before it executes the
 * wrapped command. A consumer first applies {@link allowedExitCodes} when
 * present, removes {@link informationalLines} by case-insensitive exact line
 * equality, then matches {@link fatalSignatures} case-insensitively within
 * each remaining stderr line. Exit status alone never proves runner failure.
 */
interface RunnerFailureRule {
  /** Nonzero process exit codes on which this rule may match; omitted permits any nonzero exit. */
  allowedExitCodes?: readonly number[]
  /** Non-empty substrings identifying a fatal runner diagnostic on one stderr line. */
  fatalSignatures: readonly string[]
  /** Benign stderr lines excluded by exact full-line equality before fatal matching. */
  informationalLines?: readonly string[]
}
```

`ConfinedArgv` est la valeur lancée par le consommateur. Outre l’argv de remplacement, elle contient le niveau d’application du backend et deux classificateurs stderr orthogonaux. `denialSignatures` identifie le blocage de la commande confinée alors que le bac à sable fonctionne correctement. `runnerFailureRules` identifie le refus ou l’échec de l’exécuteur du bac à sable avant l’exécution de la commande ; les consommateurs vérifient d’abord ces règles et signalent une panne d’infrastructure du bac à sable, jamais un échec ordinaire de la tâche.

```ts type-equiv
/**
 * A {@link SandboxProvider.confine} result: the argv to spawn in place of
 * the caller's own, plus the enforcement completeness the selected backend
 * achieves for it.
 */
interface ConfinedArgv {
  /** The wrapped argv (runner, profile, separator, then the caller's argv). */
  argv: string[]
  /** How completely the selected backend enforces the policy's file effects. */
  enforcement: SandboxEnforcement
  /**
   * The selected backend's denial DIALECT: the case-insensitive stderr
   * substrings a file effect denied by THIS backend produces (EROFS text
   * under bwrap's read-only binds, EACCES under Landlock, EPERM under
   * Seatbelt). A consumer that infers denials from a failed run's stderr
   * matches against exactly these rather than a cross-backend union — the
   * union claims denials a given backend never produces.
   */
  denialSignatures: readonly string[]
  /**
   * Structured runner-failure evidence rules. Consumers require a matching
   * fatal stderr line (after informational exclusions) and any rule-specific
   * exit-code gate before checking denial signatures: runner failure means the
   * command never ran, while denial means confinement worked and blocked it.
   */
  runnerFailureRules: readonly RunnerFailureRule[]
}
```

Le [fournisseur local](../../packages/sandbox/sandbox-local/README.md) possède la configuration opérateur et traduit le dialecte de son exécuteur dans ces règles. Le [consommateur bash en bac à sable](../../packages/shell/bash-sandbox/README.md) possède le lancement et l’attribution du résultat.

## Fournisseur et erreurs restrictives

`ctx.sandbox.confine(argv, policy)` renvoie un `ConfinedArgv` ou lève `SandboxUnavailableError` avec le code `SANDBOX_UNAVAILABLE` lorsqu’aucun backend utilisable n’est disponible. Les consommateurs peuvent également classifier un échec pendant le lancement ou l’observation de l’argv renvoyé ; cette attribution relève du comportement promis par le consommateur. Un passage silencieux sans confinement n’est jamais autorisé pour une politique confinée.

La sélection du fournisseur, les sondes, la mise en cache et les rapports d’application propres aux backends appartiennent au [fournisseur local](../../packages/sandbox/sandbox-local/README.md).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Cette section est générée depuis le code source par `scripts/gen-cordis-catalog.ts` ; `pnpm run verify-cordis-catalog` vérifie sa fraîcheur dans doc-sync et `pnpm run gen-cordis-catalog` la régénère. Les blocs de signatures utilisent une fence `ts cordis-catalog` et conservent le JSDoc original. Les modes de distribution sont définis dans le [primer](../cordis-primer.md#dispatch-modes), tandis que l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsandbox--sandboxprovider-abstract-seam"></a>

### `ctx.sandbox` — `SandboxProvider` (seam abstrait)

Service abstrait de bac à sable de processus. confine doit renvoyer un argv qui applique les restrictions ou échouer de manière restrictive pendant l’enveloppement ou l’exécution de l’exécuteur ; un passage silencieux sans confinement est interdit. Des sondes fonctionnelles arbitrent les chaînes comportant plusieurs exécuteurs et peuvent être omises lorsqu’il n’existe qu’un candidat, dont le propre refus reste le résultat restrictif final.

```ts cordis-catalog
/**
 * Wrap `argv` so it executes confined under `policy` on this host; the
 * caller spawns the returned argv in place of its own.
 * @param argv - the exact argv the caller is about to spawn (program plus
 *   arguments), NOT a shell string — a shell-shaped consumer passes
 *   `['bash', '-c', command]`.
 * @param policy - the file-effect policy this execution runs under,
 *   carried per call (see {@link SandboxPolicy}).
 * @returns the argv to spawn instead, plus the enforcement completeness
 *   the selected backend achieves for it.
 */
abstract confine(argv: readonly string[], policy: SandboxPolicy): ConfinedArgv
```

Source : [`packages/sandbox/sandbox/src/index.ts:158`](../../packages/sandbox/sandbox/src/index.ts)

<a id="ctxsandboxpolicy--sandboxpolicyservice"></a>

### `ctx.sandboxPolicy` — `SandboxPolicyService`

Le service de politique du bac à sable (`ctx.sandboxPolicy`). Il possède le mode par défaut du déploiement, la racine de workspace de repli et la section de politique active au moment de la requête. Les couches d’outils appellent resolve pour chaque exécution, afin que le mode consigné de la session et son cwd immuable parviennent ensemble à chaque capacité chargée de les appliquer.

```ts cordis-catalog
/**
 * Resolve the complete policy for one capability call. An approved explicit
 * mode outranks the session's last `sandbox/mode` event, which outranks the
 * deployment default. A session cwd is its workspace-write boundary; the
 * configured root is the fallback for agentless calls and sessions without a
 * cwd.
 * @param request - optional session and approved mode override.
 * @returns the fully resolved per-call mode and absolute workspace root.
 */
resolve(request: SandboxPolicyRequest = {}): SandboxExecutionPolicy

/**
 * Read the session override without applying the deployment default.
 * @param session - session whose log supplies the override.
 * @returns the last logged mode, or `undefined` without one.
 */
overrideOf(session: Session): SandboxMode | undefined
```

Types : [Session](session.md)

Source : [`packages/sandbox/sandbox-policy/src/index.ts:91`](../../packages/sandbox/sandbox-policy/src/index.ts)
<!-- END GENERATED cordis-surface -->
