/**
 * Verify that no user-visible literal text is hardcoded in client UI sources.
 *
 * Every shipped UI string must live in a locale catalog (`fr` default). The
 * scanner walks the TypeScript AST of client `.tsx` sources and flags:
 * JSX text nodes, literal `aria-label` / `aria-description` / `placeholder` /
 * `title` / `alt` attributes, and string literals directly inside JSX
 * expressions (`{'text'}`). Strings nested in code (ternaries, call arguments)
 * are out of scope for now — extend the walk before widening the promise.
 */

import { globSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')

/** One hardcoded UI text with its source position. */
export interface ClientI18nViolation {
  /** Repository-relative file path with `/` separators. */
  file: string
  /** 1-based line. */
  line: number
  /** The offending literal, truncated for display. */
  text: string
}

const LITERAL_ATTRIBUTES = new Set(['aria-label', 'aria-description', 'placeholder', 'title', 'alt'])

/** True when a literal carries actual prose (letters), not punctuation or digits. */
function isTextual(value: string): boolean {
  return /[\p{L}]/u.test(value)
}

/**
 * Scan one client `.tsx` source for hardcoded UI texts.
 * @param source - file content.
 * @param file - repository-relative path used in violations.
 * @returns every violation, in source order.
 */
export function scanClientSource(source: string, file: string): ClientI18nViolation[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const violations: ClientI18nViolation[] = []
  const report = (node: ts.Node, text: string): void => {
    const position = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    violations.push({ file, line: position.line + 1, text })
  }
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const text = node.getText(sf).trim()
      if (isTextual(text)) report(node, text)
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf)
      if (LITERAL_ATTRIBUTES.has(name) && node.initializer !== undefined && ts.isStringLiteral(node.initializer)) {
        if (isTextual(node.initializer.text)) report(node.initializer, node.initializer.text)
      }
    } else if (ts.isJsxExpression(node) && node.expression !== undefined && ts.isStringLiteral(node.expression)) {
      if (isTextual(node.expression.text)) report(node.expression, node.expression.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return violations
}

function main(): void {
  const files = globSync('packages/client/**/src/client/**/*.tsx', { cwd: root })
    .filter(file => !/(?:\.spec|\.test)\.tsx$/.test(file))
    .map(file => file.split(sep).join('/'))
    .sort()
  const errors: string[] = []
  for (const file of files) {
    for (const violation of scanClientSource(readFileSync(resolve(root, file), 'utf8'), file)) {
      errors.push(`${violation.file}:${violation.line}: hardcoded UI text ${JSON.stringify(violation.text.slice(0, 80))}`)
    }
  }
  if (errors.length > 0) {
    console.error(`verify-client-i18n: ${errors.length} hardcoded UI text(s) across ${files.length} file(s):`)
    for (const error of errors.slice(0, 200)) console.error(`  ${error}`)
    if (errors.length > 200) console.error(`  …and ${errors.length - 200} more`)
    process.exit(1)
  }
  console.log(`verify-client-i18n: ${files.length} client source file(s) carry no hardcoded UI text.`)
}

if (import.meta.url === `file:///${process.argv[1]?.split(sep).join('/')}`) {
  main()
}
