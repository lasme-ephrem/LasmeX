import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from 'lasmex-loader-smoke'

const binScript = fileURLToPath(new URL('./fixtures/context-before-prompt/snapshot.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/context-before-prompt/cordis.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))

describe('step context ordering assembled snapshot', () => {
  it('keeps the direct prompt salient after a local adapter tool continuation', async () => {
    const result = await runLoaderSmoke({
      label: 'context-before-prompt assembled snapshot',
      tempDirPrefix: 'lasmex-context-before-prompt-',
      binScript,
      libBinScript: binScript,
      configPath,
      tsconfigPath,
      async prepare(cwd) {
        await mkdir(join(cwd, '.git'))
        await writeFile(join(cwd, 'AGENTS.md'), 'Answer the direct request after reading all context.\n')
        const skillDir = join(cwd, '.agents', 'skills', 'local-proof')
        await mkdir(skillDir, { recursive: true })
        await writeFile(
          join(skillDir, 'SKILL.md'),
          '---\nname: local-proof\ndescription: Proves local skill discovery.\n---\n\nLocal proof instructions.\n',
        )
      },
    })

    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout) as unknown).toMatchInlineSnapshot(`
      {
        "eventSources": [
          "agent-instructions",
          "plugin:lasmex-system-prompt",
          "skill-catalog",
          "user",
          "plugin:agent-loop",
        ],
        "firstRequestSources": [
          "agent-instructions",
          "plugin:lasmex-system-prompt",
          "skill-catalog",
          "user",
        ],
        "output": "LasmeX local opérationnel.",
        "secondRequestSources": [
          "agent-instructions",
          "plugin:lasmex-system-prompt",
          "skill-catalog",
          "user",
          "model",
          "tool",
          "plugin:agent-loop",
        ],
        "tail": "<system-reminder>
      Completed tool calls: memory_list.
      Do not call those tools again merely to satisfy the quoted request; use their results above. Complete only the remaining part of the request. If it specifies an exact final response, reproduce that response verbatim, including punctuation.

      <direct-user-request>
      Utilise memory_list une seule fois, puis réponds exactement : LasmeX local opérationnel.
      </direct-user-request>
      </system-reminder>",
        "toolCalls": 1,
        "toolHistory": true,
      }
    `)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
