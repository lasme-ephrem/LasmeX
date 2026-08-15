# Guide des types de plugins d’extension

Modèles de référence pour les extensions de LasmeX. Les extraits omettent les imports et les implémentations auxiliaires ; ils ne sont pas prêts à être copiés tels quels. Pour des procédures concrètes, consultez la [liste de contrôle d’un package](adding-a-package.md), le [tutoriel du premier outil](../user/develop/basic/tool.md), la [référence des outils](adding-a-tool.md) et le [guide des adaptateurs LLM](adding-an-llm-adapter.md). La [page d’architecture](../architecture.md) décrit le système et la carte de ses points d’extension.

## Un plugin d’outil

Un outil s’enregistre dans `ctx.tools`. L’exemple annoté de `defineTool` — arguments typés de `execute`, construction du résultat et modèle `run_in_background` — se trouve dans [adding-a-tool.md](adding-a-tool.md). Ce guide fait autorité pour les définitions d’outils. Les `ToolDefinition` en JSON Schema brut sont également acceptées directement par `ctx.tools.register()`, comme pour les outils provenant de MCP. `defineTool` est l’utilitaire typé destiné aux outils internes.

## Un plugin de hook : exemple de contrôle d’autorisation
<a id="a-hook-plugin-permission-gate-example"></a>

Ce contrôle d’autorisation illustre un plugin de hook. Il renvoie une décision typée depuis le point de contrôle `tools/pre-execute` pour autoriser ou refuser un appel. Les plugins de sandbox, d’autorisation et de mode plan peuvent employer ce point d’extension. Un plugin de hook peut intercepter d’autres points d’extension et n’est pas nécessairement un contrôle d’autorisation. Un « hook natif » est un plugin Cordis ordinaire placé sur un point d’interception ; il ne nécessite aucun protocole externe.

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from 'lasmex-tools'

declare function isAllowed(exec: ToolExecution): Promise<boolean>

export const name = 'permission-gate'

export function apply(ctx: Context) {
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (!(await isAllowed(exec))) {
      return { kind: 'deny', reason: 'Denied by policy.' }
    }
    return next()
  })
}
```

Cette cascade constitue la couche de politique réordonnable. Employez `ctx.tools.guard()` lorsqu’une propriété de sécurité exige un refus final monotone, `tools/execute` lorsqu’un plugin doit envelopper la durée réelle de la répartition — délais, tentatives et mesures ; seul `exec.signal` peut être remplacé —, `tools/post-execute` pour transformer explicitement le résultat, et `tools/result` pour observer de façon contenue le résultat final immuable. Le [guide d’ajout d’un outil](adding-a-tool.md#execution-policy-and-observation) donne la règle de sélection.

## Un plugin d’interface

Un plugin d’interface effectue son rendu depuis le flux `session/event` — flux de jetons de l’assistant sous forme de `assistant/chunk`, limites de tours et d’étapes et activité des outils — puis renvoie les entrées par `agent.followup()` ou `agent.steer()`. Un plugin de navigateur qui ajoute une ligne métier au client Web intégré enregistre plutôt une `ConversationNodeDefinition` et un moteur de rendu Chat associé à une clé. Suivez le [guide des nœuds de conversation](adding-a-conversation-node.md).

```ts
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from 'lasmex-llm'
import { SessionId } from 'lasmex-session'

declare function render(text: string): void
declare function onUserInput(handler: (text: string) => void): void

export const name = 'my-ui'
export const inject = ['agents']

export function apply(ctx: Context) {
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'assistant/chunk' && event.data.chunk.type === 'text-delta') {
      render(event.data.chunk.text)
    }
  })
  onUserInput(text => ctx.agents.get(SessionId('client-session'))?.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })))
}
```

## Un pilote de protocole externe

Un *pilote de protocole* adapte un homologue distant à `ctx.agents`. Il peut servir une interface ou un client d’automatisation. Un pilote stdio contrôle stdout, crée ou reprend des agents par la fabrique et associe les requêtes du protocole à `followup()` ou `cancel()`. Une requête d’invite de bas niveau renvoie un accusé durable de mise en file ; elle n’obtient pas de résultat en corrélant un `MessageId` avec `turn/end`. Publiez séparément l’état global de l’agent. Une méthode d’automatisation peut attendre, à partir de cet accusé, le prochain état inactif et résumer l’intervalle dont elle est explicitement propriétaire, tandis qu’une interface observe normalement le flux d’événements sans fin définie. Démontez les agents avec `AgentHandle.dispose()` afin d’attendre la fin complète du nettoyage.

[`packages/acp/acp`](../../packages/acp/acp) est l’exemple complet réservé à l’automatisation. Il expose de nouvelles sessions texte sur Agent Client Protocol JSON-RPC stdio, émet le texte validé de l’assistant et enregistre un répondant d’autorisation ponctuel pour les agents dont il est propriétaire. Son [README](../../packages/acp/acp/README.md) définit les méthodes exactes, l’ordre des événements et le contrat de cycle de vie.

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-protocol-bridge'
export const inject = ['agents', 'sessions', 'sessionPersistence']

export function apply(ctx: Context) {
  // Stream every logged assistant text/reasoning delta out to the client.
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'assistant/chunk') {
      const chunk = event.data.chunk
      if (chunk.type === 'text-delta') {
        // sendToClient({ kind: 'message_chunk', text: chunk.text })
      }
    }
  })
  // Inbound "prompt": create/resume an agent, feed it, and return its enqueue receipt.
  // Whole-agent status is a separate notification; no turn end belongs to this prompt.
  // Teardown reaches quiescence via AgentHandle.dispose() (stop + await exit).
}
```

## Compositions exécutables

Les feuilles exécutables chargent leur arbre de plugins depuis `examples/*/cordis.yml`. Les scripts racine `demo:*` et ces répertoires de feuilles constituent l’inventaire faisant autorité. Le lanceur du produit `lasmex` gère l’exécution Web et l’exécution headless ponctuelle. Les feuilles ACP emploient [`lasmex-acp-demo`](../../packages/examples/acp-demo), tandis que les feuilles JSON-RPC emploient [`lasmex-sdk-jsonrpc-demo`](../../packages/examples/jsonrpc-demo). La feuille d’instantané headless monte explicitement [`lasmex-agent-spine-demo`](../../packages/examples/agent-spine-demo) et la persistance JSONL, puis les pilote avec un jeu de données de test appartenant à l’exemple plutôt qu’avec un package d’application livré.

## Carte fonctionnalité → mécanisme

Chaque fonctionnalité du produit correspond à un écouteur placé sur un point d’extension documenté. Ce principe du micro-noyau devient ainsi vérifiable ([Agent Note sur le micro-noyau](../../.agents/notes/implemented/architecture/2026-06-11-microkernel-event-taxonomy.md)). Aucune ligne ne modifie la boucle.

`system-prompt/assemble` est une transformation experte et coopérative de l’assemblage entier. L’assemblage renvoyé fait autorité : les auteurs d’écouteurs doivent préserver les contributions actives du mode Code et du protocole de sortie structurée. Préférez `ctx.tools.restrict()` pour un filtrage des outils qui doit rester aligné entre la présentation, la recherche et l’exécution.

| Fonctionnalité produit | Mécanisme du plugin |
|---|---|
| Système de hooks, au niveau utilisateur et projet | Écouteurs sur `agent/session-start`, `agent/pre-step`, `agent/request`, `tools/pre-execute`, `tools/post-execute` et `agent/turn-stopping`. Les cascades renvoient des décisions typées, tandis que `agent/turn-stopping` peut piloter une étape supplémentaire. Les ponts `lasmex-hooks-claude-code` et `lasmex-hooks-codex` associent les fichiers de configuration des hooks à ces points d’extension. |
| `/goal` | `ctx.goals` possède l’état durable, `lasmex-goal-round-driver` planifie des cycles dans la même session par l’`Agent` public, et des producteurs distincts de commandes et d’outils exposent le contrôle humain et celui du modèle. |
| `/loop` | Sur l’événement de session `turn/end`, appeler `followup()` pour l’itération suivante, ou forcer la continuation. |
| Workflow dynamique | `ctx.workflowEngine`, moteur à worker thread et outil `workflow`. Les enfants structurés dans le processus imposent la sortie au moyen d’enregistrements d’invite et d’outils à portée limitée, d’un contrôle d’outil monotone, de la validation finale de `tools/result` — y compris le `run_code` englobant — et du marqueur monotone `concludeTurn()` de l’exécution à sortie structurée. |
| Messages en file et pilotage | `Agent.followup()` / `Agent.steer()` du cœur. |
| Compaction du contexte, automatique et manuelle | Seam `ctx.compaction` et `lasmex-compaction-basic`. La pression automatique s’exécute sur `agent/pre-step` séquentiel, la récupération canonique d’un dépassement sur `agent/request-error`, et les appelants manuels utilisent le même service de compaction ([Agent Note sur la compaction](../../.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md)). |
| Configuration de l’invite système | `ctx.systemPrompt.section()` avec ordre et remplacement local à la portée. |
| AGENTS.md à la racine | Un fournisseur de section qui lit le fichier. |
| AGENTS.md d’un sous-répertoire, à l’accès, et avis de modification de fichier | `agent.inject()` depuis un watcher ou un écouteur de résultat d’outil. |
| Outils intégrés | `ctx.tools.register()` ; les schémas rejoignent automatiquement l’assemblage. Les familles `lasmex-tool-*` — bash, fs, web, subagent et todo — sont les exemples fournis. |
| ToolSearch et divulgation progressive | Remplacer l’enregistrement `ctx.tools.restrict()` à portée limitée lorsque l’ensemble visible change. Le registre aligne la présentation, la recherche et l’exécution. |
| Délai, nouvelles tentatives et mesures d’un outil | Envelopper la répartition du cœur avec `tools/execute`. Le plugin enveloppant peut remplacer `exec.signal`, déléguer et examiner le résultat normalisé pendant un même cycle lexical. |
| Mesures, audit ou capture du résultat final d’un outil | Observer les résultats immuables faisant autorité avec `tools/result`. Employer `tools/post-execute` uniquement si le plugin doit transformer le résultat ou joindre du contexte. |
| Politique monotone de fin de tour | Appeler `ToolExecution.concludeTurn()` depuis l’outil terminal réussi. Les appels d’outils ultérieurs dans la même réponse restent contrôlables et la boucle s’arrête après l’étape. |
| Sandbox de sous-processus, landlock ou sandbox-exec | Employer un backend `ctx.sandbox` par `lasmex-bash-sandbox`. Employer `tools/pre-execute` pour un refus au niveau d’une capacité. |
| Système d’autorisations et AskUserQuestion | Renvoyer `ask` depuis `tools/pre-execute` et répondre au moyen de `ctx.approval`. Enregistrer un outil de question distinct destiné au modèle pour les questions ordinaires à l’utilisateur. |
| Mode plan | [`lasmex-plan-mode`](../../packages/plan/plan-mode/README.md) — état journalisé `plan/mode`, section de consignes `plan:policy`, entrée par `/plan [message]`, sortie directe `/plan off` et sortie `exit_plan_mode` validée par l’utilisateur. L’application des restrictions reste indépendante sur les axes sandbox et approbation. |
| Délégation à un sous-agent | Registre de fournisseurs `ctx.subagents` — `lasmex-subagent-spawn-in-process`/`-fork`/`-acp`/`-codex`/`-claude-code`/`-lasmex-sdk` — et `lasmex-tool-subagent`, qui expose au modèle un fournisseur configuré. |
| MCP | Un plugin par serveur : découvrir les outils, puis appeler `ctx.tools.register()`. |
| Skills | Enregistrement d’une section et d’un outil ; `inject()` transmet le contenu du skill à l’invocation. |
| Mémoire | Fournisseur de section et outil. |
| Tâches planifiées, cron | Un plugin enregistre des outils de planification appelables par le modèle. Au déclenchement du minuteur : `followup(…, {source: {kind: 'cron', …}})` si l’agent est inactif, sinon un avis par `inject()`. |
| Interface, GUI ; la CLI émet du JSONL | Écouter `session/event` — fragments de l’assistant, limites et activité des outils — puis transmettre l’entrée à `followup()`. |
| Nœud métier de discussion du client Web | Enregistrer une `ConversationNodeDefinition` et un moteur de rendu sous la clé `conversation.chat.node`. |
| SessionTelemetryBackend et trace rejouable | `session/event` vers JSONL ; rejeu par `sessions.create(id, { seed })`. |
| Adaptateurs de modèles | Sous-classe de `LlmAdapter` par `registerAdapter` — `lasmex-llm-deepseek`, `lasmex-llm-pi-ai`. |
| Rechargement à chaud des plugins | Chaque enregistrement est un `ctx.effect` ; le HMR fourni fonctionne directement. |
