# Références de session

Ce sous-système prépare les références structurées entre sessions et les contextes de message correspondants. Le [contrat du package](../../packages/context/session-reference) définit les URI canoniques, la projection de la surface courante, l’encodage JSON qui préserve les balises, la conservation exacte des octets, les erreurs stables et l’invite qui délimite les données non fiables destinées au modèle. Les adaptateurs hôtes emploient ces types au lieu de transmettre au cœur de l’agent la syntaxe de mention propre à leur interface.

Source : [`packages/context/session-reference/src/types.ts`](../../packages/context/session-reference/src/types.ts)

## Entrées et candidats

`SessionReferenceInput` est la sélection indépendante de l’hôte. L’identifiant fait autorité ; le libellé est une métadonnée d’affichage conservée dans l’instantané.

```ts type-equiv
/** One source session selected by a host. */
interface SessionReferenceInput {
  /** Opaque source session identity. */
  sessionId: SessionId
  /** Optional user-facing mention label. */
  label?: string
}
```

`SessionReferenceCandidate` est le résultat de découverte destiné à l’hôte. Son libellé reprend le dernier titre de la session lorsqu’il existe, tandis que le filtrage porte uniquement sur l’identifiant de session et le répertoire de travail, jamais sur la transcription.

```ts type-equiv
/** One host-facing candidate from exact session metadata. */
interface SessionReferenceCandidate {
  /** Opaque source session identity. */
  sessionId: SessionId
  /** Latest log-backed title, falling back to the opaque session id. */
  label: string
  /** Source session working directory, when recorded. */
  cwd?: string
  /** Source session creation time in Unix epoch milliseconds. */
  createdAt: number
}
```

## Messages préparés

La préparation conserve le contenu lisible du message courant et renvoie au maximum un contexte agrégé.

```ts type-equiv
/** Direct message content and optional referenced-session context. */
interface PreparedReferencedMessage {
  /** Readable message content after host mention tokens are removed. */
  content: ContentBlock[]
  /** Aggregated untrusted snapshot, absent when the message has no references. */
  additionalContext?: UserMessage
}
```

## Erreurs

`SessionReferenceError.code` distingue une configuration ou une entrée invalide, une autoréférence, une limite de nombre, un échec de lecture de la source, un dépassement de budget et une annulation. Les protocoles hôtes associent ces codes à leurs propres enveloppes d’erreur sans examiner les octets de l’invite.

```ts type-equiv
/** Stable failure codes exposed to host adapters. */
type SessionReferenceErrorCode =
  | 'SESSION_REFERENCE_INVALID_CONFIG'
  | 'SESSION_REFERENCE_INVALID_REFERENCE'
  | 'SESSION_REFERENCE_SELF_REFERENCE'
  | 'SESSION_REFERENCE_TOO_MANY'
  | 'SESSION_REFERENCE_READ_FAILED'
  | 'SESSION_REFERENCE_BUDGET_EXCEEDED'
  | 'SESSION_REFERENCE_CANCELLED'
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Générée depuis les sources par `scripts/gen-cordis-catalog.ts` (sa fraîcheur est vérifiée par `pnpm run verify-cordis-catalog` dans doc-sync ; régénérez-la avec `pnpm run gen-cordis-catalog`) — cette section est identique octet pour octet dans les deux langues de la page. Les blocs de signature utilisent une clôture `ts cordis-catalog` et conservent la JSDoc source d’origine. Les modes de répartition sont définis dans le [guide d’introduction](../cordis-primer.md#dispatch-modes), et l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessionreferenceresolver--sessionreferenceresolver"></a>

### `ctx.sessionReferenceResolver` — `SessionReferenceResolver`

Consommateur de lecture exacte qui prépare un contexte de message intersession immuable.

```ts cordis-catalog
/**
 * List reference candidates, ranked by working-directory affinity.
 * @param agent - target agent; self is excluded and its cwd drives ranking.
 * @param query - optional case-insensitive session-id/cwd/title substring.
 * @param limit - optional positive result cap.
 * @param signal - optional cancellation boundary for host autocomplete teardown.
 * @returns candidates labeled by latest title or, when absent, session id.
 */
async listCandidates( agent: Agent, query: string = '', limit: number = this.config.candidateLimit, signal?: AbortSignal, ): Promise<SessionReferenceCandidate[]>

/**
 * Snapshot all references before enqueue and return one aggregated durable context.
 * @param agent - target agent; references to it are rejected.
 * @param content - already host-normalized readable message content.
 * @param references - structured source sessions in mention order.
 * @param signal - optional cancellation boundary for host request teardown.
 * @returns detached content and optional referenced-session context.
 */
async prepare( agent: Agent, content: ContentBlock[], references: SessionReferenceInput[], signal?: AbortSignal, ): Promise<PreparedReferencedMessage>
```

Types : [Agent](core.md) · [ContentBlock](llm-streaming.md)

Source : [`packages/context/session-reference/src/index.ts:70`](../../packages/context/session-reference/src/index.ts)
<!-- END GENERATED cordis-surface -->
