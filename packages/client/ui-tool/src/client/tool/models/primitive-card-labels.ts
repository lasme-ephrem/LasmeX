import type {
  DiffBlockLabels,
  ReadBlockLabels,
  SearchBlockLabels,
  WebBlockLabels,
} from 'lasmex-client-ui-primitives'
import type { TranslateNS } from 'lasmex-client-ui-slots'
import type { ToolRowVariant } from './tool-call-model.ts'

type ConversationTranslate = TranslateNS<'conversation'>

/**
 * Resolve the localized title shown by a tool row.
 * @param t - Conversation locale seat.
 * @param toolName - Wire tool name.
 * @param variant - Generic presentation family.
 * @returns Localized product title, or a stable technical tool name.
 */
export function toolRowTitle(
  t: ConversationTranslate,
  toolName: string,
  variant: ToolRowVariant,
): string {
  switch (toolName) {
    case 'grep': return 'Grep'
    case 'glob': return 'Glob'
    case 'pwsh': return 'Pwsh'
    case 'web_search': return t('tool.search')
    case 'web_fetch': return t('tool.fetch')
    case 'cordis_package_inspect':
    case 'cordis_runtime_inspect': return t('tool.inspect')
    case 'cordis_run': return t('tool.cordisRun')
    case 'cordis_stop': return t('tool.cordisStop')
    case 'cordis_undefine': return t('tool.cordisRemove')
  }
  switch (variant) {
    case 'search': return t('tool.search')
    case 'read': return t('tool.read')
    case 'bash': return 'Bash'
    case 'write': return t('tool.write')
    case 'edit': return t('tool.edit')
    case 'code': return t('tool.code')
    case 'others': return t('tool.call')
  }
}

function fileCount(t: ConversationTranslate, files: number): string {
  return t(files === 1 ? 'card.file.one' : 'card.file.many', { n: files })
}

/**
 * Build localized labels for the structured diff card.
 * @param t - Conversation locale seat.
 * @returns Diff labels.
 */
export function diffBlockLabels(t: ConversationTranslate): DiffBlockLabels {
  return {
    copy: t('copy'),
    copied: t('copied'),
    collapseAria: t('card.diff.collapseAria'),
    expandAria: n => t('card.diff.expandAria', { n }),
    collapse: t('card.collapse'),
    expand: n => t('card.expandRest', { n }),
    fileCount: files => fileCount(t, files),
  }
}

/**
 * Build localized labels for the structured read card.
 * @param t - Conversation locale seat.
 * @returns Read labels.
 */
export function readBlockLabels(t: ConversationTranslate): ReadBlockLabels {
  return {
    showing: (shown, total) => t('card.read.showing', { shown, total }),
    copy: t('copy'),
    copied: t('copied'),
    collapseAria: t('card.read.collapseAria'),
    expandAria: n => t('card.read.expandAria', { n }),
    collapse: t('card.collapse'),
    expand: n => t('card.expandRest', { n }),
  }
}

/**
 * Build localized labels for the structured search card.
 * @param t - Conversation locale seat.
 * @returns Search labels.
 */
export function searchBlockLabels(t: ConversationTranslate): SearchBlockLabels {
  return {
    pathsSummary: (shown, total, truncated) => truncated
      ? t('card.search.pathsCapped', { shown, total })
      : t('card.search.paths', { shown }),
    matchesSummary: (shown, total, files, truncated) => truncated
      ? t('card.search.matchesCapped', { shown, total, files: fileCount(t, files) })
      : t('card.search.matches', { shown, files: fileCount(t, files) }),
    copy: t('copy'),
    copied: t('copied'),
    empty: t('card.search.empty'),
    collapseAria: t('card.search.collapseAria'),
    expandAria: n => t('card.search.expandAria', { n }),
    collapse: t('card.collapse'),
    expand: n => t('card.expandRest', { n }),
  }
}

/**
 * Build localized labels for the structured web card.
 * @param t - Conversation locale seat.
 * @returns Web labels.
 */
export function webBlockLabels(t: ConversationTranslate): WebBlockLabels {
  return {
    noResults: t('card.web.noResults'),
    sourcesTruncated: t('card.web.sourcesTruncated'),
    contentTruncated: t('card.web.contentTruncated'),
    markdown: {
      copyLabel: t('copy'),
      copiedLabel: t('copied'),
      footnotesLabel: t('markdown.footnotes'),
    },
  }
}
