/**
 * Pure parity checks for reviewed French documentation sources.
 *
 * French pages are independent editorial sources, but their Markdown frame
 * and technical literals remain exact projections of the English source.
 */

import type { Nodes } from 'mdast'
import {
  languageSwitcherTargets,
  parseTranslationMarkdown,
  translationStructureDiff,
  translationStructureSignature,
} from './translation-pairing.ts'

/** Collect inline-code values in document order. */
function inlineCodeValues(tree: Nodes): string[] {
  const values: string[] = []
  const visit = (node: Nodes): void => {
    if (node.type === 'inlineCode') values.push(node.value)
    if ('children' in node) for (const child of node.children) visit(child)
  }
  visit(tree)
  return values
}

/** Render one short Markdown literal for a diagnostic. */
function show(value: string | undefined): string {
  if (value === undefined) return 'nothing'
  const rendered = JSON.stringify(value)
  return rendered.length > 72 ? `${rendered.slice(0, 72)}…` : rendered
}

/** Return the first inline-code difference between two documents. */
function inlineCodeDiff(source: Nodes, french: Nodes): string[] {
  const sourceValues = inlineCodeValues(source)
  const frenchValues = inlineCodeValues(french)
  const length = Math.max(sourceValues.length, frenchValues.length)
  for (let index = 0; index < length; index++) {
    if (sourceValues[index] !== frenchValues[index]) {
      return [`inline code #${index + 1} diverges between the pair: ${show(sourceValues[index])} vs ${show(frenchValues[index])}`]
    }
  }
  return []
}

/**
 * Compare one reviewed French source with its English owner.
 *
 * @param sourceMarkdown - English source text.
 * @param frenchMarkdown - Reviewed French source text.
 * @param chineseSource - Repository path of the English page's Chinese sibling.
 * @returns Structural and inline-code differences; empty means parity.
 */
export function frenchDocumentationDiff(
  sourceMarkdown: string,
  frenchMarkdown: string,
  chineseSource: string,
): string[] {
  const sourceTree = parseTranslationMarkdown(sourceMarkdown)
  const frenchTree = parseTranslationMarkdown(frenchMarkdown)
  return [
    ...translationStructureDiff(
      translationStructureSignature(sourceTree, languageSwitcherTargets(chineseSource)),
      translationStructureSignature(frenchTree, []),
    ),
    ...inlineCodeDiff(sourceTree, frenchTree),
  ]
}
