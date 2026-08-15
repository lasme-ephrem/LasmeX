// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from 'lasmex-client-locale/client'

const repositoryRoot = resolve(import.meta.dirname, '../../../..')
const visibleAttributes = new Set([
  'alt',
  'aria-label',
  'caption',
  'description',
  'label',
  'placeholder',
  'summary',
  'title',
])
const englishCopyWords = [
  'an', 'and', 'are', 'cancel', 'choose', 'close', 'copy', 'current', 'delete', 'done', 'edit',
  'failed', 'failure', 'for', 'from', 'hide', 'is', 'less', 'loading', 'more', 'new', 'none',
  'of', 'open', 'retry', 'save', 'search', 'select', 'settings', 'show', 'submit', 'that', 'the',
  'these', 'this', 'those', 'to', 'unknown', 'welcome', 'were', 'with', 'without', 'you', 'your',
] as const
const englishCopy = new RegExp(`\\b(?:${englishCopyWords.join('|')})\\b`, 'i')

interface VisibleLiteral {
  file: string
  line: number
  text: string
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return extname(path) === '.tsx' ? [path] : []
  })
}

function isLocaleRegistry(file: string): boolean {
  const normalized = file.replaceAll('\\', '/')
  return normalized.endsWith('/locales.ts') || normalized.includes('/src/locales/')
}

function contains(ancestor: ts.Node, node: ts.Node): boolean {
  return ancestor.pos <= node.pos && ancestor.end >= node.end
}

function isRenderedLiteral(node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral): boolean {
  let expression = false
  for (let current: ts.Node | undefined = node.parent; current !== undefined; current = current.parent) {
    if (ts.isCallExpression(current)) return false
    if (ts.isBinaryExpression(current) && current.operatorToken.kind !== ts.SyntaxKind.PlusToken) {
      return false
    }
    if (ts.isConditionalExpression(current) && contains(current.condition, node)) return false
    if (ts.isJsxAttribute(current)) {
      const name = current.name.getText()
      return visibleAttributes.has(name)
    }
    if (ts.isJsxExpression(current)) expression = true
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) return expression
  }
  return false
}

function visibleLiterals(file: string, source: string): VisibleLiteral[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: VisibleLiteral[] = []
  const add = (node: ts.Node, text: string): void => {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (normalized === '') return
    found.push({
      file: relative(repositoryRoot, file).replaceAll('\\', '/'),
      line: parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
      text: normalized,
    })
  }
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) add(node, node.text)
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      && isRenderedLiteral(node)
    ) {
      add(node, node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return found
}

describe('French-first Web surface', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps rendered literals outside locale registries free of English interface copy', () => {
    const roots = [resolve(repositoryRoot, 'packages/client'), resolve(repositoryRoot, 'apps/web/src')]
    const offenders = roots
      .flatMap(sourceFiles)
      .filter(file => file.replaceAll('\\', '/').includes('/src/'))
      .filter(file => !isLocaleRegistry(file))
      .flatMap(file => visibleLiterals(file, readFileSync(file, 'utf8')))
      .filter(({ text }) => englishCopy.test(text))
      .map(({ file, line, text }) => `${file}:${line}: ${text}`)

    expect(offenders).toEqual([])
  })

  it('detects English text content and accessible labels', () => {
    const source = '<button aria-label="Open settings">Loading plugins…</button>'
    const found = visibleLiterals(resolve(repositoryRoot, 'invalid.tsx'), source)
      .filter(({ text }) => englishCopy.test(text))
      .map(({ text }) => text)

    expect(found).toEqual(['Open settings', 'Loading plugins…'])
  })

  it('keeps the static default and dynamic document language aligned with fr, en, and zh', () => {
    const html = readFileSync(resolve(repositoryRoot, 'apps/web/index.html'), 'utf8')
    expect(html).toContain('<html lang="fr">')

    vi.stubGlobal('navigator', { languages: ['fr-FR'], language: 'fr-FR' })
    const locale = new LocaleRuntime(new Context())
    expect(document.documentElement.lang).toBe('fr')
    locale.setLocale('en')
    expect(document.documentElement.lang).toBe('en')
    locale.setLocale('zh')
    expect(document.documentElement.lang).toBe('zh')
    locale.setLocale('fr')
    expect(document.documentElement.lang).toBe('fr')
  })
})
