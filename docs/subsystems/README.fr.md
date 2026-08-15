# Sous-systèmes

Une page par sous-système de LasmeX : sa fonction, les structures de données qu’il transporte et, lorsqu’un service `ctx` ou un domaine d’événements le sous-tend, une section **API Cordis** générée contenant la référence de ses services et événements. Ce dossier complète [architecture.md](../architecture.md), qui décrit les *comportements* entre sous-systèmes — carte des services, cycle session/tour/étape et taxonomie des événements. Chaque page de ce dossier constitue la référence du vocabulaire et du câblage d’un sous-système.

| Page | Responsabilité |
|---|---|
| [core.md](core.md) | La manière dont `packages/core` contrôle la boucle : description package par package, création et propriété de l’agent (`AgentHandle`), contrats de livraison, d’annulation et d’interception du handle `Agent`, ainsi que les modèles de types communs au dépôt (`…Map → derived-union`, identifiants marqués) |
| [llm-streaming.md](llm-streaming.md) | Les types de conversation de `packages/llm` — `Message`/`ContentBlock`, la requête de modèle assemblée, le protocole filaire `StreamChunk`, le contrat d’adaptateur, `BlockAssembler` et le contrat du fournisseur `LlmAdapter` |
| [token-meter.md](token-meter.md) | Les mesures de rejeu scalaires et positionnelles immuables avec révisions du journal consommé |
| [scope.md](scope.md) | L’identité des enregistrements à portée limitée, les supports de routage et le contexte `Scope` propriétaire |
| [typert.md](typert.md) | Les descripteurs d’invocation distante, les déclarations de recherche et de Context, les registres Typert et les limites des API Host Gateway/Client |
| [goal.md](goal.md) | L’identité persistante des objectifs, leurs instantanés de cycle de vie, leur activation, les changements et l’attribution des cycles |
| [schedule.md](schedule.md) | Les rappels propres à une session, leurs transitions durables, leurs vues actives et leur livraison dans la conversation ordinaire |
| [commands.md](commands.md) | Le service de registre des commandes humaines : définitions, découverte par les adaptateurs, invocation directe, résultats et vues d’analyse |
| [session.md](session.md) | Le catalogue complet des variantes de `SessionEventMap`, `TurnTrigger`/`TurnEndReason`, `deriveMessages()`, l’inclusion des exécutions et les événements autonomes |
| [persistence.md](persistence.md) | Le seam de durabilité : `SessionPersistence`, les backends JSONL et SQLite, `session/flush`, la récupération après incident et `SessionHeader` |
| [settings.md](settings.md) | Le seam des réglages utilisateur : enregistrement de `SettingsNamespace`, résolution en couches — valeurs par défaut → `base` de composition → document utilisateur —, portées propriétaires et validations à chaud |
| [credentials.md](credentials.md) | Le seam des informations d’authentification : références `CredentialRef`, jamais les valeurs, dans la configuration, résolution par opération, `CredentialInfo` sans danger pour l’interface et couches de sources du fournisseur |
| [session-query.md](session-query.md) | Les enregistrements logiques, lectures bornées d’événements exacts, traces de relations, filtres et documents sémantiques, ainsi que les pages de résultats plein texte |
| [feedback.md](feedback.md) | Les retours propres à chaque message et liés au cycle de vie, les versions optimistes, la persistance annexe et le contrat Host Remote |
| [session-title.md](session-title.md) | Les instantanés de titre durables, les séquences des messages sources citées et le contrat asynchrone du fournisseur |
| [session-reference.md](session-reference.md) | Les références intersession structurées : `SessionReferenceInput`/`Candidate`, les contextes de message préparés et la taxonomie d’erreurs stable |
| [system-prompt.md](system-prompt.md) | Le contexte propre à chaque assemblage, les résultats des fournisseurs d’outils, les sections d’invite et l’assemblage coopératif |
| [tools.md](tools.md) | Tous les champs de `ToolDefinition`, le DSL de schéma, `ToolExecution`/`ToolResult`, les types de présentation des outils dans l’interface et le pipeline d’exécution protégé |
| [user-questions.md](user-questions.md) | Le seam de questions et réponses humaines fourni par l’interface : `AskUserQuestionRequest`, vocabulaire des réponses et options, API du fournisseur et taxonomie d’erreurs |
| [approval.md](approval.md) | Le seam d’approbation utilisateur ponctuelle : `ApprovalRequest`, `ApprovalOutcome`, politique par session, événements d’audit et contrats des répondants |
| [attachment.md](attachment.md) | L’identité et les métadonnées durables des images, les entrées de validation, les lectures vérifiées et le seam `AttachmentStore` |
| [shell.md](shell.md) | Le seam de l’exécuteur Bash : `ShellExecRequest`/`Spec`, `ShellRunResult` et les handles `ShellProcess` en arrière-plan |
| [subprocess.md](subprocess.md) | Le seam de sous-processus : `SubprocessSpawnSpec` entièrement explicite, lecteurs de sortie par décalage, `SubprocessOutcome` non classé et vocabulaire d’environnement `LASMEX_*` géré |
| [terminal.md](terminal.md) | Les identifiants de terminaux persistants, contrats du backend et de la session, préparation des envois, lectures bornées et instantanés visibles par le propriétaire |
| [sandbox.md](sandbox.md) | La résolution des politiques par session et le seam de confinement des processus : modes d’effets fichiers, politiques d’exécution et de fournisseur, `ConfinedArgv`, application et erreurs en fermeture sûre |
| [code-runtime.md](code-runtime.md) | Le seam d’exécution de code : `CodeRunRequest`/`Result`, espaces de noms des liaisons, journaux capturés et taxonomie `CodeRunFailure` |
| [extensions.md](extensions.md) | Les plugins et packages Cordis dynamiques versionnés, l’activation Host/Client, l’approbation, l’inspection du runtime et le démontage du cycle de vie |
| [filesystem.md](filesystem.md) | Le seam de système de fichiers : `FsTarget`, résultats de lecture, écriture et modification, état des fichiers observés et `FsErrorCode` |
| [lsp.md](lsp.md) | Le seam de navigation LSP : `LspQueryRequest`/`Result`, `LspProvider`/`Service`, quatre opérations et `LspError` |
| [skills.md](skills.md) | Le service de skills : priorité de découverte, `SkillSummary`/`SkillDefinition`, catalogue du préfixe de session et chargement de `skill` destiné au modèle |
| [compaction.md](compaction.md) | Le seam de compaction : événements de session `compaction/*`, `CompactionResult` et interface `CompactionEngine` |
| [subagent.md](subagent.md) | Le seam de sous-agents : registre de fournisseurs nommés, `SubagentStartRequest`/`Result`/`Run` et séparation des capacités au démarrage et à l’exécution |
| [web.md](web.md) | Le seam d’accès Web : `WebSearchRequest`/`Result`, `WebFetchRequest`/`Result`, `WebFetchBody`, disponibilité du fournisseur et `WebError` |
| [spill.md](spill.md) | Le seam de stockage des débordements : `SaveTextSpill`, `SpillOwner`/`SpillSource`, `SpillRef` et `SpillLocator` marqué |
| [workflow.md](workflow.md) | Le seam de workflows : `WorkflowStartRequest`, `WorkflowMeta`, `WorkflowRun`/`Result`, charges utiles des événements `workflow/*` et caractère fatal de `WorkflowError` |
| [jobs.md](jobs.md) | Le runtime des tâches en arrière-plan : `JobId` marqués, contrat du producteur, vues du consommateur et comportement du service `ctx.jobs` |
| [permission-presets.md](permission-presets.md) | La couche des préréglages d’autorisations : `PresetSpec`/`PresetOption`, état `custom` dérivé et événement `permission/preset` réservé au journal |
| [plan.md](plan.md) | Le mode plan : état `plan/mode` réservé au journal, validation de la sélection en attente, `PlanModeConfig` et parcours de validation de `exit_plan_mode` |
| [invariants.md](invariants.md) | Le registre des propriétés vérifiées à l’exécution : sélection de `Config`, `InvariantInstaller`/`InvariantFailure` et contrat d’un compagnon vide |
| [web-server.md](web-server.md) | Le transport HTTP : `WebRouteKind`/`WebRoute`, ordre de correspondance, emplacement de repli réclamable et points d’interception de l’index |
| [storage.md](storage.md) | Le sous-système de stockage : contrat du backend (`StorageBackend`), `StorageForms`, `DomainSpec`/`Domain` et `domain/changed` |
| [memory.md](memory.md) | La mémoire à long terme explicite, propre au projet : identifiants marqués, enregistrements durables bornés, admission des mutations et contexte épinglé rejouable |
| [workspace.md](workspace.md) | Le registre des espaces de travail : `Workspace`/`WorkspaceId`, enregistrement et résolution, relation avec le `cwd` de session |
| [client-modules.md](client-modules.md) | La table des plugins Web : déclarations `lasmex.client`, composition filaire `WebBootGraph`, route du bundle et tap d’index |
| [session-projection.md](session-projection.md) | Le seam de projection : `SessionProjectionMap`, unité pure `ProjectionDefinition`, coupe cohérente de `ProjectionSnapshot` et flux de changements |
| [session-telemetry.md](session-telemetry.md) | Le seam de capacité de rapports de session sortants : `SessionTelemetryRecord`/`SessionTelemetrySeverity`, contrat `SessionTelemetrySink` et cascade de masquage `session-telemetry/record` |

> Les déclarations de types et leur JSDoc sur ces pages sont équivalentes aux sources et leur dérive est vérifiée par `pnpm run verify-type-equiv` (voir [development.md](../development.md#documenting-types-verbatim-ts-type-equiv)). Les blocs ordinaires conservent les déclarations complètes ; les blocs `public-api` conservent les déclarations de classes publiques sans leur corps. Les services et événements Cordis utilisent la section **API Cordis** générée de chaque page.
