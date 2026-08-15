/** Regression tests for reviewed French documentation parity. */

import { describe, expect, it } from 'vitest'
import { frenchDocumentationDiff } from './french-docs.ts'

describe('reviewed French documentation parity', () => {
  it('accepts translated prose around identical technical structure', () => {
    const source = '# Guide\n\nEnglish | [中文](guide.zh.md)\n\nUse `LASMEX_HOME`.\n\n[Details](details.md)\n\n```sh\nlasmex --help\n```\n'
    const french = '# Guide\n\nUtilisez `LASMEX_HOME`.\n\n[Détails](details.md)\n\n```sh\nlasmex --help\n```\n'

    expect(frenchDocumentationDiff(source, french, 'docs/guide.zh.md')).toEqual([])
  })

  it('rejects changed links, fenced code, and inline identifiers', () => {
    const source = '# Guide\n\nEnglish | [中文](guide.zh.md)\n\nUse `LASMEX_HOME`.\n\n[Details](details.md)\n\n```sh\nlasmex --help\n```\n'
    const french = '# Guide\n\nUtilisez `LASMEX_DIR`.\n\n[Détails](other.md)\n\n```sh\nlasmex -h\n```\n'

    expect(frenchDocumentationDiff(source, french, 'docs/guide.zh.md')).toEqual([
      expect.stringContaining('code block #1 diverges'),
      expect.stringContaining('link target #1 diverges'),
      expect.stringContaining('inline code #1 diverges'),
    ])
  })
})
