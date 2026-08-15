# Préréglages d’autorisations

La couche de préréglages de [lasmex-permission-presets](../../packages/interaction/permission-presets) (`ctx.permissionPresets`, `PermissionPresetService`) regroupe deux réglages d’application indépendants — le [mode de bac à sable](sandbox.md) (`sandbox/mode`) et la [politique d’approbation](approval.md) (`approval/policy`) — dans des préréglages nommés qu’un client présente au moyen d’un unique sélecteur d’autorisations. Cette capacité facultative ne fait pas partie du cœur de la boucle d’agent et n’applique elle-même aucune restriction : l’exécution, les explications données dans le prompt et la relecture continuent de consulter la valeur agrégée de chaque réglage. Le changement de préréglage se contente d’enregistrer l’intention et d’appeler le setter canonique de chacun. Le [README du package](../../packages/interaction/permission-presets/README.md) décrit l’état de la composition et ses limites ; la justification relève de la [conception du changement de bac à sable](../../.agents/notes/implemented/feature/2026-07-06-sandbox.md).

Source : [`packages/interaction/permission-presets/src/index.ts`](../../packages/interaction/permission-presets/src/index.ts)

## Table des préréglages

Un préréglage est une clé de table associée à un couple bac à sable/approbation et, éventuellement, à des informations de présentation pour le client. La table par défaut fournit `workspace-write` (`workspace-write` + `ask`) et `danger-full-access` (`danger-full-access` + `never`).

```ts type-equiv
/** One preset's sandbox/approval bundle and optional client presentation. */
interface PresetSpec {
  /** The `sandbox/mode` value the preset writes through. */
  sandbox: SandboxMode
  /** The `approval/policy` value the preset writes through. */
  approval: ApprovalPolicy
  /** The display label a client shows for this preset; the raw table key when omitted. */
  name?: string
  /** One user-facing sentence on what the preset means; omitted when not configured. */
  description?: string
}
```

```ts type-equiv
/** The {@link PermissionPresetService} config: preset table and composition default. */
interface Config {
  /**
   * The preset table: name → knob bundle. Defaults to `workspace-write`
   * (workspace-write + ask) and `danger-full-access` (danger-full-access +
   * never). The name `custom` is reserved for the derived not-a-preset state.
   */
  presets?: Record<string, PresetSpec>
  /**
   * Default for new sessions. When omitted, the preset matching the composed
   * sandbox and approval defaults is used.
   */
  defaultPreset?: string
}
```

Le service exige un exécuteur `ctx.shell` capable de confiner les commandes ainsi que `ctx.approval`. Toute mauvaise configuration fait échouer le chargement du plugin : une entrée de table nommée `custom` provoque une erreur, car ce nom est réservé à l’état dérivé qui ne correspond à aucun préréglage ; une composition sur un exécuteur bash sans confinement, c’est-à-dire sans information de capacité `sandboxMode`, provoque également une erreur puisque chaque préréglage inclut un mode de bac à sable.

## Préréglage courant et état dérivé `custom`

`current(events)` déduit le préréglage effectif des deux réglages plutôt que de se fier uniquement à son propre événement. Il agrège le mode de bac à sable effectif de la session, avec repli sur celui de l’exécuteur, et la politique d’approbation effective, avec repli sur la configuration du service d’approbation puis sur `ask`. Il conserve en priorité la dernière sélection enregistrée si elle correspond toujours, choisit sinon la première entrée compatible dans l’ordre de déclaration de la table, puis renvoie `CUSTOM_PRESET` (`'custom'`) si aucune ne convient. `custom` est exclusivement dérivé : les clients peuvent l’afficher comme valeur courante, mais ne doivent jamais l’utiliser comme cible d’un changement ni comme contenu d’événement.

`names` énumère les préréglages sélectionnables dans l’ordre de déclaration de la table. `optionOf(name)` construit l’option que le client affiche pour une clé de la table — son libellé reprend la clé s’il est absent — ou pour `custom`, et provoque une erreur avec tout autre nom.

```ts type-equiv
/** The select-option shape a presentation layer advertises for one preset (or for the derived `custom` state). */
interface PresetOption {
  /** Stable option value: the table key, or `custom`. */
  value: string
  /** The display label. */
  name: string
  /** One user-facing sentence on what the value means; omitted when not configured. */
  description?: string
}
```

## Changement et événement `permission/preset`

`set(session, name)` résout le préréglage — un nom inconnu provoque une erreur —, ajoute un événement `permission/preset` réservé au journal sauf si `name` désigne déjà le préréglage effectif, puis met à jour chaque réglage par son propre setter : `setSandboxMode` de [lasmex-sandbox-policy](../../packages/sandbox/sandbox-policy) et `setApprovalPolicy` de [lasmex-user-approval](../../packages/interaction/user-approval). Un setter n’est appelé que si la valeur effective correspondante change. L’événement de sélection précède ceux des réglages au cours du même tour ; sélectionner de nouveau le préréglage effectif n’ajoute absolument rien.

`permission/preset` conserve durablement dans le journal l’intention de l’utilisateur, sans apparaître dans la transcription destinée au modèle. Les événements des réglages portent leurs conséquences visibles par le modèle par l’intermédiaire de leurs propres consommateurs. Cet événement permet à `current()` de préserver LE préréglage choisi lorsque deux préréglages partagent le même couple ; `effectivePermissionPreset(events)` agrège le dernier et la relecture ne nécessite aucun état de rattrapage. La déclaration complète de l’événement figure dans le [catalogue des événements du journal de persistance](../persistence-catalog.md) et les signatures des méthodes dans le [catalogue de service généré](#ctxpermissionpresets--permissionpresetservice).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxpermissionpresets--permissionpresetservice"></a>

### `ctx.permissionPresets` — `PermissionPresetService`

Owns the deployment's permission presets and their write path. Requires a confining `ctx.shell` executor and `ctx.approval`; unmatched knob values are reported as CUSTOM_PRESET, not an error.

```ts cordis-catalog
/**
 * Resolve the preset matching the effective knob values. A still-matching
 * last selection wins shared-bundle ties; otherwise the first table match
 * wins, or {@link CUSTOM_PRESET} when no entry matches.
 * @param events - the session's events in log order.
 * @returns the effective preset name, or `custom` when nothing matches.
 */
current(events: readonly SessionEvent[]): string

/**
 * Build the whole select value for one folded knob state: every table
 * option in declaration order, `custom` appended exactly while derived.
 * @param state - the folded knob overrides.
 * @returns the `permissions` projection payload.
 */
selectFor(state: KnobState): PermissionSelect

/**
 * Resolve a preset's knob bundle.
 * @param name - the preset name to resolve.
 * @returns the configured bundle.
 * @throws when `name` is not in the table.
 */
resolve(name: string): PresetSpec

/**
 * Build the client option for a table entry or {@link CUSTOM_PRESET}. A
 * missing label falls back to the table key.
 * @param name - a table key, or `custom`.
 * @returns the option a client renders.
 * @throws when `name` is neither a table key nor `custom`.
 */
optionOf(name: string): PresetOption

/**
 * Record a changed preset, then update each changed knob through its own
 * setter. Selecting the effective preset again appends nothing.
 * @param session - the session the switch belongs to.
 * @param name - the preset to switch to; unknown names throw.
 */
set(session: Session, name: string): void
```

Types: [Session](session.md) · [SessionEvent](session.md)

Source: [`packages/interaction/permission-presets/src/index.ts:159`](../../packages/interaction/permission-presets/src/index.ts)
<!-- END GENERATED cordis-surface -->
