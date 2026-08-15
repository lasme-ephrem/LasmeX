/**
 * Verify every reviewed French website source against its English source.
 *
 * The website manifest is the review allowlist. The gate rejects unpublished
 * French files, missing English sources, changed Markdown structure, changed links,
 * changed fenced code, and changed inline technical literals.
 */

import { existsSync, globSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { docsPages } from '../website/docs.ts'
import { frenchDocumentationDiff } from './french-docs.ts'

const root = resolve(import.meta.dirname, '..')
const reviewed = docsPages.filter(page => page.locale === 'root' && page.contentLocale === 'fr-FR')
const reviewedSources = new Set(reviewed.map(page => page.source))
const discoveredSources = globSync('docs/**/*.fr.md', { cwd: root })
  .map(file => file.split(sep).join('/'))
  .sort()
const errors: string[] = []

for (const source of discoveredSources) {
  if (!reviewedSources.has(source)) {
    errors.push(`${source}: French source is not published as reviewed French content in website/docs.ts`)
  }
}

for (const page of reviewed) {
  const french = page.source
  if (!french.endsWith('.fr.md')) {
    errors.push(`${french}: reviewed French content must use a .fr.md source`)
    continue
  }
  const source = french.replace(/\.fr\.md$/, '.md')
  const chinese = french.replace(/\.fr\.md$/, '.zh.md')
  if (!page.sourceAliases?.includes(source)) {
    errors.push(`${french}: website projection does not identify ${source} as its English source alias`)
  }
  for (const file of [source, french]) {
    if (!existsSync(resolve(root, file))) errors.push(`${french}: missing parity source ${file}`)
  }
  if (!existsSync(resolve(root, source)) || !existsSync(resolve(root, french))) continue
  for (const divergence of frenchDocumentationDiff(
    readFileSync(resolve(root, source), 'utf8'),
    readFileSync(resolve(root, french), 'utf8'),
    chinese,
  )) {
    errors.push(`${source} ↔ ${french}: ${divergence}`)
  }
}

if (errors.length > 0) {
  console.error('verify-french-docs: reviewed French documentation parity failed:')
  for (const error of errors) console.error(`  ${error}`)
  process.exit(1)
}

console.log(`verify-french-docs: ${reviewed.length} reviewed French source(s) preserve structure, links, fenced code, and inline code.`)
