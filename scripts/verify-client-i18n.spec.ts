import { describe, expect, it } from 'vitest'
import { scanClientSource } from './verify-client-i18n.ts'

describe('scanClientSource', () => {
  it('flags JSX text, literal accessibility attributes, and direct expression strings', () => {
    const source = [
      'export function Bad() {',
      '  return <div title="Delete file" aria-label="Open">Delete everything</div>',
      '}',
    ].join('\n')
    const violations = scanClientSource(source, 'Bad.tsx')
    expect(violations.map(v => v.line)).toEqual([2, 2, 2])
    expect(violations.map(v => v.text)).toEqual(['Delete file', 'Open', 'Delete everything'])
  })

  it('accepts catalog-driven UI', () => {
    const source = [
      'export function Good({ t }: { t: (k: string) => string }) {',
      "  return <div aria-label={t('a11y.open')}>{t('text.body')}</div>",
      '}',
    ].join('\n')
    expect(scanClientSource(source, 'Good.tsx')).toEqual([])
  })

  it('ignores punctuation-only and numeric literal text', () => {
    const source = [
      'export function Noise() {',
      '  return <span>— 42</span>',
      '}',
    ].join('\n')
    expect(scanClientSource(source, 'Noise.tsx')).toEqual([])
  })
})
