# Runtime d’exécution de code

Le seam d’exécution de code est un [seam de fonctionnalité](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md) dont la définition de service ([lasmex-code-runtime](../../packages/code-runtime/code-runtime), `ctx.codeRuntime`) exécute un programme écrit par le modèle avec des liaisons asynchrones fournies par l’hôte, puis rapporte ce que le programme a affiché et renvoyé. L’exécution de code est **une fonctionnalité facultative**, distincte du cœur de la boucle d’agent. Son vocabulaire se trouve donc ici plutôt que dans [core.md](core.md). Les backends se distinguent par leur support d’exécution et leur langage source, tous deux décrits par des propriétés en lecture seule du service. Le fournisseur à thread worker et le consommateur du registre d’outils sont définis par les notes sur les [fondations du mode Code](../../.agents/notes/implemented/feature/2026-06-15-code-mode.md) et le [contrat des valeurs de retour typées](../../.agents/notes/implemented/feature/2026-07-20-code-mode-typed-tool-returns.md).

Source : [`packages/code-runtime/code-runtime/src/types.ts`](../../packages/code-runtime/code-runtime/src/types.ts)

## Une exécution : de la requête au résultat

Une `CodeRunRequest` contient **toutes les données utilisées par le runtime**. Conformément à la règle « explicite > implicite aux limites des packages », les valeurs par défaut, comme les budgets de temps et les limites de sortie, appartiennent à la configuration validée de l’implémentation. Elles ne proviennent jamais d’un `??` caché dans `run()` :

```ts type-equiv
/**
 * One run: the program source plus everything the runtime acts on. Per the
 * explicit-over-implicit convention, defaulting (time budgets, output caps)
 * is the implementation's validated config — a request carries no optional
 * tuning knobs for a hidden `??` to fill in.
 */
interface CodeRunRequest {
  /**
   * The program source, in the runtime's {@link ../index.ts | language}. It
   * runs as the body of an async function: top-level `await` and `return`
   * are available, and the completion value becomes
   * {@link CodeRunResult.value}.
   */
  program: string
  /** Host functions exposed to the program, one global object per namespace. */
  bindings: CodeBindingNamespace[]
  /**
   * Abort the run: the runtime stops the program (hard, even mid-loop) and
   * resolves with a {@link CodeRunFailure} of kind `'abort'`. In-flight
   * binding calls are the CALLER's to settle — the runtime only stops asking.
   */
  signal?: AbortSignal
}
```

Le résultat expose une erreur dans un **champ** et ne rejette jamais `run()`. Signaler l’échec d’un programme relève de l’appelant, pas d’un chemin d’exception, conformément au contrat de résolution en cas d’échec de `ShellExecutor.run` :

```ts type-equiv
/**
 * The outcome of one run. An error is a FIELD on a resolved result, never a
 * rejection of `run()` — reporting a failed program is the caller's job, not
 * an exception path.
 */
interface CodeRunResult {
  /**
   * The program's completion value (its top-level `return`), when it ran to
   * completion and the value crossed the runtime's lossless-JSON boundary.
   * Invalid or over-limit completions fail the run instead of substituting a
   * rendered string; a failed or value-less run leaves this absent.
   */
  value?: CodeJsonValue
  /** Text the program emitted, in order, bounded only as part of the outer result. */
  logs: string[]
  /** Present iff the run failed; see {@link CodeRunFailure} for the taxonomy. */
  error?: CodeRunFailure
}
```

## Liaisons : des fonctions de l’hôte comme objets globaux

Chaque `CodeBindingNamespace` devient dans le programme un objet global composé de fonctions asynchrones. Le consommateur du mode Code en fournit un : `tools`. Les arguments et les valeurs résolues doivent être du JSON sans perte et traversent le seam sans limite d’octets propre à celui-ci ; le runtime peut les transporter par clonage structuré. Un espace de noms peut déclarer une classe d’erreur visible par le programme sans imposer au runtime les noms du consommateur : le runtime injecte le véritable constructeur et transforme les appels rejetés en instances de cette classe. Il traite également les noms de liaisons comme des entrées hostiles : `__proto__` reste une propriété directe ordinaire et ne provoque jamais de collision avec le prototype.

```ts type-equiv
/**
 * Program-visible typed rejection for one binding namespace. The runtime
 * injects a real error constructor under `name`; rejected member calls become
 * its instances and expose the exact member name through
 * `memberNameProperty`. Both strings are runtime data rather than knowledge
 * of a particular consumer such as Code Mode.
 */
interface CodeBindingErrorClass {
  /** Constructor global and resulting `Error.name`; same portable identifier rule as {@link CodeBindingNamespace.global}. */
  name: string
  /**
   * Non-empty own property for the member name. The portable exclusion set is
   * `RESERVED_ERROR_MEMBERS` plus dunder-form names (`__x__`, non-empty
   * middle), enforced identically by every backend; any other name —
   * identifiers or not — is accepted everywhere.
   */
  memberNameProperty: string
}
```

```ts type-equiv
/**
 * A named group of {@link CodeBindingFunction}s the runtime exposes to the
 * program as one global object (e.g. `tools`). Function names are arbitrary
 * strings — a runtime must treat names like `__proto__` or `constructor` as
 * ordinary own properties (null-prototype construction), never as prototype
 * collisions.
 */
interface CodeBindingNamespace {
  /**
   * The global identifier the program sees. Must match the LANGUAGE-PORTABLE
   * identifier subset `[A-Za-z_][A-Za-z0-9_]*` and no language's reserved
   * words, so the same namespace list works against every backend regardless
   * of `language` — a JS-only spelling like `$tools` is rejected by design,
   * not just by the Python backend. Names that satisfy the identifier rule but
   * name a backend-owned slot (`RESERVED_BINDING_GLOBALS`, e.g. `console`,
   * `__dsh_main__`) are also refused everywhere; see its declaration for the
   * exact set and why each entry is reserved.
   */
  global: string
  /** The callable members, keyed by the exact name the program calls. */
  functions: Record<string, CodeBindingFunction>
  /** Optional program-visible typed rejection contract for this namespace. */
  errorClass?: CodeBindingErrorClass
}
```

```ts type-equiv
/** A lossless JSON value transferable through the dependency-light Service Definition. */
type CodeJsonValue = null | boolean | number | string | CodeJsonValue[] | { [key: string]: CodeJsonValue }
```

```ts type-equiv
/**
 * One host-side function exposed to the program as an async callable. The
 * runtime bridges calls to it (possibly across a serialization boundary), so
 * `args` and the resolution value MUST be lossless JSON. A runtime rejects a
 * lossy or non-cloneable value with a descriptive error rather than corrupting
 * the run. No seam-level byte cap applies to a binding resolution. A rejection
 * of this function surfaces inside the program as a rejection of the
 * corresponding call.
 */
type CodeBindingFunction = (args: unknown) => Promise<CodeJsonValue>
```

## Sortie capturée et taxonomie des échecs

Les journaux sont des chaînes ordinaires conservées dans leur ordre d’émission. Le runtime capture la console et les flux de sortie du programme, mais le seam n’inclut ni le canal ni la méthode de console, car les consommateurs n’affichent que le texte. Les implémentations limitent la taille sérialisée du tableau de journaux externe et de la valeur finale ou du message d’échec. La syntaxe fixe de l’enveloppe de résultat et les espaces ajoutés par la présentation du consommateur n’appartiennent pas à ce décompte variable. Un dépassement constitue un échec explicite plutôt qu’un remplacement de valeur dans la bande.

Les types d’échec sont des **résultats orthogonaux signalés séparément**, conformément aux [pratiques défensives](../defensive-patterns.md) : l’expiration d’un budget n’est pas une exception, une annulation n’est pas un délai dépassé et la mort du support d’exécution, par exemple après une mémoire épuisée, n’est ni l’un ni l’autre :

```ts type-equiv
/**
 * Why a run failed. The kinds are orthogonal outcomes reported independently
 * (per docs/defensive-patterns.md): a budget expiry is not an exception, an
 * abort is not a timeout, and a substrate death is neither.
 *
 * - `'exception'` — the program threw or failed to parse/transform.
 * - `'timeout'` — an implementation-owned budget expired; the message says which.
 * - `'abort'` — {@link CodeRunRequest.signal} fired.
 * - `'worker-exit'` — the execution substrate died without settling (e.g. OOM).
 * - `'invalid-output'` — the completion value was not lossless JSON.
 * - `'output-limit'` — the serialized outer logs/value/diagnostic exceeded the configured cap.
 */
interface CodeRunFailure {
  /** The failure class (see the interface doc for each kind's meaning). */
  kind: 'exception' | 'timeout' | 'abort' | 'worker-exit' | 'invalid-output' | 'output-limit'
  /** Human-readable detail, suitable for feeding back to a model to self-correct. */
  message: string
}
```

## Le service

`CodeRuntime` (`ctx.codeRuntime`, abstrait et défini dans [`packages/code-runtime/code-runtime/src/index.ts`](../../packages/code-runtime/code-runtime/src/index.ts)) comprend `run(request)` et deux descripteurs en lecture seule. `language` indique le langage dans lequel le programme doit être écrit. `'typescript'` et `'python'` sont les valeurs reconnues et présentées par `lasmex-tools`, mais seul `'typescript'` possède un backend publié. Un consommateur qui produit une présentation propre au langage sélectionne explicitement cette valeur et échoue s’il ne sait pas la présenter. `isolation` décrit le support d’exécution parmi `'worker-thread'`, `'process'` et `'container'` ; il s’agit d’un libellé de diagnostic, **pas d’une garantie de sécurité**. Les implémentations doivent isoler les exécutions les unes des autres, sans état partagé entre elles, et attendre leur arrêt complet au démontage : les exécutions en cours sont interrompues et attendues avant la fin du nettoyage.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Générée depuis les sources par `scripts/gen-cordis-catalog.ts` (sa fraîcheur est vérifiée par `pnpm run verify-cordis-catalog` dans doc-sync ; régénérez-la avec `pnpm run gen-cordis-catalog`) — cette section est identique octet pour octet dans les deux langues de la page. Les blocs de signature utilisent une clôture `ts cordis-catalog` et conservent la JSDoc source d’origine. Les modes de répartition sont définis dans le [guide d’introduction](../cordis-primer.md#dispatch-modes), et l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcoderuntime--coderuntime-abstract-seam"></a>

### `ctx.codeRuntime` — `CodeRuntime` (seam abstrait)

Enregistre une implémentation de `ctx.codeRuntime`. Les échecs du programme, du budget, de l’annulation et du support d’exécution sont renvoyés dans CodeRunResult ; seule une utilisation incorrecte du contrat de la définition de service rejette la promesse. Les implémentations transportent les liaisons compatibles avec le clonage structuré, matérialisent la classe de rejet déclarée par chaque espace de noms, traitent les programmes comme des homologues hostiles, isolent les exécutions et interrompent puis attendent celles qui sont encore actives au démontage.

```ts cordis-catalog
/**
 * Execute one program against the request's bindings and capture what it
 * emitted. See the class doc for the resolution contract (error is a result
 * field; rejection means Service Definition contract misuse only).
 * @param request - the program, its bindings, and the abort signal; the
 *   request carries everything the runtime acts on, with no hidden defaults.
 * @returns the run's outcome: completion value (when transferable), the
 *   ordered log capture, and the failure (if any).
 */
abstract run(request: CodeRunRequest): Promise<CodeRunResult>
```

Source : [`packages/code-runtime/code-runtime/src/index.ts:102`](../../packages/code-runtime/code-runtime/src/index.ts)
<!-- END GENERATED cordis-surface -->
