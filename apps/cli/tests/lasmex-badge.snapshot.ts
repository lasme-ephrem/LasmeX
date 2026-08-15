import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from 'lasmex-loader-smoke'
const binScript = fileURLToPath(new URL('./fixtures/lasmex-badge/snapshot.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/lasmex-badge/cordis.yml', import.meta.url))
const defaultConfigPath = fileURLToPath(new URL('./fixtures/lasmex-badge/default.cordis.yml', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const badgeAssetsPath = fileURLToPath(new URL('../../../packages/skill/skill-badge/assets/', import.meta.url))

describe('LasmeX badge assembled snapshot', () => {
  it('advertises and loads the opt-in bundled skill through the shipped app', async () => {
    const disabled = await runLoaderSmoke({
      label: 'disabled LasmeX badge skill snapshot',
      tempDirPrefix: 'headless-snapshot-lasmex-badge-disabled-',
      binScript,
      libBinScript: binScript,
      configPath: defaultConfigPath,
      tsconfigPath,
    })
    const enabled = await runLoaderSmoke({
      label: 'LasmeX badge skill snapshot',
      tempDirPrefix: 'headless-snapshot-lasmex-badge-',
      binScript,
      libBinScript: binScript,
      configPath,
      tsconfigPath,
    })
    const disabledSnapshot = JSON.parse(disabled.stdout) as unknown
    const enabledSnapshot = JSON.parse(
      enabled.stdout.replaceAll(badgeAssetsPath, '{{badgeAssetsPath}}'),
    ) as unknown

    expect(disabled.stderr).toBe('')
    expect(enabled.stderr).toBe('')
    expect(disabledSnapshot).toMatchInlineSnapshot(`
      {
        "catalog": null,
        "result": {
          "content": [
            {
              "text": "Error: skill "lasmex-badge" is unknown or no longer available",
              "type": "text",
            },
          ],
          "error": {
            "message": "skill "lasmex-badge" is unknown or no longer available",
          },
          "isError": true,
        },
        "summary": null,
      }
    `)
    expect(enabledSnapshot).toMatchInlineSnapshot(`
      {
        "catalog": [
          {
            "text": "<system-reminder>
      A skill is a reusable set of task-specific instructions. The following skills are available in this session:

      <available_skills>
      - \`lasmex-badge\`: Add the official “powered by LasmeX” badge to documents, pull requests, merge requests, and other content produced with LasmeX. Use whenever creating a pull request or merge request. Also use when the user asks for a LasmeX badge, powered-by-LasmeX attribution, or a reusable LasmeX badge asset or snippet.
      </available_skills>

      If the user names a skill, or the task clearly matches a skill's description, call the \`skill\` tool with the exact skill name before taking task actions. Load all applicable skills, then follow their full instructions. This catalog contains summaries only; do not infer or follow a skill's instructions until it has been loaded.
      A user may also invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the \`skill\` tool again for that skill.
      </system-reminder>",
            "type": "text",
          },
        ],
        "result": {
          "content": [
            {
              "text": "<skill_content name="lasmex-badge">
      <skill_resources>
      Base directory for this skill: C:\\Users\\lasme\\Documents\\ChatGPT\\Deepseek harness\\packages\\skill\\skill-badge\\assets\\
      Resolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.
      </skill_resources>

      <skill_instructions>
      # LasmeX Badge

      Add the official “powered by LasmeX” badge without recreating or restyling it.

      ## Assets

      - Local PNG: [\`lasmex-badge.png\`](lasmex-badge.png), 768×120 source image; render at 128×20
      - Shields.io image URL: \`https://img.shields.io/badge/powered_by-LasmeX-4D6BFE?style=flat-square\`

      ## Markdown

      Use this badge in Markdown:

      \`\`\`markdown
      ![](https://img.shields.io/badge/powered_by-LasmeX-4D6BFE?style=flat-square)
      \`\`\`

      If the user provides a LasmeX project URL, link the badge to that URL.

      ## Usage rules

      - For GitHub or GitLab Markdown, use the Shields.io URL.
      - For Feishu and other systems that import remote images unreliably, upload \`lasmex-badge.png\` from this skill directory instead of generating another badge.
      - Preserve the badge's 128×20 dimensions and aspect ratio.
      - Place the badge at the end of the attributed document or section unless the user specifies another position.
      - Do not substitute another color or label.

      </skill_instructions>
      </skill_content>",
              "type": "text",
            },
          ],
          "isError": false,
          "value": {
            "content": "# LasmeX Badge

      Add the official “powered by LasmeX” badge without recreating or restyling it.

      ## Assets

      - Local PNG: [\`lasmex-badge.png\`](lasmex-badge.png), 768×120 source image; render at 128×20
      - Shields.io image URL: \`https://img.shields.io/badge/powered_by-LasmeX-4D6BFE?style=flat-square\`

      ## Markdown

      Use this badge in Markdown:

      \`\`\`markdown
      ![](https://img.shields.io/badge/powered_by-LasmeX-4D6BFE?style=flat-square)
      \`\`\`

      If the user provides a LasmeX project URL, link the badge to that URL.

      ## Usage rules

      - For GitHub or GitLab Markdown, use the Shields.io URL.
      - For Feishu and other systems that import remote images unreliably, upload \`lasmex-badge.png\` from this skill directory instead of generating another badge.
      - Preserve the badge's 128×20 dimensions and aspect ratio.
      - Place the badge at the end of the attributed document or section unless the user specifies another position.
      - Do not substitute another color or label.
      ",
            "name": "lasmex-badge",
            "provider": "lasmex-badge",
            "resourceBase": {
              "kind": "directory",
              "path": "C:\\Users\\lasme\\Documents\\ChatGPT\\Deepseek harness\\packages\\skill\\skill-badge\\assets\\",
            },
          },
        },
        "summary": {
          "description": "Add the official “powered by LasmeX” badge to documents, pull requests, merge requests, and other content produced with LasmeX. Use whenever creating a pull request or merge request. Also use when the user asks for a LasmeX badge, powered-by-LasmeX attribution, or a reusable LasmeX badge asset or snippet.",
          "invocation": {
            "modelInvocable": true,
            "userInvocable": true,
          },
          "name": "lasmex-badge",
          "provider": "lasmex-badge",
          "resourceBase": {
            "kind": "directory",
            "path": "C:\\Users\\lasme\\Documents\\ChatGPT\\Deepseek harness\\packages\\skill\\skill-badge\\assets\\",
          },
          "source": "bundled",
        },
      }
    `)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS * 2)
})
