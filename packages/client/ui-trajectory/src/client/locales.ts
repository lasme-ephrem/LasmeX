import type { TranslateNS } from 'lasmex-client-ui-slots'

/** Dictionary namespace owned by this plugin. */
export const NS = 'trajectory'

/** User-visible trajectory copy owned by this package. */
export type TrajectoryKey =
  | 'view.trajectory'
  | 'toolbar.aria'
  | 'toolbar.duration'
  | 'toolbar.useActualDuration'
  | 'toolbar.useEqualWidth'
  | 'toolbar.actualTime'
  | 'toolbar.turns'
  | 'toolbar.expandTurns'
  | 'toolbar.collapseTurns'
  | 'toolbar.calls'
  | 'toolbar.expandCalls'
  | 'toolbar.collapseCalls'
  | 'toolbar.search'
  | 'toolbar.searchPlaceholder'
  | 'kind.system'
  | 'kind.user'
  | 'kind.context'
  | 'kind.compacted'
  | 'kind.assistant'
  | 'kind.tool'
  | 'kind.subtool'
  | 'column.input'
  | 'column.output'
  | 'column.reasoning'
  | 'column.time'
  | 'group.message'
  | 'group.step'
  | 'group.compaction'
  | 'group.turn'
  | 'group.betweenTurns'
  | 'group.steps.one'
  | 'group.steps.many'
  | 'group.toolCalls.one'
  | 'group.toolCalls.many'
  | 'layout.compactingContext'
  | 'layout.compactionFailed'
  | 'layout.contextCompacted'
  | 'layout.toolCallOnly'
  | 'layout.promptInitialSystem'
  | 'layout.promptSystemUpdated'
  | 'layout.promptToolsUpdated'
  | 'layout.promptSystemAndToolsUpdated'
  | 'layout.noOutput'
  | 'timeline.aria'
  | 'timeline.overviewAria'
  | 'timeline.noTimingData'
  | 'timeline.laneInput'
  | 'timeline.laneModel'
  | 'timeline.laneTools'
  | 'timeline.total'
  | 'timeline.started'
  | 'timeline.ttftDecoding'
  | 'timeline.loadingEarlier'
  | 'timeline.clickLoadEarlier'
  | 'timeline.loadEarlier'
  | 'detail.tab.systemPrompt'
  | 'detail.tab.tools'
  | 'detail.tab.diff'
  | 'detail.tab.summary'
  | 'detail.tab.options'
  | 'detail.tab.usage'
  | 'detail.tab.timing'
  | 'detail.tab.rawOutput'
  | 'detail.tab.preview'
  | 'detail.tab.raw'
  | 'detail.tab.source'
  | 'detail.tab.payload'
  | 'detail.tab.result'
  | 'detail.tab.schema'
  | 'state.notAvailable'
  | 'state.notRecorded'
  | 'state.stepStartUnavailable'
  | 'state.pending'
  | 'state.firstTokenUnavailable'
  | 'state.usageUnavailable'
  | 'state.outputTokensUnavailable'
  | 'state.durationTooShort'
  | 'state.failed'
  | 'state.completed'
  | 'timing.showLocalTime'
  | 'timing.showUnixTimestamp'
  | 'timing.started'
  | 'timing.totalDuration'
  | 'timing.ttft'
  | 'timing.generation'
  | 'timing.throughput'
  | 'timing.duration'
  | 'timing.source'
  | 'timing.sessionTimestamps'
  | 'timing.sessionTimestampsRunning'
  | 'usage.tokens'
  | 'usage.reasoning'
  | 'usage.content'
  | 'usage.notReported'
  | 'usage.input'
  | 'usage.cached'
  | 'usage.cacheCreated'
  | 'usage.other'
  | 'usage.output'
  | 'usage.thisRequest'
  | 'usage.sessionCumulative'
  | 'request.optionsNotRecorded'
  | 'request.optionsJson'
  | 'json.copyValue'
  | 'json.copyJson'
  | 'json.copyPath'
  | 'json.copyPrettyJson'
  | 'json.copyCompactJson'
  | 'json.copied'
  | 'json.copyFailed'
  | 'json.collapseNode'
  | 'json.expandNode'
  | 'json.copyButtonTitle'
  | 'source.unknown'
  | 'source.user'
  | 'source.plugin'
  | 'source.pluginNamed'
  | 'source.goal'
  | 'source.goalRound'
  | 'source.notRecorded'
  | 'source.json'
  | 'content.toolCallOnlyParenthesized'
  | 'content.openToolCallSummary'
  | 'content.openBlockToolCallSummary'
  | 'content.blockLabel'
  | 'content.openImage'
  | 'content.noTools'
  | 'content.parameters'
  | 'content.parametersJson'
  | 'content.thinking'
  | 'content.noContent'
  | 'content.noPayloadCaptured'
  | 'content.noResultCaptured'
  | 'content.resultJson'
  | 'content.payloadJson'
  | 'content.schemaUnavailable'
  | 'history.loadingTrajectory'
  | 'history.loadingEarlier'
  | 'history.loadEarlier'
  | 'request.heading'
  | 'request.compactionHeading'
  | 'request.boundary'
  | 'request.compactionBoundary'
  | 'request.collapsedTurnSummary'
  | 'request.collapsedAssistantSummary'
  | 'request.ariaCompaction'
  | 'request.ariaRecord'
  | 'request.ariaRecordWithoutNumber'
  | 'request.noContent'
  | 'details.event'
  | 'details.resize'
  | 'details.resizeTitle'
  | 'details.close'
  | 'overview.status'
  | 'overview.purpose'
  | 'overview.compaction'
  | 'overview.provider'
  | 'overview.model'
  | 'overview.toolCalls'
  | 'overview.subtoolCalls'
  | 'overview.error'
  | 'overview.retry'
  | 'overview.scheduled'
  | 'overview.retryOf'
  | 'overview.retryDelay'
  | 'overview.result'
  | 'overview.compacted'
  | 'overview.assistantMessage'
  | 'overview.source'
  | 'overview.hierarchy'
  | 'overview.toolCall'
  | 'overview.requestTiming'
  | 'overview.noSystemPrompt'
  | 'error.sessionUnavailable'
  | 'error.compactionInterrupted'

/** Namespace-bound translator used by trajectory presentation helpers. */
export type TrajectoryTranslate = TranslateNS<typeof NS>

declare module 'lasmex-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The trajectory view, controls, ledger, timeline, and inspector copy. */
    'trajectory': TrajectoryKey
  }
}

/** English dictionary. */
export const en: Record<TrajectoryKey, string> = {
  'view.trajectory': 'Trajectory',
  'toolbar.aria': 'Trajectory toolbar',
  'toolbar.duration': 'Duration',
  'toolbar.useActualDuration': 'Use actual duration',
  'toolbar.useEqualWidth': 'Use equal-width operations',
  'toolbar.actualTime': 'Actual time',
  'toolbar.turns': 'Turns',
  'toolbar.expandTurns': 'Expand turns',
  'toolbar.collapseTurns': 'Collapse turns',
  'toolbar.calls': 'Calls',
  'toolbar.expandCalls': 'Expand calls',
  'toolbar.collapseCalls': 'Collapse calls',
  'toolbar.search': 'Search trajectory',
  'toolbar.searchPlaceholder': 'Search',
  'kind.system': 'System',
  'kind.user': 'User',
  'kind.context': 'Context',
  'kind.compacted': 'Compacted',
  'kind.assistant': 'Assistant',
  'kind.tool': 'Tool',
  'kind.subtool': 'Subtool',
  'column.input': 'Input',
  'column.output': 'Output',
  'column.reasoning': 'Think',
  'column.time': 'Time',
  'group.message': 'Message',
  'group.step': 'Step {step}',
  'group.compaction': 'Compaction {seq}',
  'group.turn': 'Turn {turn}',
  'group.betweenTurns': 'Between turns',
  'group.steps.one': '{count} step',
  'group.steps.many': '{count} steps',
  'group.toolCalls.one': '{count} tool call',
  'group.toolCalls.many': '{count} tool calls',
  'layout.compactingContext': 'Compacting context…',
  'layout.compactionFailed': 'Compaction failed',
  'layout.contextCompacted': 'Context compacted',
  'layout.toolCallOnly': 'Tool call only',
  'layout.promptInitialSystem': 'Initial System Prompt',
  'layout.promptSystemUpdated': 'System Prompt Updated',
  'layout.promptToolsUpdated': 'Tools Updated',
  'layout.promptSystemAndToolsUpdated': 'System Prompt and Tools Updated',
  'layout.noOutput': 'No output',
  'timeline.aria': 'Trajectory timeline',
  'timeline.overviewAria': 'Timeline overview; drag horizontally to focus events',
  'timeline.noTimingData': 'No timing data',
  'timeline.laneInput': 'Input',
  'timeline.laneModel': 'Model',
  'timeline.laneTools': 'Tools',
  'timeline.total': 'Total {duration}',
  'timeline.started': 'Started {time}',
  'timeline.ttftDecoding': 'TTFT {ttft} · Decoding {decoding}',
  'timeline.loadingEarlier': 'Loading earlier history…',
  'timeline.clickLoadEarlier': 'Click to load earlier history',
  'timeline.loadEarlier': 'Load earlier history',
  'detail.tab.systemPrompt': 'System Prompt',
  'detail.tab.tools': 'Tools',
  'detail.tab.diff': 'Diff',
  'detail.tab.summary': 'Summary',
  'detail.tab.options': 'Options',
  'detail.tab.usage': 'Usage',
  'detail.tab.timing': 'Timing',
  'detail.tab.rawOutput': 'Raw Output',
  'detail.tab.preview': 'Preview',
  'detail.tab.raw': 'Raw',
  'detail.tab.source': 'Source',
  'detail.tab.payload': 'Payload',
  'detail.tab.result': 'Result',
  'detail.tab.schema': 'Schema',
  'state.notAvailable': 'Not available',
  'state.notRecorded': 'Not recorded',
  'state.stepStartUnavailable': 'Step start unavailable',
  'state.pending': 'Pending',
  'state.firstTokenUnavailable': 'First token unavailable',
  'state.usageUnavailable': 'Usage unavailable',
  'state.outputTokensUnavailable': 'Output tokens unavailable',
  'state.durationTooShort': 'Duration too short',
  'state.failed': 'Failed',
  'state.completed': 'Completed',
  'timing.showLocalTime': 'Show local time',
  'timing.showUnixTimestamp': 'Show Unix timestamp',
  'timing.started': 'Started',
  'timing.totalDuration': 'Total duration',
  'timing.ttft': 'TTFT',
  'timing.generation': 'Generation',
  'timing.throughput': 'Throughput',
  'timing.duration': 'Duration',
  'timing.source': 'Timing source',
  'timing.sessionTimestamps': 'Session timestamps',
  'timing.sessionTimestampsRunning': 'Session timestamps (running)',
  'usage.tokens': 'Tokens',
  'usage.reasoning': 'Reasoning',
  'usage.content': 'Content',
  'usage.notReported': 'Usage not reported',
  'usage.input': 'Input',
  'usage.cached': 'Cached',
  'usage.cacheCreated': 'Cache created',
  'usage.other': 'Other',
  'usage.output': 'Output',
  'usage.thisRequest': 'This request',
  'usage.sessionCumulative': 'Session cumulative',
  'request.optionsNotRecorded': 'Options not recorded',
  'request.optionsJson': 'Request options JSON',
  'json.copyValue': 'Copy value',
  'json.copyJson': 'Copy JSON',
  'json.copyPath': 'Copy property path',
  'json.copyPrettyJson': 'Copy formatted JSON',
  'json.copyCompactJson': 'Copy compact JSON',
  'json.copied': 'Copied',
  'json.copyFailed': 'Copy failed',
  'json.collapseNode': 'Collapse JSON node',
  'json.expandNode': 'Expand JSON node',
  'json.copyButtonTitle': '{action}; right-click for copy options',
  'source.unknown': 'Unknown',
  'source.user': 'User',
  'source.plugin': 'Plugin',
  'source.pluginNamed': 'Plugin · {plugin}',
  'source.goal': 'Goal',
  'source.goalRound': 'Goal · Round {round}',
  'source.notRecorded': 'Source not recorded',
  'source.json': 'Message source JSON',
  'content.toolCallOnlyParenthesized': '(tool call only)',
  'content.openToolCallSummary': 'Open tool call summary',
  'content.openBlockToolCallSummary': 'Open Block #{index} tool call summary',
  'content.blockLabel': 'Block #{index} {type}',
  'content.openImage': 'Open image',
  'content.noTools': 'No tools in this request',
  'content.parameters': 'Parameters',
  'content.parametersJson': '{name} parameters JSON',
  'content.thinking': 'Thinking',
  'content.noContent': 'No content',
  'content.noPayloadCaptured': 'No payload captured',
  'content.noResultCaptured': 'No result captured',
  'content.resultJson': 'Result JSON',
  'content.payloadJson': 'Payload JSON',
  'content.schemaUnavailable': 'Schema unavailable',
  'history.loadingTrajectory': 'Loading trajectory…',
  'history.loadingEarlier': 'Loading earlier history…',
  'history.loadEarlier': 'Load earlier history',
  'request.heading': 'Request #{number}',
  'request.compactionHeading': 'Compaction · {section}',
  'request.boundary': 'Request #{number}',
  'request.compactionBoundary': 'Request #{number} · Compaction',
  'request.collapsedTurnSummary': 'Collapsed turn summary, {summary}',
  'request.collapsedAssistantSummary': 'Collapsed assistant summary, {summary}',
  'request.ariaCompaction': 'Request {number}, compaction',
  'request.ariaRecord': 'Request {number}, {kind}, {content}',
  'request.ariaRecordWithoutNumber': '{kind}, {content}',
  'request.noContent': 'no content',
  'details.event': 'Event details',
  'details.resize': 'Resize event details',
  'details.resizeTitle': 'Drag to resize. Double-click to reset.',
  'details.close': 'Close details',
  'overview.status': 'Status',
  'overview.purpose': 'Purpose',
  'overview.compaction': 'Compaction',
  'overview.provider': 'Provider',
  'overview.model': 'Model',
  'overview.toolCalls': 'Tool calls',
  'overview.subtoolCalls': 'Subtool calls',
  'overview.error': 'Error',
  'overview.retry': 'Retry',
  'overview.scheduled': 'Scheduled',
  'overview.retryOf': '{retry} of {max}',
  'overview.retryDelay': 'Retry delay',
  'overview.result': 'Result',
  'overview.compacted': 'Compacted',
  'overview.assistantMessage': 'Assistant Message',
  'overview.source': 'Source',
  'overview.hierarchy': 'Hierarchy',
  'overview.toolCall': 'Tool Call',
  'overview.requestTiming': 'Request Timing',
  'overview.noSystemPrompt': 'No system prompt in this request',
  'error.sessionUnavailable': 'Session "{sessionId}" is unavailable.',
  'error.compactionInterrupted': 'Compaction was interrupted before completion.',
}

/** French dictionary. */
export const fr: Record<TrajectoryKey, string> = {
  'view.trajectory': 'Trajectoire',
  'toolbar.aria': 'Barre d’outils de la trajectoire',
  'toolbar.duration': 'Durée',
  'toolbar.useActualDuration': 'Utiliser la durée réelle',
  'toolbar.useEqualWidth': 'Afficher les opérations à largeur égale',
  'toolbar.actualTime': 'Temps réel',
  'toolbar.turns': 'Tours',
  'toolbar.expandTurns': 'Développer les tours',
  'toolbar.collapseTurns': 'Réduire les tours',
  'toolbar.calls': 'Appels',
  'toolbar.expandCalls': 'Développer les appels',
  'toolbar.collapseCalls': 'Réduire les appels',
  'toolbar.search': 'Rechercher dans la trajectoire',
  'toolbar.searchPlaceholder': 'Rechercher',
  'kind.system': 'Système',
  'kind.user': 'Utilisateur',
  'kind.context': 'Contexte',
  'kind.compacted': 'Compacté',
  'kind.assistant': 'Assistant',
  'kind.tool': 'Outil',
  'kind.subtool': 'Sous-outil',
  'column.input': 'Entrée',
  'column.output': 'Sortie',
  'column.reasoning': 'Raisonnement',
  'column.time': 'Temps',
  'group.message': 'Message',
  'group.step': 'Étape {step}',
  'group.compaction': 'Compaction {seq}',
  'group.turn': 'Tour {turn}',
  'group.betweenTurns': 'Entre les tours',
  'group.steps.one': '{count} étape',
  'group.steps.many': '{count} étapes',
  'group.toolCalls.one': '{count} appel d’outil',
  'group.toolCalls.many': '{count} appels d’outil',
  'layout.compactingContext': 'Compaction du contexte…',
  'layout.compactionFailed': 'Échec de la compaction',
  'layout.contextCompacted': 'Contexte compacté',
  'layout.toolCallOnly': 'Appel d’outil uniquement',
  'layout.promptInitialSystem': 'Prompt système initial',
  'layout.promptSystemUpdated': 'Prompt système mis à jour',
  'layout.promptToolsUpdated': 'Outils mis à jour',
  'layout.promptSystemAndToolsUpdated': 'Prompt système et outils mis à jour',
  'layout.noOutput': 'Aucune sortie',
  'timeline.aria': 'Chronologie de la trajectoire',
  'timeline.overviewAria': 'Vue d’ensemble de la chronologie ; faites glisser horizontalement pour cibler des événements',
  'timeline.noTimingData': 'Aucune donnée temporelle',
  'timeline.laneInput': 'Entrée',
  'timeline.laneModel': 'Modèle',
  'timeline.laneTools': 'Outils',
  'timeline.total': 'Total {duration}',
  'timeline.started': 'Début {time}',
  'timeline.ttftDecoding': 'TTFT {ttft} · Décodage {decoding}',
  'timeline.loadingEarlier': 'Chargement de l’historique antérieur…',
  'timeline.clickLoadEarlier': 'Cliquer pour charger l’historique antérieur',
  'timeline.loadEarlier': 'Charger l’historique antérieur',
  'detail.tab.systemPrompt': 'Prompt système',
  'detail.tab.tools': 'Outils',
  'detail.tab.diff': 'Différences',
  'detail.tab.summary': 'Résumé',
  'detail.tab.options': 'Options',
  'detail.tab.usage': 'Utilisation',
  'detail.tab.timing': 'Chronométrage',
  'detail.tab.rawOutput': 'Sortie brute',
  'detail.tab.preview': 'Aperçu',
  'detail.tab.raw': 'Brut',
  'detail.tab.source': 'Source',
  'detail.tab.payload': 'Charge utile',
  'detail.tab.result': 'Résultat',
  'detail.tab.schema': 'Schéma',
  'state.notAvailable': 'Indisponible',
  'state.notRecorded': 'Non enregistré',
  'state.stepStartUnavailable': 'Début de l’étape indisponible',
  'state.pending': 'En attente',
  'state.firstTokenUnavailable': 'Premier token indisponible',
  'state.usageUnavailable': 'Utilisation indisponible',
  'state.outputTokensUnavailable': 'Tokens de sortie indisponibles',
  'state.durationTooShort': 'Durée trop courte',
  'state.failed': 'Échec',
  'state.completed': 'Terminé',
  'timing.showLocalTime': 'Afficher l’heure locale',
  'timing.showUnixTimestamp': 'Afficher l’horodatage Unix',
  'timing.started': 'Début',
  'timing.totalDuration': 'Durée totale',
  'timing.ttft': 'TTFT',
  'timing.generation': 'Génération',
  'timing.throughput': 'Débit',
  'timing.duration': 'Durée',
  'timing.source': 'Source temporelle',
  'timing.sessionTimestamps': 'Horodatages de session',
  'timing.sessionTimestampsRunning': 'Horodatages de session (en cours)',
  'usage.tokens': 'Tokens',
  'usage.reasoning': 'Raisonnement',
  'usage.content': 'Contenu',
  'usage.notReported': 'Utilisation non communiquée',
  'usage.input': 'Entrée',
  'usage.cached': 'En cache',
  'usage.cacheCreated': 'Cache créé',
  'usage.other': 'Autres',
  'usage.output': 'Sortie',
  'usage.thisRequest': 'Cette requête',
  'usage.sessionCumulative': 'Cumul de la session',
  'request.optionsNotRecorded': 'Options non enregistrées',
  'request.optionsJson': 'Options de la requête au format JSON',
  'json.copyValue': 'Copier la valeur',
  'json.copyJson': 'Copier le JSON',
  'json.copyPath': 'Copier le chemin de la propriété',
  'json.copyPrettyJson': 'Copier le JSON mis en forme',
  'json.copyCompactJson': 'Copier le JSON compact',
  'json.copied': 'Copié',
  'json.copyFailed': 'Échec de la copie',
  'json.collapseNode': 'Réduire le nœud JSON',
  'json.expandNode': 'Développer le nœud JSON',
  'json.copyButtonTitle': '{action} ; clic droit pour afficher les options de copie',
  'source.unknown': 'Inconnue',
  'source.user': 'Utilisateur',
  'source.plugin': 'Plugin',
  'source.pluginNamed': 'Plugin · {plugin}',
  'source.goal': 'Objectif',
  'source.goalRound': 'Objectif · Round {round}',
  'source.notRecorded': 'Source non enregistrée',
  'source.json': 'Source du message au format JSON',
  'content.toolCallOnlyParenthesized': '(appel d’outil uniquement)',
  'content.openToolCallSummary': 'Ouvrir le résumé de l’appel d’outil',
  'content.openBlockToolCallSummary': 'Ouvrir le résumé de l’appel d’outil du bloc nº {index}',
  'content.blockLabel': 'Bloc nº {index} {type}',
  'content.openImage': 'Ouvrir l’image',
  'content.noTools': 'Aucun outil dans cette requête',
  'content.parameters': 'Paramètres',
  'content.parametersJson': 'Paramètres de {name} au format JSON',
  'content.thinking': 'Raisonnement',
  'content.noContent': 'Aucun contenu',
  'content.noPayloadCaptured': 'Aucune charge utile enregistrée',
  'content.noResultCaptured': 'Aucun résultat enregistré',
  'content.resultJson': 'Résultat au format JSON',
  'content.payloadJson': 'Charge utile au format JSON',
  'content.schemaUnavailable': 'Schéma indisponible',
  'history.loadingTrajectory': 'Chargement de la trajectoire…',
  'history.loadingEarlier': 'Chargement de l’historique antérieur…',
  'history.loadEarlier': 'Charger l’historique antérieur',
  'request.heading': 'Requête nº {number}',
  'request.compactionHeading': 'Compaction · {section}',
  'request.boundary': 'Requête nº {number}',
  'request.compactionBoundary': 'Requête nº {number} · Compaction',
  'request.collapsedTurnSummary': 'Résumé du tour réduit, {summary}',
  'request.collapsedAssistantSummary': 'Résumé de l’assistant réduit, {summary}',
  'request.ariaCompaction': 'Requête {number}, compaction',
  'request.ariaRecord': 'Requête {number}, {kind}, {content}',
  'request.ariaRecordWithoutNumber': '{kind}, {content}',
  'request.noContent': 'aucun contenu',
  'details.event': 'Détails de l’événement',
  'details.resize': 'Redimensionner les détails de l’événement',
  'details.resizeTitle': 'Faites glisser pour redimensionner. Double-cliquez pour réinitialiser.',
  'details.close': 'Fermer les détails',
  'overview.status': 'État',
  'overview.purpose': 'Objet',
  'overview.compaction': 'Compaction',
  'overview.provider': 'Fournisseur',
  'overview.model': 'Modèle',
  'overview.toolCalls': 'Appels d’outil',
  'overview.subtoolCalls': 'Appels de sous-outil',
  'overview.error': 'Erreur',
  'overview.retry': 'Nouvelle tentative',
  'overview.scheduled': 'Planifiée',
  'overview.retryOf': '{retry} sur {max}',
  'overview.retryDelay': 'Délai avant nouvelle tentative',
  'overview.result': 'Résultat',
  'overview.compacted': 'Compacté',
  'overview.assistantMessage': 'Message de l’assistant',
  'overview.source': 'Source',
  'overview.hierarchy': 'Hiérarchie',
  'overview.toolCall': 'Appel d’outil',
  'overview.requestTiming': 'Chronométrage de la requête',
  'overview.noSystemPrompt': 'Aucun prompt système dans cette requête',
  'error.sessionUnavailable': 'La session « {sessionId} » est indisponible.',
  'error.compactionInterrupted': 'La compaction a été interrompue avant la fin.',
}

/** Simplified Chinese dictionary. */
export const zh: Record<TrajectoryKey, string> = {
  'view.trajectory': '轨迹',
  'toolbar.aria': '轨迹工具栏',
  'toolbar.duration': '时长',
  'toolbar.useActualDuration': '使用实际时长',
  'toolbar.useEqualWidth': '使用等宽操作',
  'toolbar.actualTime': '实际时间',
  'toolbar.turns': '轮次',
  'toolbar.expandTurns': '展开轮次',
  'toolbar.collapseTurns': '折叠轮次',
  'toolbar.calls': '调用',
  'toolbar.expandCalls': '展开调用',
  'toolbar.collapseCalls': '折叠调用',
  'toolbar.search': '搜索轨迹',
  'toolbar.searchPlaceholder': '搜索',
  'kind.system': '系统',
  'kind.user': '用户',
  'kind.context': '上下文',
  'kind.compacted': '已压缩',
  'kind.assistant': '助手',
  'kind.tool': '工具',
  'kind.subtool': '子工具',
  'column.input': '输入',
  'column.output': '输出',
  'column.reasoning': '思考',
  'column.time': '时间',
  'group.message': '消息',
  'group.step': '步骤 {step}',
  'group.compaction': '压缩 {seq}',
  'group.turn': '轮次 {turn}',
  'group.betweenTurns': '轮次之间',
  'group.steps.one': '{count} 个步骤',
  'group.steps.many': '{count} 个步骤',
  'group.toolCalls.one': '{count} 次工具调用',
  'group.toolCalls.many': '{count} 次工具调用',
  'layout.compactingContext': '正在压缩上下文…',
  'layout.compactionFailed': '压缩失败',
  'layout.contextCompacted': '上下文已压缩',
  'layout.toolCallOnly': '仅工具调用',
  'layout.promptInitialSystem': '初始系统提示词',
  'layout.promptSystemUpdated': '系统提示词已更新',
  'layout.promptToolsUpdated': '工具已更新',
  'layout.promptSystemAndToolsUpdated': '系统提示词和工具已更新',
  'layout.noOutput': '无输出',
  'timeline.aria': '轨迹时间线',
  'timeline.overviewAria': '时间线概览；水平拖动以聚焦事件',
  'timeline.noTimingData': '无计时数据',
  'timeline.laneInput': '输入',
  'timeline.laneModel': '模型',
  'timeline.laneTools': '工具',
  'timeline.total': '总计 {duration}',
  'timeline.started': '开始于 {time}',
  'timeline.ttftDecoding': 'TTFT {ttft} · 解码 {decoding}',
  'timeline.loadingEarlier': '正在加载更早的历史记录…',
  'timeline.clickLoadEarlier': '单击以加载更早的历史记录',
  'timeline.loadEarlier': '加载更早的历史记录',
  'detail.tab.systemPrompt': '系统提示词',
  'detail.tab.tools': '工具',
  'detail.tab.diff': '差异',
  'detail.tab.summary': '摘要',
  'detail.tab.options': '选项',
  'detail.tab.usage': '用量',
  'detail.tab.timing': '计时',
  'detail.tab.rawOutput': '原始输出',
  'detail.tab.preview': '预览',
  'detail.tab.raw': '原始内容',
  'detail.tab.source': '来源',
  'detail.tab.payload': '载荷',
  'detail.tab.result': '结果',
  'detail.tab.schema': 'Schema',
  'state.notAvailable': '不可用',
  'state.notRecorded': '未记录',
  'state.stepStartUnavailable': '步骤开始时间不可用',
  'state.pending': '等待中',
  'state.firstTokenUnavailable': '首个 token 时间不可用',
  'state.usageUnavailable': '用量不可用',
  'state.outputTokensUnavailable': '输出 token 不可用',
  'state.durationTooShort': '时长过短',
  'state.failed': '失败',
  'state.completed': '已完成',
  'timing.showLocalTime': '显示本地时间',
  'timing.showUnixTimestamp': '显示 Unix 时间戳',
  'timing.started': '开始时间',
  'timing.totalDuration': '总时长',
  'timing.ttft': 'TTFT',
  'timing.generation': '生成',
  'timing.throughput': '吞吐量',
  'timing.duration': '时长',
  'timing.source': '计时来源',
  'timing.sessionTimestamps': '会话时间戳',
  'timing.sessionTimestampsRunning': '会话时间戳（运行中）',
  'usage.tokens': 'Token',
  'usage.reasoning': '推理',
  'usage.content': '内容',
  'usage.notReported': '未报告用量',
  'usage.input': '输入',
  'usage.cached': '缓存读取',
  'usage.cacheCreated': '缓存写入',
  'usage.other': '其他',
  'usage.output': '输出',
  'usage.thisRequest': '本次请求',
  'usage.sessionCumulative': '会话累计',
  'request.optionsNotRecorded': '未记录请求选项',
  'request.optionsJson': '请求选项 JSON',
  'json.copyValue': '复制值',
  'json.copyJson': '复制 JSON',
  'json.copyPath': '复制属性路径',
  'json.copyPrettyJson': '复制格式化 JSON',
  'json.copyCompactJson': '复制紧凑 JSON',
  'json.copied': '已复制',
  'json.copyFailed': '复制失败',
  'json.collapseNode': '折叠 JSON 节点',
  'json.expandNode': '展开 JSON 节点',
  'json.copyButtonTitle': '{action}；右键可显示复制选项',
  'source.unknown': '未知',
  'source.user': '用户',
  'source.plugin': '插件',
  'source.pluginNamed': '插件 · {plugin}',
  'source.goal': '目标',
  'source.goalRound': '目标 · Round {round}',
  'source.notRecorded': '未记录来源',
  'source.json': '消息来源 JSON',
  'content.toolCallOnlyParenthesized': '（仅工具调用）',
  'content.openToolCallSummary': '打开工具调用摘要',
  'content.openBlockToolCallSummary': '打开块 #{index} 的工具调用摘要',
  'content.blockLabel': '块 #{index} {type}',
  'content.openImage': '打开图片',
  'content.noTools': '此请求没有工具',
  'content.parameters': '参数',
  'content.parametersJson': '{name} 参数 JSON',
  'content.thinking': '思考',
  'content.noContent': '无内容',
  'content.noPayloadCaptured': '未捕获载荷',
  'content.noResultCaptured': '未捕获结果',
  'content.resultJson': '结果 JSON',
  'content.payloadJson': '载荷 JSON',
  'content.schemaUnavailable': 'Schema 不可用',
  'history.loadingTrajectory': '正在加载轨迹…',
  'history.loadingEarlier': '正在加载更早的历史记录…',
  'history.loadEarlier': '加载更早的历史记录',
  'request.heading': '请求 #{number}',
  'request.compactionHeading': '压缩 · {section}',
  'request.boundary': '请求 #{number}',
  'request.compactionBoundary': '请求 #{number} · 压缩',
  'request.collapsedTurnSummary': '已折叠的轮次摘要，{summary}',
  'request.collapsedAssistantSummary': '已折叠的助手摘要，{summary}',
  'request.ariaCompaction': '请求 {number}，压缩',
  'request.ariaRecord': '请求 {number}，{kind}，{content}',
  'request.ariaRecordWithoutNumber': '{kind}，{content}',
  'request.noContent': '无内容',
  'details.event': '事件详情',
  'details.resize': '调整事件详情大小',
  'details.resizeTitle': '拖动以调整大小。双击以重置。',
  'details.close': '关闭详情',
  'overview.status': '状态',
  'overview.purpose': '用途',
  'overview.compaction': '压缩',
  'overview.provider': '提供方',
  'overview.model': '模型',
  'overview.toolCalls': '工具调用',
  'overview.subtoolCalls': '子工具调用',
  'overview.error': '错误',
  'overview.retry': '重试',
  'overview.scheduled': '已计划',
  'overview.retryOf': '第 {retry} 次，共 {max} 次',
  'overview.retryDelay': '重试延迟',
  'overview.result': '结果',
  'overview.compacted': '已压缩',
  'overview.assistantMessage': '助手消息',
  'overview.source': '来源',
  'overview.hierarchy': '层级',
  'overview.toolCall': '工具调用',
  'overview.requestTiming': '请求计时',
  'overview.noSystemPrompt': '此请求没有系统提示词',
  'error.sessionUnavailable': '会话“{sessionId}”不可用。',
  'error.compactionInterrupted': '压缩在完成前被中断。',
}
