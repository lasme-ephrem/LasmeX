import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SessionId } from 'lasmex-session'
import { renderPrompt } from 'lasmex-system-prompt'
import { launchWebScaffold, type WebScaffold } from '../../web/tests/scaffold.ts'

const SHIPPED_PRESETS = fileURLToPath(new URL('../config/agent-presets', import.meta.url))

describe('LasmeX Code preset', () => {
  let scaffold: WebScaffold

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      agentPresets: {
        roots: [{ path: SHIPPED_PRESETS, trust: 'system' }],
        default: 'lasmex-code',
      },
    })
  }, 120_000)

  afterAll(async () => {
    await scaffold?.close()
  })

  it('assembles the French persona and Code Mode from the deployment default', async () => {
    const handle = await scaffold.ctx.agents.create({
      sessionId: SessionId('lasmex-code-snapshot'),
      meta: { cwd: scaffold.workspaceCwd },
      agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      setup: agentCtx => scaffold.ctx.agentPresets.mount(agentCtx).then(() => undefined),
    })
    try {
      const assembly = await scaffold.ctx.systemPrompt.assemble({ scope: handle.agent, agent: handle.agent })
      const personaSection = assembly.sections.find(section => section.name === 'deployment:persona')
      if (personaSection === undefined) throw new Error('LasmeX Code must contribute its persona')
      const persona = renderPrompt({ ...assembly, sections: [personaSection] })
        .replaceAll(scaffold.workspaceCwd, '{{cwd}}')
      const sdk = assembly.sections.find(section => section.name === 'tools:sdk')?.text ?? ''
      const underlyingTools = scaffold.ctx.tools.schemas(handle.agent).map(tool => tool.name).sort()

      expect({
        preset: scaffold.ctx.agentPresets.composedPreset(handle.agent.ctx),
        persona,
        presentedTools: assembly.tools.map(tool => tool.name),
        sdkCapabilities: [
          ...(sdk.includes('bash') || sdk.includes('pwsh') ? ['shell'] : []),
          ...['edit', 'read', 'subagent', 'web_search'].filter(tool => sdk.includes(tool)),
        ],
        underlyingToolCount: underlyingTools.length,
      }).toMatchInlineSnapshot(`
        {
          "persona": "Tu es LasmeX Code, un agent de développement propulsé par le modèle deepseek-v4-flash. Ton répertoire de travail est {{cwd}}.

        Travaille en français, sauf demande explicite dans une autre langue. Inspecte le projet et ses instructions avant de le modifier. Conduis chaque tâche jusqu'à un résultat utilisable, applique des changements ciblés, puis vérifie-les selon leur niveau de risque. Dans ta réponse finale, distingue clairement le résultat obtenu, les contrôles exécutés et ce qui reste éventuellement à faire. Demande une confirmation avant une action irréversible ou un choix produit important que le contexte ne permet pas de trancher.",
          "presentedTools": [
            "run_code",
          ],
          "preset": "lasmex-code",
          "sdkCapabilities": [
            "shell",
            "edit",
            "read",
            "subagent",
            "web_search",
          ],
          "underlyingToolCount": 31,
        }
      `)
    } finally {
      await handle.dispose()
    }
  })
})
