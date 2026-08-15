import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import SkillRegistry from 'lasmex-skill'
import * as SkillBadge from 'lasmex-skill-badge'

describe('LasmeX skill badge', () => {
  it('registers and disposes the bundled badge skill', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillBadge)
    const resourcePath = fileURLToPath(new URL('../assets/', import.meta.url))

    expect(await ctx.skills.list()).toEqual([{
      name: 'lasmex-badge',
      description: 'Add the official “powered by LasmeX” badge to documents, pull requests, merge requests, and other content produced with LasmeX. Use whenever creating a pull request or merge request. Also use when the user asks for a LasmeX badge, powered-by-LasmeX attribution, or a reusable LasmeX badge asset or snippet.',
      invocation: { modelInvocable: true, userInvocable: true },
      provider: 'lasmex-badge',
      source: 'bundled',
      resourceBase: { kind: 'directory', path: resourcePath },
    }])
    const loaded = await ctx.skills.get('lasmex-badge')
    expect(loaded?.content).toContain('Preserve the badge\'s 128×20 dimensions')
    expect(loaded?.resourceBase).toEqual({ kind: 'directory', path: resourcePath })

    await fiber.dispose()
    expect(await ctx.skills.list()).toEqual([])
  })

  it('ships the official 768×120 PNG unchanged', async () => {
    const image = await readFile(new URL('../assets/lasmex-badge.png', import.meta.url))
    expect(image.readUInt32BE(16)).toBe(768)
    expect(image.readUInt32BE(20)).toBe(120)
    expect(createHash('sha256').update(image).digest('hex')).toBe(
      '8853660cf585a2a6c807fb68d0791ca5bae83af1f05b009ff61a3e35e7fa193e',
    )
  })
})
