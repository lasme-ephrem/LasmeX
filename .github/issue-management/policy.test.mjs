import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import test from 'node:test'

import {
  countVisibleUnits,
  issueMetadataFromLabels,
  nextResolvingIssueStatus,
  parseReferences,
  retainIssueReferences,
  resolvingIssueStatusCommand,
  requiresPullRequestPolicy,
  runLifecycle,
  validateBody,
  validateIssue,
  validatePullRequest,
} from './policy.mjs'

const withDetails = (summary) =>
  `${summary}\n\n<details><summary>Validation et détails</summary>À compléter.</details>`

const statusLabels = new Map([
  ['Inbox', 'status/inbox'],
  ['Backlog', 'status/backlog'],
  ['Ready', 'status/ready'],
  ['In progress', 'status/in-progress'],
  ['In review', 'status/in-review'],
  ['Done', 'status/done'],
  ['No action', 'status/no-action'],
])
const withStatus = (issue, status) => ({
  ...issue,
  labels: [
    ...issue.labels.filter((label) => !label.startsWith('status/')),
    statusLabels.get(status),
  ],
})

const legalIssue = {
  title: 'Valider la gestion des issues',
  body: withDetails('Valider la gestion des issues.'),
  assignees: [],
  labels: ['type/idea', 'status/in-review'],
  state: 'open',
  stateReason: null,
}

const canonicalKinds = [
  'kind/feature',
  'kind/bug-fix',
  'kind/doc',
  'kind/testing',
  'kind/cleanup',
  'kind/dependency',
]

// Keep an independent oracle rather than importing the implementation's reserved set.
const legacyLabels = [
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
]

const reviewedPull = (labels) => ({
  isDraft: false,
  authorType: 'User',
  reviewRequestCount: 1,
  reviewCount: 0,
  labels,
  references: { all: [2], resolving: [], related: [2] },
  issues: new Map([[2, { priority: null }]]),
})

test('counts only text outside details', () => {
  assert.deepEqual(countVisibleUnits('Gérer le projet GitHub.<details>Texte masqué</details>'), {
    units: 4,
    balanced: true,
    detailsCount: 1,
    allCollapsed: true,
  })
})

test('requires a balanced default-collapsed details region', () => {
  assert.deepEqual(validateBody({ body: 'Terminer le travail.', assignees: [] }), [
    'La description doit contenir une section `<details>` repliée par défaut',
  ])
  assert.deepEqual(
    validateBody({
      body: 'Terminer le travail.\n\n<details open><summary>Détails</summary>À compléter.</details>',
      assignees: [],
    }),
    ['Les sections `<details>` ne doivent pas utiliser l’attribut `open`'],
  )
  assert.deepEqual(
    validateBody({ body: 'Terminer le travail.\n\n<details><summary>Détails</summary>', assignees: [] }),
    ['Les balises `<details>` doivent être correctement fermées'],
  )
})

test('requires Owner for multiple assignees', () => {
  assert.deepEqual(
    validateBody({
      body: withDetails('Terminer le travail.'),
      assignees: ['tianyicui', 'tianyicui-bot'],
    }),
    ['Avec plusieurs responsables, la première ligne doit être `Owner: @login`'],
  )
})

test('accepts an intended Owner while assignment permission is pending', () => {
  assert.deepEqual(
    validateBody({
      body: withDetails('Owner: @octocat\n\nTerminer le travail.'),
      assignees: [],
    }),
    [],
  )
  assert.deepEqual(
    validateBody({
      body: withDetails('Owner: @octocat\n\nTerminer le travail.'),
      assignees: ['hubot'],
    }),
    ['La ligne `Owner` est interdite avec zéro ou un seul responsable'],
  )
})

test('allows optional metadata in every open Status', () => {
  assert.deepEqual(validateIssue(legalIssue), [])
  for (const status of ['Inbox', 'Backlog', 'Ready', 'In progress', 'In review']) {
    assert.deepEqual(validateIssue(withStatus(legalIssue, status)), [])
  }
})

test('derives one type, status, and optional priority from repository labels', () => {
  assert.deepEqual(issueMetadataFromLabels(['type/bug', 'status/ready', 'p1', 'area/web']), {
    type: 'Bug',
    status: 'Ready',
    priority: 'p1',
    errors: [],
  })
  const errors = issueMetadataFromLabels([
    'type/bug',
    'type/task',
    'type/unknown',
    'status/ready',
    'status/inbox',
    'status/unknown',
    'p0',
    'p2',
  ]).errors
  assert.equal(errors.length, 5)
  assert.ok(errors.some((error) => error.includes('exactement un label `type/*`')))
  assert.ok(errors.some((error) => error.includes('Types d’issue non pris en charge')))
  assert.ok(errors.some((error) => error.includes('exactement un label `status/*`')))
  assert.ok(errors.some((error) => error.includes('Statut non pris en charge')))
  assert.ok(errors.some((error) => error.includes('au plus un label de priorité')))
})

test('rejects a missing label-derived type or status', () => {
  const errors = validateIssue({ ...legalIssue, labels: [] })
  assert.ok(errors.some((error) => error.includes('exactement un label `type/*`')))
  assert.ok(errors.some((error) => error.includes('exactement un label `status/*`')))
})

test('rejects metadata prefixes in an Issue title', () => {
  const errors = validateIssue({ ...legalIssue, title: '[Bug] Corriger la restauration' })
  assert.ok(
    errors.includes(
      'Le titre ne doit pas commencer par un préfixe `Type`, `Priority`, `Status`, `area` ou `Owner`',
    ),
  )
})

test('reserves PR kind and legacy labels for pull requests', () => {
  for (const label of [
    ...canonicalKinds,
    'kind/experimental',
    ...legacyLabels,
  ]) {
    assert.ok(
      validateIssue({ ...legalIssue, labels: [...legalIssue.labels, label] }).some((error) =>
        error.startsWith('L’issue ne doit utiliser ni label `kind/*` réservé aux PR ni ancien label :'),
      ),
      label,
    )
  }
  assert.deepEqual(
    validateIssue({ ...legalIssue, labels: [...legalIssue.labels, 'area/web', 'source/member'] }),
    [],
  )
})

test('keeps terminal Status aligned with the native close reason', () => {
  assert.deepEqual(
    validateIssue({ ...withStatus(legalIssue, 'Done'), state: 'closed', stateReason: 'completed' }),
    [],
  )
  assert.deepEqual(
    validateIssue({
      ...withStatus(legalIssue, 'No action'),
      state: 'closed',
      stateReason: 'not_planned',
    }),
    [],
  )
  assert.ok(
    validateIssue(withStatus(legalIssue, 'Done')).includes(
      'Le label `status/done` exige une issue fermée avec le motif `Completed`',
    ),
  )
})

test('separates resolving and informational references', () => {
  assert.deepEqual(
    parseReferences({
      body: 'Fixes #12\nRelated to #4\nRefs deepseekharness/dsh-test#7',
      repository: 'deepseekharness/dsh-test',
    }),
    { all: [4, 7, 12], resolving: [12], related: [4, 7] },
  )
})

test('does not treat pull request references as Issue associations', () => {
  const references = {
    all: [123, 1180, 1181],
    resolving: [123, 1180],
    related: [1181],
  }
  const issues = new Map([
    [1180, {}],
    [1181, {}],
  ])

  assert.deepEqual(retainIssueReferences(references, issues), {
    all: [1180, 1181],
    resolving: [1180],
    related: [1181],
  })
})

test('allows informational references without cross-object constraints', () => {
  const errors = validatePullRequest({
    isDraft: false,
    authorType: 'User',
    reviewRequestCount: 1,
    reviewCount: 0,
    labels: ['kind/cleanup', 'area/infra'],
    references: { all: [4], resolving: [], related: [4] },
    issues: new Map([[4, { type: 'Bug', priority: 'P0', labels: ['area/web'] }]]),
  })
  assert.deepEqual(errors, [])
})

test('enforces highest resolving Priority without Type or area synchronization', () => {
  const pull = {
    isDraft: false,
    authorType: 'User',
    reviewRequestCount: 0,
    reviewCount: 1,
    labels: ['kind/cleanup', 'p0', 'area/web'],
    references: { all: [2, 3], resolving: [2, 3], related: [] },
    issues: new Map([
      [2, { type: 'Feature', priority: 'P2', labels: ['area/web'] }],
      [3, { type: 'Bug', priority: 'P0', labels: ['area/session'] }],
    ]),
  }
  assert.deepEqual(validatePullRequest(pull), [])
  assert.ok(
    validatePullRequest({ ...pull, labels: ['kind/cleanup', 'p2', 'area/web'] }).includes(
      'La priorité de la PR doit être `p0`',
    ),
  )
})

test('requires policy only after a human PR enters review', () => {
  assert.equal(
    requiresPullRequestPolicy({
      isDraft: false,
      authorType: 'User',
      reviewRequestCount: 1,
      reviewCount: 0,
    }),
    true,
  )
  assert.equal(
    requiresPullRequestPolicy({
      isDraft: false,
      authorType: 'User',
      reviewRequestCount: 0,
      reviewCount: 0,
    }),
    false,
  )
})

test('maps only explicit review handoffs to review status commands', () => {
  assert.equal(
    resolvingIssueStatusCommand('pull_request_target', {
      action: 'review_requested',
    }),
    'review-requested',
  )
  assert.equal(
    resolvingIssueStatusCommand('pull_request_review', {
      action: 'submitted',
      review: { state: 'changes_requested' },
    }),
    'changes-requested',
  )
  for (const state of ['approved', 'commented']) {
    assert.equal(
      resolvingIssueStatusCommand('pull_request_review', {
        action: 'submitted',
        review: { state },
      }),
      null,
    )
  }
  assert.equal(
    resolvingIssueStatusCommand('pull_request_review', {
      action: 'dismissed',
      review: { state: 'changes_requested' },
    }),
    null,
  )
})

test('keeps ordinary pull request events as forward-only implementation signals', () => {
  for (const action of ['opened', 'edited', 'synchronize', 'reopened', 'labeled', 'unlabeled']) {
    assert.equal(resolvingIssueStatusCommand('pull_request_target', { action }), 'implementation')
  }
  assert.equal(
    resolvingIssueStatusCommand('pull_request_target', { action: 'review_request_removed' }),
    null,
  )
})

test('toggles automation-owned work on request changes and repeated review request', () => {
  for (const status of ['Inbox', 'Backlog', 'Ready']) {
    assert.equal(nextResolvingIssueStatus(status, 'implementation'), 'In progress')
    assert.equal(nextResolvingIssueStatus(status, 'review-requested'), 'In review')
    assert.equal(nextResolvingIssueStatus(status, 'changes-requested'), 'In progress')
  }
  let status = nextResolvingIssueStatus('In review', 'changes-requested')
  assert.equal(status, 'In progress')
  status = nextResolvingIssueStatus(status, 'review-requested')
  assert.equal(status, 'In review')
})

test('preserves later implementation status and terminal Issues', () => {
  assert.equal(nextResolvingIssueStatus('In progress', 'implementation'), null)
  assert.equal(nextResolvingIssueStatus('In review', 'implementation'), null)
  assert.equal(nextResolvingIssueStatus('In review', 'review-requested'), null)
  assert.equal(nextResolvingIssueStatus('In review', 'changes-requested'), 'In progress')
  assert.equal(nextResolvingIssueStatus('Done', 'review-requested'), null)
  assert.equal(nextResolvingIssueStatus('No action', 'changes-requested'), null)
  assert.equal(nextResolvingIssueStatus(null, 'review-requested'), null)
})

test('keeps lifecycle projection independent of PR metadata enforcement', () => {
  const pull = {
    isDraft: false,
    authorType: 'User',
    reviewRequestCount: 1,
    reviewCount: 0,
    labels: [],
    references: { all: [2], resolving: [2], related: [] },
    issues: new Map([[2, { priority: null }]]),
  }

  assert.ok(validatePullRequest(pull).length > 0)
  assert.equal(nextResolvingIssueStatus('Inbox', 'review-requested'), 'In review')
})

test('exempts Draft, Bot, and App PRs', () => {
  const invalid = {
    isDraft: false,
    labels: [],
    references: { all: [], resolving: [], related: [] },
    issues: new Map(),
    reviewRequestCount: 1,
    reviewCount: 0,
  }
  assert.deepEqual(validatePullRequest({ ...invalid, authorType: 'Bot' }), [])
  assert.deepEqual(validatePullRequest({ ...invalid, authorType: 'App' }), [])
  assert.deepEqual(validatePullRequest({ ...invalid, authorType: 'User', isDraft: true }), [])
  assert.ok(validatePullRequest({ ...invalid, authorType: 'User' }).length > 0)
})

test('requires repository PR labels in the enforcement scope', () => {
  const errors = validatePullRequest({
    isDraft: false,
    authorType: 'User',
    reviewRequestCount: 1,
    reviewCount: 0,
    labels: [],
    references: { all: [2], resolving: [], related: [2] },
    issues: new Map([[2, { priority: null }]]),
  })
  assert.ok(errors.includes('La PR doit porter exactement un label `kind/*` reconnu ; nombre actuel : 0'))
  assert.ok(errors.includes('La PR doit porter au moins un label `area/*`'))
})

test('accepts exactly the canonical kinds with extensible areas', () => {
  for (const kind of canonicalKinds) {
    assert.deepEqual(validatePullRequest(reviewedPull([kind, 'area/future-domain'])), [], kind)
  }
})

test('rejects multiple, unknown, legacy, and Issue-only PR labels', () => {
  assert.ok(
    validatePullRequest(
      reviewedPull(['kind/feature', 'kind/doc', 'area/web']),
    ).includes('La PR doit porter exactement un label `kind/*` reconnu ; nombre actuel : 2'),
  )
  assert.ok(
    validatePullRequest(reviewedPull(['kind/experimental', 'area/web'])).includes(
      'La PR contient des labels `kind/*` non pris en charge : kind/experimental',
    ),
  )
  for (const label of legacyLabels) {
    assert.ok(
      validatePullRequest(reviewedPull(['kind/feature', 'area/web', label])).some((error) =>
        error.startsWith('La PR contient d’anciens labels :'),
      ),
      label,
    )
  }
  assert.ok(
    validatePullRequest(
      reviewedPull([
        'kind/feature',
        'area/web',
        'source/internal-pr',
        'type/feature',
        'status/ready',
      ]),
    ).includes(
      'La PR contient des labels réservés aux issues : source/internal-pr, type/feature, status/ready',
    ),
  )
})

test('allows missing Priority only when resolving Issues are also unprioritized', () => {
  const pull = {
    isDraft: false,
    authorType: 'User',
    reviewRequestCount: 1,
    reviewCount: 0,
    labels: ['kind/feature', 'area/web'],
    references: { all: [2], resolving: [2], related: [] },
    issues: new Map([[2, { priority: null }]]),
  }
  assert.deepEqual(validatePullRequest(pull), [])
  assert.ok(
    validatePullRequest({ ...pull, issues: new Map([[2, { priority: 'P2' }]]) }).includes(
      'La priorité de la PR doit être `p2`',
    ),
  )
  assert.ok(
    validatePullRequest({ ...pull, labels: [...pull.labels, 'p2'] }).includes(
      'Une PR priorisée exige que chaque issue résolue ait une priorité',
    ),
  )
})

test('moves a resolving Issue through repository label endpoints with GITHUB_TOKEN', async () => {
  const issue = {
    number: 42,
    title: 'Corriger la reprise de session',
    body: withDetails('Corriger la reprise de session.'),
    assignees: [],
    labels: ['type/bug', 'status/in-review', 'area/session'],
    state: 'open',
    state_reason: null,
  }
  const requests = []
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    requests.push(`${request.method} ${url.pathname}`)
    response.setHeader('content-type', 'application/json')

    if (request.method === 'GET' && url.pathname.endsWith('/pulls/9')) {
      response.end(JSON.stringify({ body: 'Fixes #42' }))
      return
    }
    if (request.method === 'GET' && url.pathname.endsWith('/issues/42')) {
      response.end(
        JSON.stringify({
          ...issue,
          labels: issue.labels.map((name) => ({ name })),
        }),
      )
      return
    }
    if (request.method === 'POST' && url.pathname.endsWith('/issues/42/labels')) {
      let body = ''
      for await (const chunk of request) body += chunk
      for (const label of JSON.parse(body).labels) {
        if (!issue.labels.includes(label)) issue.labels.push(label)
      }
      response.end(JSON.stringify(issue.labels.map((name) => ({ name }))))
      return
    }
    if (request.method === 'DELETE' && url.pathname.includes('/issues/42/labels/')) {
      const label = decodeURIComponent(url.pathname.split('/labels/')[1])
      issue.labels = issue.labels.filter((candidate) => candidate !== label)
      response.statusCode = 204
      response.end()
      return
    }
    if (request.method === 'GET' && url.pathname.endsWith('/issues/42/comments')) {
      response.end('[]')
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ message: 'Not Found' }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Mock server has no TCP port')
  const oldApiUrl = process.env.GITHUB_API_URL
  const oldToken = process.env.GITHUB_TOKEN
  process.env.GITHUB_API_URL = `http://127.0.0.1:${address.port}`
  process.env.GITHUB_TOKEN = 'test-token'

  try {
    await runLifecycle('pull_request_review', {
      action: 'submitted',
      review: { state: 'changes_requested' },
      pull_request: { number: 9 },
    })
    assert.deepEqual(issue.labels, ['type/bug', 'area/session', 'status/in-progress'])
    assert.ok(requests.includes('POST /repos/lasme-ephrem/LasmeX/issues/42/labels'))
    assert.ok(
      requests.includes(
        'DELETE /repos/lasme-ephrem/LasmeX/issues/42/labels/status%2Fin-review',
      ),
    )
    assert.ok(requests.includes('GET /repos/lasme-ephrem/LasmeX/issues/42/comments'))
  } finally {
    if (oldApiUrl === undefined) delete process.env.GITHUB_API_URL
    else process.env.GITHUB_API_URL = oldApiUrl
    if (oldToken === undefined) delete process.env.GITHUB_TOKEN
    else process.env.GITHUB_TOKEN = oldToken
    server.close()
    await once(server, 'close')
  }
})
