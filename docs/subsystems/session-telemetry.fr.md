# SessionTelemetryBackend

Les rapports de session sortants forment un [seam de capacité](../capability-seams.md). La définition de service et le coordinateur de capture — [lasmex-session-telemetry](../../packages/session/session-telemetry), `ctx.sessionTelemetry` — possèdent les points de capture, la projection fixe des fragments, la cascade de masquage `session-telemetry/record`, le curseur de transfert et le contrat minimal du backend. Le fournisseur de service chargé par un déploiement, [lasmex-session-telemetry-otel](../../packages/session/session-telemetry-otel), est le pipeline de journaux du SDK JavaScript OpenTelemetry configuré sans intermédiaire. Il s’agit d’une capacité facultative, hors de l’ossature de la boucle agentique, et rien de cette page n’atteint une requête au modèle. L’axiome de séparation — le rôle de LasmeX s’arrête à `emit()` ; le traitement par lots, les nouvelles tentatives, la mise en file et la politique de perte appartiennent au SDK de rapport — ainsi que les solutions écartées sont consignés dans l’[Agent Note de réactivation](../../.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.md). Les points de capture, le curseur et les contrats de projection sont décrits dans le [README de la définition de service](../../packages/session/session-telemetry/README.md).

Source : [`packages/session/session-telemetry/src/index.ts`](../../packages/session/session-telemetry/src/index.ts)

## Enregistrement logique

```ts type-equiv
/**
 * Severity of a telemetry record, pre-mapped at capture so a receiver can
 * alert with zero configuration: `error` for events whose own outcome flag
 * says so (the tool-result block's `isError`, `turn/end` error reasons) and for
 * `agent-error` operational records. Captured events otherwise default to
 * `info`; `warn` remains available to `session-telemetry/record` policies and
 * backends.
 */
type SessionTelemetrySeverity = 'info' | 'warn' | 'error'
```

```ts type-equiv
/**
 * One logical record handed to a backend — the capture contract's whole outbound
 * vocabulary. Ledger records mirror session-log events one-to-one;
 * operational records (`channel: 'ops'`) carry the two signals with no log
 * home (`agent-error`, `shutdown`) and deliberately omit `event.seq`-style
 * identity so they can never be mistaken for ledger rows.
 */
interface SessionTelemetryRecord {
  /** Ledger (session-log mirror) or ops (operational signal) channel; backends keep the two under separate instrumentation scopes. */
  channel: 'ledger' | 'ops'
  /** Unix epoch milliseconds — the source event's append time for ledger records, the emission time for ops records. */
  time: number
  /** Pre-mapped alerting severity; see {@link SessionTelemetrySeverity}. */
  severity: SessionTelemetrySeverity
  /**
   * Identity attributes, deliberately minimal: ledger records carry
   * `session.id`, `event.type`, `event.seq`, plus `session.cwd` /
   * `session.parent_id` / `session.seed_length` when the header has them;
   * ops records carry `telemetry.op`, `session.id`, and (for `agent-error`)
   * `agent.id`, `turn`, `step`, `error.name`. Anything recoverable from the
   * body is intentionally NOT duplicated here.
   */
  attributes: Record<string, string | number>
  /**
   * The complete payload: a deep copy of the session event's `data` for
   * ledger records (JSON-serializable by `Session.append`'s own
   * validation), or the op payload for ops records. Never mutated after
   * handoff.
   */
  body: unknown
}
```

Seul le premier `assistant/chunk` de chaque couple `(turn, step)` est transmis : il signale le début du flux. Les suivants sont écartés à la capture ; les discontinuités de `seq` sont donc normales sur le fil et n’indiquent jamais une perte. Tous les autres types d’[événements de session](session.md), y compris ceux ajoutés par des plugins inconnus du seam, sont transmis intégralement. La livraison suit un principe de meilleur effort : le curseur marque les enregistrements transférés, pas livrés. Des enregistrements peuvent être perdus — incident ou fenêtre de rechargement — et dupliqués — nouvelle adoption sans curseur ou tentatives du SDK. Les récepteurs dédupliquent donc les enregistrements du grand livre à partir de `(session.id, event.seq)`. Les enregistrements opérationnels omettent volontairement cette identité : ce sont des signaux d’alerte, pas des valeurs à additionner, et ils tolèrent les doublons.

## Déclaration du partage

Le contrat d’accusé de réception du seam appartient à la [section sur la déclaration du partage du README de la définition de service](../../packages/session/session-telemetry/README.md#the-sharing-disclosure). Chaque backend déclare la politique de partage choisie par le déploiement au moyen du membre abstrait obligatoire `sharing` de `ctx.sessionTelemetry`. Les consommateurs n’affichent « non configuré » que lorsqu’aucun service de télémétrie n’est monté. La déclaration expose la politique actuelle, jamais la livraison ni la conservation. Le transfert est une mise en file non bloquante ; le traitement par lots, les nouvelles tentatives et la politique de perte restent à la charge du SDK de rapport.

```ts type-equiv
/**
 * Deployment-selected session-sharing policy disclosed by a mounted
 * {@link SessionTelemetryBackend} backend to human-facing acknowledgement surfaces (the
 * `/feedback` command's confirmation text). The seam owns the vocabulary so
 * any backend can disclose a policy without depending on the OTel package;
 * the values mirror the OTel backend's serialized `SessionTelemetryMode` choices.
 */
type SessionTelemetrySharingStatus = 'full' | 'feedback-only' | 'disabled'
```

## Contrat du backend

```ts type-equiv
/**
 * The minimum backend contract the coordinator requires. {@link SessionTelemetryBackend} is
 * its service-registered form; tests compose the coordinator with a bare
 * implementation of this interface.
 */
interface SessionTelemetrySink {
  /**
   * Hand one record to the backend's pipeline. MUST be a non-blocking
   * enqueue — the coordinator calls this synchronously from the
   * `session/event` hot path or an explicit canonical-log capture, so anything
   * slower than a queue push would tax the agent loop or feedback handling.
   * Errors thrown here are contained by the coordinator and logged; they
   * never reach the loop.
   * @param record - the logical record to report; owned by the backend after the call.
   */
  emit(record: SessionTelemetryRecord): void
  /**
   * Optional hint that a turn ended. A backend may forward it to its SDK's
   * flush so records are exported after each turn. Called
   * fire-and-forget; implementations must not block and must not throw
   * meaningfully (the coordinator contains exceptions). Most backends should
   * leave this unimplemented and let their SDK's own batching cadence govern
   * export timing: a backend that does implement it owns the interaction
   * between its concurrent flushes and {@link shutdown}'s drain (the OTel
   * backend leaves it unimplemented for exactly that hazard — see the
   * revival Agent Note).
   */
  flush?(): void
  /**
   * Forward the fiber's disposal to the SDK: flush whatever is queued and
   * reach quiescence, per the SDK's own shutdown contract. Everything
   * emitted before this call must still be delivered — including records
   * enqueued while a {@link flush} hint is in flight, so a backend whose SDK
   * guards against concurrent flushes orders behind the outstanding one (the
   * coordinator emits its dispose-time `shutdown` markers immediately before
   * calling this). Awaited by the coordinator's dispose; a rejection is
   * logged as a warning and never fails application teardown.
   * The coordinator captures dispose-time shutdown markers immediately before
   * this call for live capture; on-demand capture creates no ops records.
   * @returns resolves when the backend's pipeline has quiesced.
   */
  shutdown(): Promise<void>
}
```

`SessionTelemetryBackend` — `ctx.sessionTelemetry`, [signatures](#ctxsessiontelemetry--sessiontelemetrybackend-abstract-seam) — est la forme chargeable du contrat. Une seule implémentation est admise par contexte ; un chargement en double lève une erreur. Un backend compose le `SessionTelemetryCoordinator` du seam dans son constructeur afin d’installer le côté capture.

## Cascade de masquage : `session-telemetry/record`

Chaque enregistrement traverse la [cascade](../cordis-primer.md#cordis-waterfall-semantics) `session-telemetry/record` entre sa projection et `emit()` ([entrée de l’événement](#session-telemetryrecord--waterfall)). Le seam ne fournit AUCUNE règle : sans écouteur monté, les enregistrements atteignent le backend exactement tels qu’ils ont été capturés. La propreté des données exportées dépend donc précisément des règles montées par le déploiement. Les écouteurs s’empilent en transformant la valeur renvoyée par `next()`. Renvoyer sans appeler `next()` remplace tout ce qui se trouve en dessous. Un écouteur qui lève une exception retient cet enregistrement en fermeture sûre, dans le confinement du coordinateur. Le masquage ne s’applique qu’à la copie exportée ; le journal de session canonique n’est jamais réécrit.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## API Cordis

Générée depuis les sources par `scripts/gen-cordis-catalog.ts` (sa fraîcheur est vérifiée par `pnpm run verify-cordis-catalog` dans doc-sync ; régénérez-la avec `pnpm run gen-cordis-catalog`) — cette section est identique octet pour octet dans les deux langues de la page. Les blocs de signature utilisent une clôture `ts cordis-catalog` et conservent la JSDoc source d’origine. Les modes de répartition sont définis dans le [guide d’introduction](../cordis-primer.md#dispatch-modes), et l’API `ctx` héritée du framework se trouve dans [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessiontelemetry--sessiontelemetrybackend-abstract-seam"></a>

### `ctx.sessionTelemetry` — `SessionTelemetryBackend` (seam abstrait)

Forme chargeable du contrat du backend : une implémentation par contexte. L’enregistrement du `Service` Cordis sous la clé `telemetry` lève une erreur en cas de doublon, conformément au comportement standard de Cordis. Un backend compose un SessionTelemetryCoordinator dans son constructeur afin d’installer le côté capture.

```ts cordis-catalog
/**
 * See {@link SessionTelemetrySink.emit} — that declaration is the contract's one home.
 * @param record - the logical record to report; owned by the backend after the call.
 */
abstract emit(record: SessionTelemetryRecord): void

/** See {@link SessionTelemetrySink.flush}. */
flush?(): void

/**
 * See {@link SessionTelemetrySink.shutdown}.
 * @returns resolves when the backend's pipeline has quiesced.
 */
abstract shutdown(): Promise<void>
```

Source : [`packages/session/session-telemetry/src/index.ts:148`](../../packages/session/session-telemetry/src/index.ts)

<a id="session-telemetry-events"></a>

### Événements `session-telemetry/*`

<a id="session-telemetryrecord--waterfall"></a>

#### `session-telemetry/record` — waterfall

Transforme un enregistrement sortant avant son arrivée au backend. Cette cascade est le point d’extension de masquage de la définition de service. Elle ne fournit AUCUNE règle : le `next()` le plus interne transmet l’enregistrement sans modification. Sans écouteur monté, les enregistrements atteignent le backend tels qu’ils ont été capturés ; les données exportées sont donc exactement aussi propres que les règles montées par le déploiement. Les écouteurs s’empilent en transformant la valeur de `next()`. Renvoyer sans appeler `next()` remplace tout ce qui se trouve en dessous. La répartition est synchrone sur le chemin critique de capture, dans le confinement du coordinateur. Un écouteur qui lève une exception retient cet enregistrement en fermeture sûre et n’atteint jamais la boucle agentique. La capture en direct répartit à l’ajout ; la capture à la demande répartit pendant la lecture du journal canonique. Le masquage s’applique uniquement à la copie exportée ; le journal de session canonique n’est jamais réécrit.

```ts cordis-catalog
/**
 * Transform one outbound record before it reaches the backend. This
 * waterfall is the Service Definition's redaction extension point. It ships NO rules
 * of its own: the
 * innermost `next()` passes the record through unchanged, and with no
 * listener mounted records reach the backend as captured, so exported
 * data is exactly as clean as the rules a deployment mounts. Listeners
 * stack by transforming `next()`'s return value; returning without
 * `next()` replaces everything beneath. Dispatched synchronously on the
 * capture hot path inside the coordinator's containment: a throwing
 * listener withholds that one record (fail-closed) and never reaches the
 * agent loop. Live capture dispatches at append time; on-demand capture
 * dispatches while reading the canonical log. Redaction applies to the
 * exported copy only; the canonical session log is never rewritten.
 * @param record - the candidate record, already the coordinator's own deep
 *   copy; listeners return a (possibly new) record and must not mutate it.
 * @mode waterfall
 */
'session-telemetry/record'(record: SessionTelemetryRecord, next: () => SessionTelemetryRecord): SessionTelemetryRecord
```

Source : [`packages/session/session-telemetry/src/index.ts:43`](../../packages/session/session-telemetry/src/index.ts)
<!-- END GENERATED cordis-surface -->
