# Planification propre à une session

Schedule gère des rappels durables qui reviennent dans leur Session active d’origine sous la forme de tours de conversation ultérieurs ordinaires. L’[Agent Note sur la planification durable](../../.agents/notes/implemented/feature/2026-08-05-durable-web-schedule.md) définit les choix de persistance et de cycle de vie ; la [livraison conversationnelle](../../.agents/notes/implemented/simplification/2026-08-09-conversational-schedule-delivery.md), l’absence d’accusé de réception ; la [limite explicite de fuseau horaire](../../.agents/notes/implemented/simplification/2026-08-09-explicit-schedule-time-zone.md), l’interprétation selon le navigateur ; et la [planification périodique bornée](../../.agents/notes/implemented/simplification/2026-08-09-bounded-fixed-rate-schedule.md), la récurrence. Cette page décrit les structures durables et exposées au modèle définies dans [`packages/schedule/schedule/src/types.ts`](../../packages/schedule/schedule/src/types.ts). Le [README du package](../../packages/schedule/schedule/README.md) détaille la composition, le comportement des outils et la formulation exacte des rappels.

## Enregistrements durables

`ScheduleId` est un [identifiant typé](core.md#branded-ids), unique et jamais réutilisé au sein d’une Session. La version 1 accepte un délai `after_seconds` exprimé par un entier sûr strictement positif, une cible absolue explicite `at`, ou un intervalle `every_seconds` d’au moins cinq minutes exprimé par un entier sûr. Lors de la création, la première cible est toujours normalisée dans `scheduledAt` au format RFC 3339 UTC avec une année sur quatre chiffres. Un enregistrement `after` conserve le délai reçu, un enregistrement `at` ne conserve que l’instant résultant et un enregistrement `every` conserve son intervalle fixe ainsi que sa prochaine cible.

```ts type-equiv
/** Durable one-shot reminder created from a positive delay. */
interface AfterScheduleRecord {
  /** Session-local stable identity. */
  readonly id: ScheduleId
  /** Rule discriminator for a delayed one-shot reminder. */
  readonly kind: 'after'
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Positive safe-integer delay accepted at creation. */
  readonly afterSeconds: number
  /** Four-digit-year RFC 3339 UTC target. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** Durable one-shot reminder created from an absolute instant. */
interface AtScheduleRecord {
  /** Session-local stable identity. */
  readonly id: ScheduleId
  /** Rule discriminator for an absolute one-shot reminder. */
  readonly kind: 'at'
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Four-digit-year RFC 3339 UTC target. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** Durable fixed-rate reminder whose next target remains creation-anchor-aligned. */
interface EveryScheduleRecord {
  /** Session-local stable identity. */
  readonly id: ScheduleId
  /** Rule discriminator for a fixed-rate recurring reminder. */
  readonly kind: 'every'
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Fixed safe-integer interval, never below five minutes. */
  readonly everySeconds: number
  /** Earliest anchor-aligned occurrence not yet dispatched. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** One-shot record variants that terminate on an id-only dispatch. */
type OneShotScheduleRecord = AfterScheduleRecord | AtScheduleRecord
```

```ts type-equiv
/** The v1 durable reminder record union. */
type ScheduleRecord = OneShotScheduleRecord | EveryScheduleRecord
```

## Saisie d’un instant absolu

Le sélecteur `at` accepte soit une chaîne RFC 3339 stricte munie d’un décalage, soit un objet représentant exactement une date et une heure locales. La forme locale rend son interprétation explicite à l’entrée de l’outil :

```ts type-equiv
/** Structured local-calendar input accepted by `schedule_create`. */
interface LocalAtInput {
  /** Four-digit ISO calendar date. */
  readonly date: string
  /** Local wall-clock time with optional one-to-three digit milliseconds. */
  readonly time: string
  /** Explicit UTC or IANA Area/Location zone. */
  readonly time_zone: string
}
```

```ts type-equiv
/** Absolute selector accepted by `schedule_create`. */
type AtInput = string | LocalAtInput
```

L’interface Web officielle relève le fuseau IANA du navigateur pour chaque prompt. Le contexte temporel demande au modèle d’interpréter les dates et heures en langage naturel dépourvues de précision dans le fuseau propre à la requête, lorsque le tour ouvert possède un fuseau de navigateur non ambigu ; si l’origine est mixte ou absente, le modèle doit demander une précision. Cette indication ne devient pas une valeur par défaut durable de la Session : le modèle doit toujours transmettre un décalage dans la forme textuelle ou `time_zone` dans la forme locale, et Schedule ne consulte jamais le navigateur, la Session, le processus ni le contexte du modèle.

Schedule rejette les décalages et fuseaux non valides, les chaînes dépourvues de décalage, les cibles qui ne sont pas futures et les heures locales situées dans une discontinuité due au passage à l’heure d’été. En cas de chevauchement lors d’un changement d’heure, le premier instant, donc le plus tôt, est choisi. Une création réussie ne conserve que `scheduledAt` sous sa forme UTC canonique ; la relecture ne dépend ainsi d’aucun état ambiant de fuseau horaire.

## Intervalle fixe et rattrapage

`every_seconds` définit pour chaque enregistrement un intervalle d’au moins 300 secondes, ancré à l’heure de création. Il s’agit uniquement d’une récurrence à cadence fixe : le protocole ne possède ni expression calendaire ou Cron, ni fuseau de récurrence, ni délai de récupération partagé, ni contrôle d’admission entre enregistrements.

Lorsqu’une Session est restée inactive ou occupée pendant plusieurs échéances, un enregistrement Every ne produit que sa dernière occurrence arrivée à échéance. La distribution le fait avancer directement jusqu’à la première cible alignée sur l’ancre de création et postérieure à l’instant de décision, sans énumérer, conserver ni rejouer les intervalles manqués. Si cette cible suivante ne tient pas dans une année UTC à quatre chiffres, la distribution finale met fin à l’enregistrement.

Lorsque plusieurs enregistrements Every distincts sont en retard et qu’aucun rappel ponctuel n’est arrivé à échéance, chacun contribue une occurrence au même lot de suivi, dans l’ordre des cibles puis de création. Chaque enregistrement Every conserve un état indépendant, mais toutes les distributions du lot admis utilisent le même instant de décision. Le regroupement borne le nombre de tours du modèle ; le minimum de cinq minutes borne la fréquence du minuteur de chaque enregistrement.

## Modifications durables et relecture

L’événement de Session `schedule/change` en version 1 est la seule autorité durable de Schedule. La création conserve l’enregistrement complet et la suppression constitue une transition terminale qui ne contient que l’identifiant. La distribution d’un rappel ponctuel est elle aussi terminale et limitée à l’identifiant. La distribution d’un rappel Every contient l’instant de décision fourni par l’horloge, utilisé pour sélectionner la dernière occurrence arrivée à échéance, et fait normalement avancer l’enregistrement actif au lieu d’y mettre fin. Une distribution signifie que le suivi a été placé dans la file de manière synchrone, et non qu’une réponse du modèle a réussi ou que l’utilisateur l’a lue.

```ts type-equiv
/** Creates one durable reminder record. */
interface ScheduleCreateChange {
  readonly version: 1
  readonly operation: 'create'
  readonly schedule: ScheduleRecord
}
```

```ts type-equiv
/** Deletes one currently active reminder. */
interface ScheduleDeleteChange {
  readonly version: 1
  readonly operation: 'delete'
  readonly id: ScheduleId
}
```

```ts type-equiv
/** Records that one active one-shot reminder entered the durable dispatch history. */
interface OneShotScheduleDispatchChange {
  readonly version: 1
  readonly operation: 'dispatch'
  readonly id: ScheduleId
}
```

```ts type-equiv
/** Records one fixed-rate decision and advances directly past missed occurrences. */
interface EveryScheduleDispatchChange {
  readonly version: 1
  readonly operation: 'dispatch'
  readonly id: ScheduleId
  /** Wall-clock decision time used to select the latest due occurrence. */
  readonly acceptedAt: string
}
```

```ts type-equiv
/** Durable dispatch shapes supported by the current rule set. */
type ScheduleDispatchChange = OneShotScheduleDispatchChange | EveryScheduleDispatchChange
```

```ts type-equiv
/** Strict version-1 durable Schedule mutation union. */
type ScheduleChange = ScheduleCreateChange | ScheduleDeleteChange | ScheduleDispatchChange
```

Le décodeur strict et l’agrégation rejettent les versions inconnues, les champs supplémentaires, les identifiants réutilisés, les formes de distribution qui ne correspondent pas au type ponctuel ou Every, ainsi que toute suppression ou distribution visant un enregistrement inactif. Une Session normale agrège l’intégralité de son flux d’événements. Une branche ne prend en compte que les événements à partir de `SessionHeader.seedLength`; elle conserve ainsi l’historique sans adopter les rappels actifs de la Session parente. La déclaration et l’emplacement source de `schedule/change` sont également référencés dans le [catalogue de persistance](../persistence-catalog.md#schedulechange--log-only).

## Vues actives et gestion

Les valeurs des outils associent l’enregistrement durable à un état de distribution calculé à partir de l’horloge courante. `session-local` signifie que la Session d’origine doit être active : il n’existe ni canal de notification externe ni planificateur de sessions inactives.

```ts type-equiv
/** Current delivery timing derived from the durable record and wall clock. */
type ScheduleState = 'scheduled' | 'overdue'
```

```ts type-equiv
/** Fixed v1 delivery boundary: the original session must be live. */
type ScheduleDeliveryMode = 'session-local'
```

```ts type-equiv
/** Complete model-facing view of one active reminder. */
type ScheduleView = ScheduleRecord & {
  /** Whether the target remains in the future. */
  readonly state: ScheduleState
  /** Reminder delivery never leaves the owning session. */
  readonly deliveryMode: ScheduleDeliveryMode
}
```

Le [catalogue d’outils généré](../tool-catalog.md#lasmex-schedule) définit les schémas d’arguments et de résultats de `schedule_create`, `schedule_list` et `schedule_delete`. Les appels de gestion sont sérialisés avec le travail arrivé à échéance dans une file propre à l’Agent. Chaque lecture ou décision attend d’abord la barrière de persistance partagée de la Session ; une création ou une suppression effective l’attend de nouveau après l’ajout au journal. L’échec d’une barrière produit `persistence_uncertain` au lieu de supposer qu’une écriture anticipée a été validée. Les autres codes d’erreur stables sont `invalid_prompt`, `invalid_selector`, `invalid_rule`, `invalid_time_zone`, `not_future`, `time_out_of_range`, `frequency_too_high`, `corrupt_schedule_log` et `internal_error`.

## Distribution active

Le propriétaire local au processus déduit son prochain minuteur de l’agrégation durable et consulte de nouveau l’horloge après chaque attente bornée. Les Sessions inactives n’effectuent aucun travail ; leur réouverture reconstruit les minuteurs et marque comme en retard les cibles passées. Les rappels ponctuels arrivés à échéance sont prioritaires et rejoignent un tour ultérieur un par un. Lorsqu’aucun rappel ponctuel n’est dû, tous les enregistrements Every en retard forment l’unique lot décrit plus haut.

Le travail arrivé à échéance attend que l’Agent soit entièrement inactif et réserve la phase de maintenance avant d’agréger de nouveau l’état, de relever l’instant de décision, de placer un unique `followup()` dans la file et d’ajouter les modifications de distribution correspondantes. Il n’appelle jamais `steer()` et n’interrompt jamais un tour en cours.

Le rappel ponctuel ou le lot à cadence fixe admis démarre un tour ultérieur normal et n’apparaît que dans la transcription ordinaire de la conversation ; Schedule ne possède ni accusé de réception Web durable distinct ni rendu propre au navigateur. Si la mise en forme ou l’admission synchrone dans la file échoue, aucune distribution n’est enregistrée et le rappel reste actif. La courte fenêtre de panne située après l’admission mais avant la persistance de la distribution peut répéter le contenu du rappel après récupération : la garantie correspond donc au mieux à une livraison au moins une fois, et non exactement une fois.
