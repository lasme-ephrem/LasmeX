# Appels distants Typert

Types partagés par les artefacts Remote générés, la passerelle Host et les assemblages d’API consommateurs. L’[Agent Note de la passerelle Typert](../../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.md) possède les décisions d’architecture et de transport ; cette page consigne les interfaces publiques littérales de [`lasmex-typert-protocol`](../../packages/typert/protocol/src/types.ts) et [`lasmex-api-gateway`](../../packages/api/gateway/src/types.ts).

## Déclarations de lookup et de Context

Les packages d’objets métier étendent deux tables vides par fusion de déclarations. Un lookup associe un type d’objet Host à son identité sur le fil ; une déclaration de Context associe une catégorie de Context à portée définie à son identité sur le fil. Les descripteurs générés nomment ces clés, tandis que les fournisseurs d’exécution assurent le comportement de résolution actif.

```ts type-equiv
/** Merge-extensible Host object lookup declarations. */
interface TypertLookupMap {}
```

```ts type-equiv
/** Merge-extensible scoped Context declarations. */
interface TypertContextMap {}
```

Le registre conserve la déclaration sur le fil d’un lookup après le déchargement de son résolveur. La découverte SRC continue donc à classer le paramètre comme lookup et échoue pour indisponibilité au lieu d’accepter la valeur transmise comme un objet métier ordinaire.

```ts type-equiv
/** Stable wire declaration retained after a lookup provider unloads. */
interface TypertLookupDefinition {
  /** Merge-declared lookup key. */
  readonly key: string
  /** Source parameter name recognized by the SRC weak parser. */
  readonly parameter: string
  /** Wire field replacing the Host object parameter. */
  readonly wire: string
  /** Canonical Host type symbol used by strict generation. */
  readonly hostTypeSymbol: string
  /** Canonical wire type symbol used by strict generation. */
  readonly wireTypeSymbol: string
}
```

## Descripteurs d’invocation

Un `InvocationDescriptor` relève de la réflexion locale, pas d’un message sur le fil. Les compilations Host et consommateur génèrent des descripteurs correspondants ; la requête envoie seulement le point d’accès et les `args` nommés. Les codecs stricts transportent des schémas générés, tandis que les codecs SRC imposent des valeurs compatibles avec JSON sans reconstituer leur structure de type. L’annulation est un signal de transport hors bande, injecté après les paramètres métier et jamais ajouté à `args`.

```ts type-equiv
/** Codec attached to one invocation parameter or result. */
type TypertCodec =
  | {
    readonly mode: 'strict'
    readonly typeSymbol: string
    readonly schema: TypertSchema
  }
  | {
    readonly mode: 'src-json'
  }
```

```ts type-equiv
/** One ordered business parameter in a Remote invocation. */
interface InvocationParameterDescriptor {
  /** Source-level parameter name. */
  readonly name: string
  /** Required key in the wire `args` object. */
  readonly wire: string
  /** Whether the value is JSON or requires a registered Host lookup. */
  readonly source: 'json' | 'lookup'
  /** Lookup key when `source` is `lookup`. */
  readonly lookup?: string
  /** Boundary codec for the wire representation. */
  readonly codec: TypertCodec
  /** Missing wire fields decode to `undefined` only for an explicitly declared `T | undefined`. */
  readonly acceptsUndefined?: true
}
```

```ts type-equiv
/** Carrier-independent description of one exported method invocation. */
interface InvocationDescriptor {
  /** Globally stable generated identity. */
  readonly id: string
  /** Cordis service key owning the method. */
  readonly service: string
  /** Wire namespace, defaulting to the service key. */
  readonly namespace: string
  /** Public instance method name. */
  readonly method: string
  /** Service member invoked when the exported method name is an alias. */
  readonly implementation?: string
  /** Receiver selection mode. */
  readonly invocation:
    | { readonly kind: 'direct' }
    | {
      readonly kind: 'context'
      readonly context: string
      readonly wire: string
      readonly codec: TypertCodec
    }
  /** Optional consuming-Context projection for one direct lookup parameter. */
  readonly scope?: {
    /** Context kind whose Client binder supplies the identity. */
    readonly context: string
    /** Lookup parameter wire field replaced by the Context identity. */
    readonly wire: string
  }
  /** Ordered business parameters. */
  readonly parameters: readonly InvocationParameterDescriptor[]
  /** Transport cancellation injected after business parameters instead of entering wire args. */
  readonly cancellation?: {
    /** Reserved final Host method parameter. */
    readonly parameter: 'signal'
  }
  /** Codec for the resolved method result. */
  readonly result: TypertCodec
  /** Source declaration used only for diagnostics. */
  readonly sourceLocation?: InvocationSourceLocation
}
```

## Registre Typert

`ctx.typert` sépare les descripteurs de l’environnement actuel, les contributions Remote sélectionnées explicitement, les fournisseurs de lookup et les fournisseurs de Context à portée définie. Un fournisseur de lookup possède la déclaration stable sur le fil et le résolveur par défaut. La composition Host peut configurer pour la même clé un résolveur synchrone ou asynchrone lié à un effet ; son déchargement restaure la politique par défaut. Les enregistrements sont des effets appartenant à Cordis et renvoient des disposers attendables.

```ts type-equiv
/** Minimal Typert runtime consumed through dependency inversion. */
interface TypertRegistryContract {
  readonly local: TypertLocalRegistry
  readonly remotes: TypertRemoteRegistry
  readonly lookups: TypertLookupRegistry
  readonly contexts: TypertContextRegistry
}
```

Les déclarations de consommateurs générées fusionnent les espaces de noms directs dans la table héritée par `TypertClientRemote`.

```ts type-equiv
/** Merge-extensible direct namespace surface generated for Client Remote services. */
interface TypertRemoteNamespaceMap {}
```

## Passerelle Host

Connection décode l’enveloppe de son transport avant d’appeler `ctx.typertGateway`. La requête transporte séparément les champs nommés exacts du fil et le signal d’annulation du transport. Les échecs d’infrastructure et de validation utilisent la taxonomie d’erreurs interne de la passerelle ; l’adaptateur RPC replie les exceptions ordinaires vers le code d’erreur de transport `internal`, tandis que les erreurs RPC existantes transmises par la politique de lookup au moyen de `TypertLookupFailure` sont renvoyées sans modification.

```ts type-equiv
/** One Remote method request after a carrier has decoded its envelope. */
interface InvokeRemoteRequest {
  /** Remote namespace selected by the generated descriptor. */
  readonly namespace: string
  /** Exported Service method name. */
  readonly method: string
  /** Named wire values; fields must exactly match the descriptor. */
  readonly args: Readonly<Record<string, unknown>>
  /** Carrier or direct-caller cancellation injected only into cancellation-aware methods. */
  readonly signal?: AbortSignal
}
```

```ts type-equiv
/** Stable infrastructure and boundary failures emitted before or after business execution. */
type TypertGatewayErrorCode =
  | 'ambiguous-endpoint'
  | 'arguments-invalid'
  | 'binding-invalid'
  | 'context-failed'
  | 'context-not-found'
  | 'context-unavailable'
  | 'definition-unavailable'
  | 'input-invalid'
  | 'invocation-unavailable'
  | 'lookup-failed'
  | 'lookup-not-found'
  | 'lookup-unavailable'
  | 'method-unavailable'
  | 'provider-mismatch'
  | 'result-invalid'
  | 'service-unavailable'
  | 'signature-invalid'
```

```ts type-equiv
/** Host dispatcher consumed by Connection adapters. */
interface TypertGateway {
  /**
   * Invoke one live Remote method without assuming a carrier or response envelope.
   * @param request - decoded endpoint and named wire arguments.
   * @returns the validated business result.
   * @throws {@link TypertGatewayError} for dispatch, provider, or boundary failures; lookup-policy and business errors retain identity.
   */
  invoke(request: InvokeRemoteRequest): Promise<unknown>
}
```

## Remote consommateur

`ctx.remote` expose uniquement les espaces de noms apportés par les artefacts `/remote` importés. `$mount()` installe les descripteurs générés et les méthodes concrètes en une opération appartenant à une fiber. Chaque espace de noms est un Service enfant Cordis tracé sous `remote.<namespace>`, dont la durée de vie couvre ses méthodes montées ; aucun Proxy JavaScript ni type de Service métier Host n’entre dans le consommateur.

```ts type-equiv
/** Client Remote capability implemented by the Gateway and consumed by Remote assemblies. */
interface TypertClientRemote extends TypertRemoteNamespaceMap {
  /**
   * Mount one generated Host-for-Client contribution in the caller's fiber.
   * @param contribution - explicitly selected Remote package artifact.
   * @returns disposer after namespace services and concrete methods are ready.
   */
  $mount(contribution: TypertRemoteContribution): Promise<TypertDisposer>
  /**
   * Subscribe to one forwarded Host event; delivery is one-way, in registration
   * order, and isolates a throwing listener from the rest.
   * @template Event - forwarded event name selected by the Host assembly.
   * @param event - forwarded Host event name, unchanged on the wire.
   * @param listener - receives the Host's argument list as declared by Cordis `Events`.
   * @returns disposer owned by the calling fiber.
   */
  $on<Event extends TypertRemoteEvent>(event: Event, listener: Events[Event]): () => void
  /**
   * Hand one decoded forwarded frame to the subscription table. The carrier
   * owning the Host frame sink calls this; a consumer subscribes with
   * {@link TypertClientRemote.$on} and never calls it.
   *
   * `event` is a plain string because this is the wire boundary: the name is
   * whatever the Host assembly's allowlist selected, and one nobody subscribed
   * to is dropped silently.
   * @param event - forwarded Host event name, exactly as the Host emitted it.
   * @param args - the Host argument list, already JSON-decoded.
   */
  $dispatch(event: string, args: readonly unknown[]): void
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Cette section est générée depuis le code source par `scripts/gen-cordis-catalog.ts` ; `pnpm run verify-cordis-catalog` vérifie sa fraîcheur dans doc-sync et `pnpm run gen-cordis-catalog` la régénère. Les blocs de signatures utilisent une fence `ts cordis-catalog` et conservent le JSDoc original. Les modes de distribution sont définis dans le [primer](../cordis-primer.md#dispatch-modes), tandis que l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxapiproxy--apiproxy"></a>

### `ctx.apiProxy` — `ApiProxy`

Interface racine de l’API unifiée. Un nouveau domaine de requêtes du client correspond à une nouvelle paire de fichiers, un champ ici et une ligne dans la table.

```ts cordis-catalog
/**
 * Response entry for server requests; not a domain method.
 * @param message - Client response carrying the server request's rpcId.
 * @returns Transport receipt for the response delivery.
 */
respond(message: ClientResponse): Promise<RpcReceipt>
```

Source : [`packages/host/apiproxy/src/api/index.ts:22`](../../packages/host/apiproxy/src/api/index.ts)

<a id="ctxtypert--typertregistry"></a>

### `ctx.typert` — `TypertRegistry`

Registre des schémas générés, de la réflexion des packages, des invocations et des fournisseurs de dépendances Remote.

```ts cordis-catalog
/**
 * Register one generated contribution atomically for the calling fiber.
 * Duplicate package-face identities, schemas, invocation ids, or endpoints
 * reject the whole batch.
 * @param contribution - generated schemas, reflection, and Host invocations.
 * @returns the exact effect disposer that removes this contribution.
 */
register(contribution: TypertContribution): TypertDisposer

/**
 * Look up one schema by `<package>#<name>`.
 * @param key - global schema key.
 * @returns the live schema record, or `undefined` when absent.
 */
get(key: string): TypertSchemaRecord | undefined

/**
 * Resolve one required schema.
 * @param key - global schema key.
 * @returns the live schema record.
 * @throws when the key is malformed, the package face is absent, or the schema is not contributed.
 */
resolve(key: string): TypertSchemaRecord

/**
 * Enumerate live schemas in registration order.
 * @param filter - optional package and face restriction.
 * @returns matching schema records.
 */
list(filter: TypertSchemaFilter = {}): TypertSchemaRecord[]

/**
 * Look up generated reflection for one package face.
 * @param packageName - exact npm package name.
 * @param face - face to query; defaults to the host runtime.
 * @returns the live package record, or `undefined` when absent.
 */
getPackage(packageName: string, face: TypertFace = 'host'): TypertPackageRecord | undefined

/**
 * Enumerate generated package reflection in registration order.
 * @param filter - optional package and face restriction.
 * @returns matching package records.
 */
listPackages(filter: TypertPackageFilter = {}): TypertPackageRecord[]

/**
 * Project a live Zod schema to JSON Schema without caching the result.
 * @param key - global schema key.
 * @param params - Zod projection parameters.
 * @returns a fresh JSON Schema document.
 */
toJSONSchema(key: string, params?: z.core.ToJSONSchemaParams): z.core.JSONSchema.BaseSchema
```

Types : [TypertContribution](invariants.md) · [TypertFace](invariants.md) · [TypertPackageFilter](invariants.md) · [TypertPackageRecord](invariants.md) · [TypertSchemaFilter](invariants.md) · [TypertSchemaRecord](invariants.md)

Source : [`packages/typert/registry/src/service.ts:446`](../../packages/typert/registry/src/service.ts)

<a id="ctxtypertgateway--typertgatewayservice"></a>

### `ctx.typertGateway` — `TypertGatewayService`

Résout les définitions générées strictes ou les marqueurs SRC conservateurs par rapport aux Services Cordis et fournisseurs Typert actuels.

```ts cordis-catalog
/**
 * Invoke one live Remote method through strict generated reflection or SRC markers.
 * @param request - decoded endpoint and exact named wire arguments.
 * @returns the validated business result.
 * @throws {@link TypertGatewayError} for dispatch, provider, or boundary failures; lookup-policy and business errors retain identity.
 */
async invoke(request: InvokeRemoteRequest): Promise<unknown>
```

Source : [`packages/api/gateway/src/index.ts:90`](../../packages/api/gateway/src/index.ts)
<!-- END GENERATED cordis-surface -->
