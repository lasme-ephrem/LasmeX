#!/usr/bin/env node

import fs from 'node:fs'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import config from './config.json' with { type: 'json' }

const API_VERSION = '2026-03-10'
const BODY_LIMIT = 50
const AUDIT_MARKER = '<!-- lasmex-issue-policy -->'
const OWNER_LINE = /^Owner: @([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)$/
const ISSUE_TYPE_LABELS = new Map([
  ['type/idea', 'Idea'],
  ['type/feature', 'Feature'],
  ['type/bug', 'Bug'],
  ['type/research', 'Research'],
  ['type/task', 'Task'],
])
const STATUS_LABELS = new Map([
  ['status/inbox', 'Inbox'],
  ['status/backlog', 'Backlog'],
  ['status/ready', 'Ready'],
  ['status/in-progress', 'In progress'],
  ['status/in-review', 'In review'],
  ['status/done', 'Done'],
  ['status/no-action', 'No action'],
])
const STATUS_LABEL_BY_NAME = new Map(
  [...STATUS_LABELS].map(([label, status]) => [status, label]),
)
const PRIORITIES = ['p0', 'p1', 'p2', 'p3']
const PR_KINDS = new Set([
  'kind/feature',
  'kind/bug-fix',
  'kind/doc',
  'kind/testing',
  'kind/cleanup',
  'kind/dependency',
])
// Retired label aliases stay reserved so they cannot be recreated.
const LEGACY_LABELS = new Set([
  'kind/bug',
  'kind/documentation',
  'feature',
  'bug-fix',
  'doc',
  'cleanup',
  'testing',
  'dependencies',
  'ci',
  'cli',
  'llm',
  'web-search',
])
const TERMINAL_STATUSES = new Set(['Done', 'No action'])
const ACTIVE_STATUS_ORDER = config.statuses.filter((status) => !TERMINAL_STATUSES.has(status))
const IMPLEMENTATION_PULL_REQUEST_ACTIONS = new Set([
  'opened',
  'edited',
  'synchronize',
  'reopened',
  'labeled',
  'unlabeled',
])

for (const status of ['In progress', 'In review']) {
  if (!ACTIVE_STATUS_ORDER.includes(status)) {
    throw new Error(`La configuration \`statuses\` ne contient pas le statut « ${status} »`)
  }
}
for (const status of config.statuses) {
  if (!STATUS_LABEL_BY_NAME.has(status)) throw new Error(`Statut non pris en charge : ${status}`)
}

/**
 * Return Markdown outside balanced details elements.
 * @param {string} body Markdown body.
 * @returns {{text: string, balanced: boolean, detailsCount: number, allCollapsed: boolean}} Visible source and details shape.
 */
export function extractOutsideDetails(body) {
  const source = body.replace(/<!--[\s\S]*?-->/g, '')
  const tag = /<\/?details\b[^>]*>/gi
  let depth = 0
  let cursor = 0
  let balanced = true
  let text = ''
  let detailsCount = 0
  let allCollapsed = true

  for (const match of source.matchAll(tag)) {
    const index = match.index ?? 0
    if (depth === 0) text += source.slice(cursor, index)
    if (/^<\//.test(match[0])) {
      if (depth === 0) balanced = false
      else depth -= 1
    } else {
      depth += 1
      detailsCount += 1
      if (/\sopen(?:\s|=|>)/i.test(match[0])) allCollapsed = false
    }
    cursor = index + match[0].length
  }

  if (depth === 0) text += source.slice(cursor)
  if (depth !== 0) balanced = false
  return { text, balanced, detailsCount, allCollapsed }
}

/**
 * Count Chinese characters and contiguous Latin, numeric, or code tokens.
 * @param {string} body Markdown body.
 * @returns {{units: number, balanced: boolean, detailsCount: number, allCollapsed: boolean}} Visible unit count and details shape.
 */
export function countVisibleUnits(body) {
  const outside = extractOutsideDetails(body)
  const visible = outside.text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/<((?:https?:\/\/|mailto:)[^>]+)>/gi, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:[A-Za-z]+|#\d+|#x[0-9A-Fa-f]+);/g, ' ')
    .replace(/[\u0060*~\[\]{}()<>#!|]/g, ' ')
  const han = visible.match(/\p{Script=Han}/gu)?.length ?? 0
  const tokens = visible.match(/[\p{Script=Latin}\p{Number}_./:@+-]+/gu)?.length ?? 0
  return {
    units: han + tokens,
    balanced: outside.balanced,
    detailsCount: outside.detailsCount,
    allCollapsed: outside.allCollapsed,
  }
}

function firstNonblankLine(body) {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
}

/**
 * Validate required body sections and check Owner against assignees.
 * @param {{body: string, assignees: string[], allowUnassignedOwner?: boolean}} input Body input.
 * @returns {string[]} Validation errors.
 */
export function validateBody({
  body,
  assignees,
  allowUnassignedOwner = config.allowUnassignedOwner ?? false,
}) {
  const errors = []
  const count = countVisibleUnits(body)
  const owner = firstNonblankLine(body)?.match(OWNER_LINE)?.[1] ?? null
  const normalized = [...new Set(assignees.map((login) => login.toLowerCase()))]

  if (!count.balanced) errors.push('Les balises `<details>` doivent être correctement fermées')
  if (count.detailsCount === 0) {
    errors.push('La description doit contenir une section `<details>` repliée par défaut')
  }
  if (!count.allCollapsed) {
    errors.push('Les sections `<details>` ne doivent pas utiliser l’attribut `open`')
  }
  if (count.units > BODY_LIMIT) {
    errors.push(
      `La partie visible de la description contient ${count.units} unités ; la limite est de ${BODY_LIMIT}`,
    )
  }
  if (normalized.length >= 2 && !owner) {
    errors.push('Avec plusieurs responsables, la première ligne doit être `Owner: @login`')
  } else if (normalized.length >= 2 && !normalized.includes(owner.toLowerCase())) {
    errors.push('Le compte indiqué par `Owner` doit faire partie des responsables')
  } else if (
    normalized.length < 2 &&
    owner &&
    !(normalized.length === 0 && allowUnassignedOwner)
  ) {
    errors.push('La ligne `Owner` est interdite avec zéro ou un seul responsable')
  }
  return errors
}

/**
 * Decide whether the human-review policy applies to a PR.
 * @param {{isDraft: boolean, authorType: string, reviewRequestCount: number, reviewCount: number}} input PR state.
 * @returns {boolean} Whether the PR policy is mandatory.
 */
export function requiresPullRequestPolicy({
  isDraft,
  authorType,
  reviewRequestCount,
  reviewCount,
}) {
  const automated = authorType === 'Bot' || authorType === 'App'
  return !isDraft && !automated && (reviewRequestCount > 0 || reviewCount > 0)
}

/**
 * Translate a repository event into one resolving-Issue lifecycle command.
 * @param {string} eventName GitHub event name.
 * @param {{action?: string, review?: {state?: string}}} event GitHub event payload.
 * @returns {'implementation'|'review-requested'|'changes-requested'|null} Lifecycle command.
 */
export function resolvingIssueStatusCommand(eventName, event) {
  if (eventName === 'pull_request' || eventName === 'pull_request_target') {
    if (event.action === 'review_requested') return 'review-requested'
    return IMPLEMENTATION_PULL_REQUEST_ACTIONS.has(event.action) ? 'implementation' : null
  }
  if (
    eventName === 'pull_request_review' &&
    event.action === 'submitted' &&
    event.review?.state?.toLowerCase() === 'changes_requested'
  ) {
    return 'changes-requested'
  }
  return null
}

/**
 * Plan one event-directed resolving-Issue status transition.
 * @param {string|null} currentStatus Current label-derived status.
 * @param {'implementation'|'review-requested'|'changes-requested'} command Lifecycle command.
 * @returns {string|null} Status to write, or null when no permitted transition exists.
 */
export function nextResolvingIssueStatus(currentStatus, command) {
  let target
  if (command === 'review-requested') target = 'In review'
  else if (command === 'implementation' || command === 'changes-requested') target = 'In progress'
  else throw new Error(`Commande de cycle de vie inconnue : ${command}`)

  const currentIndex = ACTIVE_STATUS_ORDER.indexOf(currentStatus)
  const targetIndex = ACTIVE_STATUS_ORDER.indexOf(target)
  if (command === 'changes-requested' && currentStatus === 'In review') return target
  return currentIndex >= 0 && currentIndex < targetIndex ? target : null
}

function stripIgnoredMarkdown(body) {
  const lines = body
    .replace(/<!--[\s\S]*?-->/g, '')
    // HTML links are not same-repository references: their anchor text (for
    // example Dependabot's `<a href=".../issues/5199">#5199</a>`) must not be
    // parsed as a bare `#5199` reference to this repository.
    .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '')
    .split(/\r?\n/)
  const kept = []
  let fence = null
  for (const line of lines) {
    const marker = line.match(/^\s*([\u0060~]{3,})/)
    if (marker) {
      if (fence === null) fence = marker[1][0]
      else if (marker[1][0] === fence) fence = null
      continue
    }
    if (fence === null) kept.push(line)
  }
  return kept.join('\n').replace(/\u0060[^\u0060]*\u0060/g, ' ')
}

/**
 * Parse same-repository resolving and informational references.
 * @param {{body: string, repository: string}} input PR body and repository.
 * @returns {{all: number[], resolving: number[], related: number[]}} References.
 */
export function parseReferences({ body, repository }) {
  const source = stripIgnoredMarkdown(body)
  const expected = repository.toLowerCase()
  const all = new Set()
  const resolving = new Set()
  const reference =
    /(?:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#|#)(\d+)|https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/issues\/(\d+)/gi
  const closing =
    /\b(?:close(?:s|d)?|fix(?:es|ed)?|resolve(?:s|d)?)\s*:?\s+(?:(?:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#|#)(\d+)|https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/issues\/(\d+))/gi

  for (const match of source.matchAll(reference)) {
    const explicit = (match[1] ?? match[3] ?? '').toLowerCase()
    const number = Number(match[2] ?? match[4])
    if (!explicit || explicit === expected) all.add(number)
  }
  for (const match of source.matchAll(closing)) {
    const explicit = (match[1] ?? match[3] ?? '').toLowerCase()
    const number = Number(match[2] ?? match[4])
    if (!explicit || explicit === expected) {
      all.add(number)
      resolving.add(number)
    }
  }
  return {
    all: [...all].sort((left, right) => left - right),
    resolving: [...resolving].sort((left, right) => left - right),
    related: [...all].filter((number) => !resolving.has(number)).sort((a, b) => a - b),
  }
}

/**
 * Retain only references that resolve to Issues rather than pull requests.
 * @param {{all: number[], resolving: number[], related: number[]}} references Parsed references.
 * @param {Map<number, unknown>} issues Resolved same-repository Issues.
 * @returns {{all: number[], resolving: number[], related: number[]}} Issue-only references.
 */
export function retainIssueReferences(references, issues) {
  return {
    all: references.all.filter((number) => issues.has(number)),
    resolving: references.resolving.filter((number) => issues.has(number)),
    related: references.related.filter((number) => issues.has(number)),
  }
}

/**
 * Derive repository-native Issue metadata from labels.
 * @param {string[]} labels Exact repository label names.
 * @returns {{type: string|null, priority: string|null, status: string|null, errors: string[]}} Metadata and taxonomy errors.
 */
export function issueMetadataFromLabels(labels) {
  const typeLabels = labels.filter((label) => label.startsWith('type/'))
  const statusLabels = labels.filter((label) => label.startsWith('status/'))
  const priorityLabels = labels.filter((label) => PRIORITIES.includes(label))
  const errors = []
  const knownTypes = typeLabels.filter((label) => ISSUE_TYPE_LABELS.has(label))
  const knownStatuses = statusLabels.filter((label) => STATUS_LABELS.has(label))
  const unknownTypes = typeLabels.filter((label) => !ISSUE_TYPE_LABELS.has(label))
  const unknownStatuses = statusLabels.filter((label) => !STATUS_LABELS.has(label))

  if (knownTypes.length !== 1) {
    errors.push(
      `L’issue doit porter exactement un label \`type/*\` reconnu ; nombre actuel : ${knownTypes.length}`,
    )
  }
  if (unknownTypes.length > 0) {
    errors.push(`Types d’issue non pris en charge : ${unknownTypes.join(', ')}`)
  }
  if (knownStatuses.length !== 1) {
    errors.push(
      `L’issue doit porter exactement un label \`status/*\` reconnu ; nombre actuel : ${knownStatuses.length}`,
    )
  }
  if (unknownStatuses.length > 0) {
    errors.push(`Statut non pris en charge : ${unknownStatuses.join(', ')}`)
  }
  if (priorityLabels.length > 1) {
    errors.push(
      `L’issue doit porter au plus un label de priorité (\`p0\` à \`p3\`) ; nombre actuel : ${priorityLabels.length}`,
    )
  }

  return {
    type: knownTypes.length === 1 ? ISSUE_TYPE_LABELS.get(knownTypes[0]) : null,
    priority: priorityLabels.length === 1 ? priorityLabels[0] : null,
    status: knownStatuses.length === 1 ? STATUS_LABELS.get(knownStatuses[0]) : null,
    errors,
  }
}

/**
 * Validate one Issue with its label-derived status.
 * @param {{title: string, body: string, assignees: string[], labels: string[], type?: string|null, priority?: string|null, status?: string|null, metadataErrors?: string[], state: string, stateReason: string|null}} issue Issue snapshot.
 * @returns {string[]} Validation errors.
 */
export function validateIssue(issue) {
  const metadata = issue.metadataErrors
    ? {
        type: issue.type ?? null,
        priority: issue.priority ?? null,
        status: issue.status ?? null,
        errors: issue.metadataErrors,
      }
    : issueMetadataFromLabels(issue.labels)
  const errors = [...validateBody(issue), ...metadata.errors]
  const status = metadata.status
  const invalidLabels = issue.labels.filter(
    (label) => label.startsWith('kind/') || LEGACY_LABELS.has(label),
  )

  if (invalidLabels.length > 0) {
    errors.push(
      `L’issue ne doit utiliser ni label \`kind/*\` réservé aux PR ni ancien label : ${invalidLabels.join(', ')}`,
    )
  }
  if (
    /^\s*(?:\[(?:Idea|Feature|Bug|Research|Task|P[0-3]|Inbox|Backlog|Ready|In progress|In review|Done|No action|Owner|area\/[^\]]+)[^\]]*\]|(?:Idea|Feature|Bug|Research|Task|P[0-3]|Inbox|Backlog|Ready|In progress|In review|Done|No action|Owner|area\/[^:： ]+)\s*[:：-])/iu.test(
      issue.title,
    )
  ) {
    errors.push(
      'Le titre ne doit pas commencer par un préfixe `Type`, `Priority`, `Status`, `area` ou `Owner`',
    )
  }
  if (status === 'Done' && (issue.state !== 'closed' || issue.stateReason !== 'completed')) {
    errors.push('Le label `status/done` exige une issue fermée avec le motif `Completed`')
  }
  if (
    status === 'No action' &&
    (issue.state !== 'closed' || issue.stateReason !== 'not_planned')
  ) {
    errors.push('Le label `status/no-action` exige une issue fermée avec le motif `Not planned`')
  }
  if (!['Done', 'No action'].includes(status ?? '') && issue.state !== 'open') {
    errors.push('Seuls les statuts `Done` et `No action` permettent de fermer une issue')
  }
  return errors
}

/**
 * Validate PR metadata and its referenced Issues.
 * @param {{authorType: string, labels: string[], references: ReturnType<typeof parseReferences>, issues: Map<number, {priority: string|null}>}} input PR snapshot.
 * @returns {string[]} Validation errors.
 */
export function validatePullRequest(input) {
  if (!requiresPullRequestPolicy(input)) return []
  const errors = []
  const kinds = input.labels.filter((label) => PR_KINDS.has(label))
  const unknownKinds = input.labels.filter(
    (label) => label.startsWith('kind/') && !PR_KINDS.has(label) && !LEGACY_LABELS.has(label),
  )
  const legacyLabels = input.labels.filter((label) => LEGACY_LABELS.has(label))
  const issueOnlyLabels = input.labels.filter(
    (label) =>
      label.startsWith('source/') || label.startsWith('type/') || label.startsWith('status/'),
  )
  const priorities = input.labels.filter((label) => PRIORITIES.includes(label))
  const areas = input.labels.filter((label) => label.startsWith('area/'))

  if (input.references.all.length === 0) {
    errors.push('La description de la PR doit référencer au moins une issue du dépôt')
  }
  if (kinds.length !== 1) {
    errors.push(
      `La PR doit porter exactement un label \`kind/*\` reconnu ; nombre actuel : ${kinds.length}`,
    )
  }
  if (unknownKinds.length > 0) {
    errors.push(`La PR contient des labels \`kind/*\` non pris en charge : ${unknownKinds.join(', ')}`)
  }
  if (legacyLabels.length > 0) {
    errors.push(`La PR contient d’anciens labels : ${legacyLabels.join(', ')}`)
  }
  if (issueOnlyLabels.length > 0) {
    errors.push(`La PR contient des labels réservés aux issues : ${issueOnlyLabels.join(', ')}`)
  }
  if (priorities.length > 1) {
    errors.push(
      `La PR doit porter au plus un label de priorité (\`p0\` à \`p3\`) ; nombre actuel : ${priorities.length}`,
    )
  }
  if (areas.length === 0) errors.push('La PR doit porter au moins un label `area/*`')
  for (const number of input.references.all) {
    if (!input.issues.has(number)) errors.push(`#${number} n’est pas une issue du dépôt`)
  }

  const resolving = input.references.resolving
    .map((number) => [number, input.issues.get(number)])
    .filter((entry) => entry[1])
  if (resolving.length === 0) return errors

  const issuePriorities = resolving
    .map(([, issue]) => issue.priority?.toLowerCase())
    .filter((priority) => PRIORITIES.includes(priority))
  if (priorities.length === 0 && issuePriorities.length > 0) {
    const highest = issuePriorities.sort(
      (left, right) => PRIORITIES.indexOf(left) - PRIORITIES.indexOf(right),
    )[0]
    errors.push(`La priorité de la PR doit être \`${highest}\``)
  } else if (priorities.length === 1 && issuePriorities.length !== resolving.length) {
    errors.push('Une PR priorisée exige que chaque issue résolue ait une priorité')
  } else if (priorities.length === 1) {
    const highest = issuePriorities.sort(
      (left, right) => PRIORITIES.indexOf(left) - PRIORITIES.indexOf(right),
    )[0]
    if (priorities[0] !== highest) errors.push(`La priorité de la PR doit être \`${highest}\``)
  }
  return errors
}

function token() {
  const value = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (!value) {
    throw new Error('Définissez la variable d’environnement `GH_TOKEN` ou `GITHUB_TOKEN`')
  }
  return value
}

async function api(path, options = {}) {
  const response = await fetch(`${process.env.GITHUB_API_URL ?? 'https://api.github.com'}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token()}`,
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'lasmex-issue-policy',
      ...options.headers,
    },
  })
  if (options.allow404 && response.status === 404) return null
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${options.method ?? 'GET'} ${path}: ${response.status} ${body}`)
  }
  if (response.status === 204) return null
  return response.json()
}

async function issueSnapshot(number) {
  const issue = await api(`/repos/${config.owner}/${config.repository}/issues/${number}`)
  if (issue.pull_request) return null
  const labels = issue.labels.map((label) => label.name)
  const metadata = issueMetadataFromLabels(labels)
  return {
    number,
    title: issue.title,
    body: issue.body ?? '',
    assignees: issue.assignees.map((assignee) => assignee.login),
    labels,
    type: metadata.type,
    priority: metadata.priority,
    status: metadata.status,
    metadataErrors: metadata.errors,
    state: issue.state,
    stateReason: issue.state_reason ?? null,
  }
}

async function setStatus(number, status) {
  const target = STATUS_LABEL_BY_NAME.get(status)
  if (!target) throw new Error(`Statut non pris en charge : ${status}`)
  const issue = await issueSnapshot(number)
  if (!issue) throw new Error(`#${number} n’est pas une issue`)
  const current = issue.labels.filter((label) => label.startsWith('status/'))
  if (current.length === 1 && current[0] === target) return

  if (!current.includes(target)) {
    await api(`/repos/${config.owner}/${config.repository}/issues/${number}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels: [target] }),
      headers: { 'Content-Type': 'application/json' },
    })
  }
  for (const label of current) {
    if (label === target) continue
    await api(
      `/repos/${config.owner}/${config.repository}/issues/${number}/labels/${encodeURIComponent(label)}`,
      { method: 'DELETE', allow404: true },
    )
  }
}

async function upsertAudit(number, errors) {
  const comments = await api(
    `/repos/${config.owner}/${config.repository}/issues/${number}/comments?per_page=100`,
  )
  const existing = comments.find(
    (comment) => comment.user?.type === 'Bot' && comment.body?.includes(AUDIT_MARKER),
  )
  if (errors.length === 0) {
    if (existing) {
      await api(`/repos/${config.owner}/${config.repository}/issues/comments/${existing.id}`, {
        method: 'DELETE',
      })
    }
    return
  }
  const body = `${AUDIT_MARKER}\n⚠️ La politique des issues n’est pas respectée :\n\n${errors.map((error) => `- ${error}`).join('\n')}`
  if (existing) {
    if (existing.body === body) return
    await api(`/repos/${config.owner}/${config.repository}/issues/comments/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
      headers: { 'Content-Type': 'application/json' },
    })
  } else {
    await api(`/repos/${config.owner}/${config.repository}/issues/${number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function auditIssue(number, extraErrors = []) {
  const issue = await issueSnapshot(number)
  if (!issue) return []
  const errors = [...extraErrors, ...validateIssue(issue)]
  await upsertAudit(number, errors)
  return errors
}

async function resolvingReferencesSnapshot(number, pull) {
  const references = parseReferences({
    body: pull.body ?? '',
    repository: `${config.owner}/${config.repository}`,
  })
  const issues = new Map()
  for (const issueNumber of references.all) {
    const issue = await issueSnapshot(issueNumber)
    if (issue) issues.set(issueNumber, issue)
  }
  return {
    number,
    references: retainIssueReferences(references, issues),
    issues,
  }
}

async function pullRequestSnapshot(number) {
  const [pull, reviewRequests, reviews] = await Promise.all([
    api(`/repos/${config.owner}/${config.repository}/pulls/${number}`),
    api(`/repos/${config.owner}/${config.repository}/pulls/${number}/requested_reviewers`),
    api(`/repos/${config.owner}/${config.repository}/pulls/${number}/reviews?per_page=100`),
  ])
  const resolving = await resolvingReferencesSnapshot(number, pull)
  return {
    ...resolving,
    isDraft: pull.draft,
    authorType: pull.user?.type ?? 'User',
    reviewRequestCount: reviewRequests.users.length + reviewRequests.teams.length,
    reviewCount: reviews.length,
    labels: pull.labels.map((label) => label.name),
  }
}

async function lifecyclePullRequestSnapshot(number) {
  const pull = await api(`/repos/${config.owner}/${config.repository}/pulls/${number}`)
  return resolvingReferencesSnapshot(number, pull)
}

async function transitionResolvingIssues(pull, command) {
  for (const number of pull.references.resolving) {
    const issue = pull.issues.get(number)
    const target = nextResolvingIssueStatus(issue?.status ?? null, command)
    if (!target) continue
    await setStatus(number, target)
    await auditIssue(number)
  }
}

async function runPullRequestCheck(event) {
  const pull = await pullRequestSnapshot(event.pull_request.number)
  const errors = validatePullRequest(pull)
  if (errors.length > 0) {
    for (const error of errors) process.stdout.write(`::error::${error}\n`)
    throw new Error(
      `La PR enfreint la politique des issues. Erreurs détectées : ${errors.length}`,
    )
  }
  process.stdout.write(
    requiresPullRequestPolicy(pull)
      ? 'La politique des issues est respectée.\n'
      : 'La politique des issues ne s’applique pas à cette PR dans son état actuel.\n',
  )
}

/**
 * Apply one repository event to label-backed Issue lifecycle state.
 * @param {string} eventName GitHub event name.
 * @param {{action?: string, issue?: {number: number, state_reason?: string}, pull_request?: {number: number}, review?: {state?: string}}} event GitHub webhook payload at the trusted workflow boundary.
 * @returns {Promise<void>} Resolves after status and audit effects settle.
 */
export async function runLifecycle(eventName, event) {
  if (eventName === 'issues') {
    const number = event.issue.number
    if (event.action === 'opened') await setStatus(number, 'Inbox')
    if (event.action === 'closed') {
      const target = event.issue.state_reason === 'not_planned' ? 'No action' : 'Done'
      await setStatus(number, target)
    }
    if (event.action === 'reopened') {
      await setStatus(number, 'Inbox')
    }
    await auditIssue(number)
    return
  }

  if (
    eventName === 'pull_request' ||
    eventName === 'pull_request_target' ||
    eventName === 'pull_request_review'
  ) {
    const command = resolvingIssueStatusCommand(eventName, event)
    if (!command) return
    const pull = await lifecyclePullRequestSnapshot(event.pull_request.number)
    await transitionResolvingIssues(pull, command)
  }
}

function readEvent() {
  if (!process.env.GITHUB_EVENT_PATH) {
    throw new Error('La variable d’environnement `GITHUB_EVENT_PATH` n’est pas définie')
  }
  return JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
}

async function main(argv) {
  const [command] = argv
  if (command === 'pr') await runPullRequestCheck(readEvent())
  else if (command === 'lifecycle') await runLifecycle(process.env.GITHUB_EVENT_NAME, readEvent())
  else throw new Error('Utilisation : policy.mjs pr|lifecycle')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
