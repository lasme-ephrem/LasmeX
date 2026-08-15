import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type {} from 'lasmex-skill'
import { SessionId } from 'lasmex-session'
import type {} from 'lasmex-agent-presets'
import { launchWebScaffold, realizeSeedFixture, type WebScaffold } from './scaffold.ts'

it('realizes JSONL seed paths structurally for Windows workspaces', () => {
  const workspaceCwd = String.raw`C:\Users\runner\LasmeX workspace`
  const fixture = [
    JSON.stringify({ type: 'session', id: '{{sessionId}}', cwd: '{{cwd}}' }),
    JSON.stringify({ type: 'event', data: { text: 'opened {{cwd}}/proof.txt for {{sessionId}}' } }),
    '',
  ].join('\n')

  const realized = realizeSeedFixture({ workspaceCwd } as WebScaffold, fixture, 'session-1')
  const records = realized.trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
  expect(records[0]).toMatchObject({ id: 'session-1', cwd: workspaceCwd })
  expect(records[1]).toMatchObject({ data: { text: `opened ${workspaceCwd}/proof.txt for session-1` } })
})

async function writeSkill(root: string, name: string): Promise<void> {
  const bundle = join(root, name)
  await mkdir(bundle, { recursive: true })
  await writeFile(join(bundle, 'SKILL.md'), `---
name: ${name}
description: Must not enter the Web replay scaffold
---

Ambient host state.
`)
}

it('isolates replay skill discovery from every ambient host root', async () => {
  const ambient = await mkdtemp(join(tmpdir(), 'lasmex-web-ambient-skills-'))
  const lasmexHome = join(ambient, 'dsh-home')
  const agentsHome = join(ambient, 'agents-home')
  const bundled = join(ambient, 'bundled')
  await Promise.all([
    writeSkill(join(lasmexHome, 'skills'), 'ambient-dsh'),
    writeSkill(join(agentsHome, 'skills'), 'ambient-agents'),
    writeSkill(bundled, 'ambient-bundled'),
  ])

  const originalLasmexHome = process.env.LASMEX_HOME
  const originalAgentsHome = process.env.LASMEX_AGENTS_HOME
  const originalBundled = process.env.LASMEX_BUNDLED_SKILL_DIR
  process.env.LASMEX_HOME = lasmexHome
  process.env.LASMEX_AGENTS_HOME = agentsHome
  process.env.LASMEX_BUNDLED_SKILL_DIR = bundled
  let scaffold: WebScaffold | undefined
  try {
    scaffold = await launchWebScaffold()
    const ctx = scaffold.ctx
    // Local skill discovery belongs to the agent's preset LAYER of the host
    // registry, so the roots under test are only reachable through a composed
    // agent's view — the same scope the gateway's `skill.list` resolves for a
    // browser request about a session.
    const handle = await ctx.agents.create({
      sessionId: SessionId('hermetic-skills'),
      setup: agentCtx => ctx.agentPresets.mount(agentCtx).then(() => undefined),
    })
    try {
      const skills = ctx.get('skills')
      if (skills === undefined) throw new Error('the composition mounts no skill registry')
      const names = (await skills.list({ cwd: scaffold.workspaceCwd, scope: handle.agent })).map(skill => skill.name)
      expect(names).not.toContain('ambient-dsh')
      expect(names).not.toContain('ambient-agents')
      expect(names).not.toContain('ambient-bundled')
    } finally {
      await handle.dispose()
    }
  } finally {
    try {
      await scaffold?.close()
    } finally {
      if (originalLasmexHome === undefined) delete process.env.LASMEX_HOME
      else process.env.LASMEX_HOME = originalLasmexHome
      if (originalAgentsHome === undefined) delete process.env.LASMEX_AGENTS_HOME
      else process.env.LASMEX_AGENTS_HOME = originalAgentsHome
      if (originalBundled === undefined) delete process.env.LASMEX_BUNDLED_SKILL_DIR
      else process.env.LASMEX_BUNDLED_SKILL_DIR = originalBundled
      await rm(ambient, { recursive: true, force: true })
    }
  }
})
