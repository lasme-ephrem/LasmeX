// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type {
  ConversationSnapshot, SessionListState, SessionProjectionMap,
} from 'lasmex-client-runtime/client'
import type {} from 'lasmex-session-mission/client'
import type {} from 'lasmex-session-stats/client'
import type { TranslateNS } from 'lasmex-client-ui-slots'
import { MissionView } from '../src/client/MissionView.tsx'
import { fr } from '../src/client/locales.ts'

afterEach(cleanup)

const translate = ((key: keyof typeof fr, params?: Record<string, unknown>): string => {
  let value: string = fr[key]
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replaceAll(`{${name}}`, String(replacement))
  }
  return value
}) as TranslateNS<'mission'>

function snapshot(overrides: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    running: false,
    pending: [],
    queue: [],
    removed: false,
    openState: 'open',
    hasMore: false,
    loadingOlder: false,
    nodes: [{ kind: 'reasoning', text: 'SECRET_REASONING' }],
    partial: { text: 'SECRET_CHUNK' },
    openError: { message: 'SECRET_HEADER' },
    lastAgentError: 'SECRET_MESSAGE',
    ...overrides,
  } as unknown as ConversationSnapshot
}

function props(
  projections: Partial<SessionProjectionMap>,
  session = snapshot(),
  loadOlder = vi.fn(async () => false),
  sessions = {
    ids: [],
    byId: {},
    current: 'mission-session',
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  } as unknown as SessionListState,
  openChild = vi.fn(),
): ComponentProps<typeof MissionView> {
  return {
    sessionId: 'mission-session',
    useSession: <Selected,>(selector: (value: ConversationSnapshot) => Selected): Selected => selector(session),
    useProjection: ((key: keyof SessionProjectionMap, selector?: (value: unknown) => unknown) => {
      const value = projections[key]
      return selector === undefined ? value : selector(value)
    }),
    useSessions: (selector: (state: SessionListState) => unknown) => selector(sessions),
    useWorkspaces: vi.fn(),
    loadOlder,
    openChild,
    t: translate,
  } as unknown as ComponentProps<typeof MissionView>
}

const completeProjections = {
  goal: {
    goal: {
      id: 'goal' as never,
      revision: 2,
      objective: 'Livrer une application vérifiée',
      phase: 'active' as const,
      maxGoalRounds: 12,
    },
    roundsStarted: 3,
    createdAt: 1,
    updatedAt: 2,
  },
  plan: { active: true, pending: false },
  permissions: {
    currentValue: 'workspace-write',
    options: [{ value: 'workspace-write', name: 'Workspace write' }],
  },
  todos: [
    { content: 'Implémenter Mission', status: 'completed' as const },
    { content: 'Lancer les validations', status: 'in_progress' as const },
  ],
  sessionStats: {
    turns: 7,
    steps: 9,
    llmMs: 2_500,
    toolMs: 800,
    ttftMs: 400,
    ttftSteps: 2,
    decodeMs: 2_000,
    decodeTokens: 100,
  },
  tokenUsage: {
    uncachedInputTokens: 100,
    outputTokens: 80,
    cacheReadTokens: 20,
    cacheWriteTokens: 5,
  },
  missionActivity: {
    capabilities: [{
      name: 'fs_read', started: 4, settled: 4, failed: 0, running: 0, lastUsedAt: 3,
    }],
    validations: [{
      seq: 10,
      toolName: 'bash',
      command: 'pnpm test --filter mission',
      status: 'passed' as const,
      startedAt: 4,
      completedAt: 5,
      durationMs: 1_200,
    }],
    approvals: { asked: 2, allowed: 1, rejected: 1, cancelled: 0, unavailable: 0 },
    checklist: {
      todos: [{ content: 'Projection fallback', status: 'pending' as const }],
      updatedAt: 6,
    },
    lastOutcome: null,
  },
} satisfies Partial<SessionProjectionMap>

describe('MissionView', () => {
  it('renders every projection in French without reading transcript payload fields', () => {
    render(<MissionView {...props(completeProjections)} />)

    expect(screen.getByRole('heading', { name: 'Tableau de mission' })).toBeTruthy()
    expect(screen.getByText('Livrer une application vérifiée')).toBeTruthy()
    expect(screen.getByText('Mode plan actif')).toBeTruthy()
    expect(screen.getByText('Écriture dans l’espace de travail')).toBeTruthy()
    expect(screen.getByText('1 sur 2 terminées')).toBeTruthy()
    expect(screen.getByText('fs_read')).toBeTruthy()
    expect(screen.getByText('pnpm test --filter mission')).toBeTruthy()
    expect(screen.getByText('125')).toBeTruthy()
    expect(screen.getByText('50.0 tok/s')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Prête')

    const text = document.body.textContent ?? ''
    expect(text).not.toContain('SECRET_REASONING')
    expect(text).not.toContain('SECRET_CHUNK')
    expect(text).not.toContain('SECRET_HEADER')
    expect(text).not.toContain('SECRET_MESSAGE')
    expect(text).not.toContain('Projection fallback')
  })

  it('keeps absent capabilities neutral instead of inventing zero values', () => {
    render(<MissionView {...props({})} />)
    expect(screen.getAllByText('Donnée indisponible dans cette configuration.').length).toBeGreaterThan(5)
    expect(screen.getByRole('status').textContent).toContain('Prête')
    expect(screen.queryByText('Aucune capacité utilisée.')).toBeNull()
  })

  it('distinguishes present empty values from capability absence', () => {
    render(<MissionView {...props({
      goal: null,
      plan: { active: false, pending: true },
      permissions: { currentValue: 'read-only', options: [] },
      todos: null,
      missionActivity: {
        capabilities: [], validations: [],
        approvals: { asked: 0, allowed: 0, rejected: 0, cancelled: 0, unavailable: 0 },
        checklist: null, lastOutcome: null,
      },
    })} />)
    expect(screen.getByText('Aucun objectif défini.')).toBeTruthy()
    expect(screen.getByText('Mode plan inactif · Changement en attente')).toBeTruthy()
    expect(screen.getByText('Lecture seule')).toBeTruthy()
    expect(screen.getByText('Aucune liste de travail enregistrée.')).toBeTruthy()
    expect(screen.getByText('Aucune capacité utilisée.')).toBeTruthy()
    expect(screen.getByText('Aucune validation enregistrée.')).toBeTruthy()
    expect(screen.getByText('Aucune issue nécessitant une attention.')).toBeTruthy()
  })

  it('prioritizes unavailable, synchronization, human action, running, queue, and attention states', () => {
    const cases: [Partial<ConversationSnapshot>, string][] = [
      [{ removed: true }, 'Indisponible'],
      [{ openState: 'loading' }, 'Synchronisation'],
      [{ pending: [{}] as never }, 'Action requise'],
      [{ running: true }, 'En cours'],
      [{ queue: [{}] as never }, 'En file'],
    ]
    for (const [session, expected] of cases) {
      const view = render(<MissionView {...props(completeProjections, snapshot(session))} />)
      expect(screen.getByRole('status').textContent).toContain(expected)
      view.unmount()
    }
    render(<MissionView {...props({
      ...completeProjections,
      missionActivity: {
        ...completeProjections.missionActivity,
        lastOutcome: { kind: 'error', time: 20, code: 'provider-error', message: 'SECRET_OUTCOME' },
      },
    })} />)
    expect(screen.getByRole('status').textContent).toContain('À vérifier')
    expect(screen.getByText('provider-error')).toBeTruthy()
    expect(document.body.textContent).not.toContain('SECRET_OUTCOME')
  })

  it('loads earlier history from the accessible paging control', () => {
    const loadOlder = vi.fn(async () => false)
    render(<MissionView {...props(completeProjections, snapshot({ hasMore: true }), loadOlder)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Charger l’historique antérieur' }))
    expect(loadOlder).toHaveBeenCalledOnce()
  })

  it('renders exposed child and background-task metadata and opens a healthy child', () => {
    const openChild = vi.fn()
    const sessions = {
      ids: [],
      byId: {
        'child-1': {
          id: 'child-1', displayTitle: 'Agent documentation', parentId: 'mission-session',
          origin: 'subagent', running: true, blank: false, updatedAt: 10,
        },
      },
      current: 'mission-session',
      phase: 'ready',
      subagentsByParent: {
        'mission-session': {
          entries: [{
            kind: 'child', id: 'child-1', activity: 'running', hasChildren: false,
            mode: 'continuable', label: 'Documentation',
          }],
          parentAvailable: true,
          state: 'ready',
          error: null,
        },
      },
      jobsBySession: {
        'mission-session': [{
          id: 'bash-4', kind: 'bash', label: 'pnpm test', status: 'running', startedAt: 20,
        }],
      },
      currentAddress: undefined,
    } as unknown as SessionListState
    render(<MissionView {...props(
      completeProjections, snapshot(), vi.fn(async () => false), sessions, openChild,
    )} />)

    expect(screen.getByText('Documentation')).toBeTruthy()
    expect(screen.getByText('child-1')).toBeTruthy()
    expect(screen.getByText('Poursuivable')).toBeTruthy()
    expect(screen.getByText('pnpm test')).toBeTruthy()
    expect(screen.getByText('bash-4')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir l’agent enfant child-1' }))
    expect(openChild).toHaveBeenCalledWith({
      parentSessionId: 'mission-session', childSessionId: 'child-1', mode: 'continuable',
    })
  })

  it('keeps an empty orchestration state neutral', () => {
    render(<MissionView {...props(completeProjections)} />)
    expect(screen.getByText('Aucun agent enfant signalé.')).toBeTruthy()
    expect(screen.getByText('Aucune tâche d’arrière-plan signalée.')).toBeTruthy()
  })

  it('maps every published goal, outcome, validation, and completion state', () => {
    const phases = [
      ['paused', 'En pause'], ['blocked', 'Bloqué'], ['complete', 'Terminé'],
    ] as const
    for (const [phase, label] of phases) {
      const view = render(<MissionView {...props({
        ...completeProjections,
        goal: { ...completeProjections.goal, goal: { ...completeProjections.goal.goal, phase } },
      })} />)
      expect(screen.getByText(label)).toBeTruthy()
      view.unmount()
    }

    const outcomes = [
      ['blocked', 'Bloquée'], ['max-tokens', 'Limite de tokens'],
      ['interrupted', 'Interrompue'], ['aborted', 'Annulée'],
    ] as const
    for (const [kind, label] of outcomes) {
      const view = render(<MissionView {...props({
        ...completeProjections,
        missionActivity: {
          ...completeProjections.missionActivity,
          lastOutcome: { kind, time: 30, message: 'not rendered' },
        },
      })} />)
      expect(screen.getByText(label)).toBeTruthy()
      view.unmount()
    }

    render(<MissionView {...props({
      ...completeProjections,
      missionActivity: {
        ...completeProjections.missionActivity,
        validations: [
          { seq: 21, toolName: 'bash', command: 'failed check', status: 'failed', startedAt: 1 },
          { seq: 22, toolName: 'bash', command: 'running check', status: 'running', startedAt: 2, durationMs: 61_000 },
          { seq: 23, toolName: 'bash', command: 'interrupted check', status: 'interrupted', startedAt: 3, durationMs: 5 },
        ],
      },
    })} />)
    expect(screen.getByText('Échouée')).toBeTruthy()
    expect(screen.getAllByText('En cours').length).toBeGreaterThan(0)
    expect(screen.getByText('Interrompue')).toBeTruthy()
    expect(screen.getByText('bash · Durée 1 min 1 s')).toBeTruthy()
    expect(screen.getByText('bash', { exact: true })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('À vérifier')
  })

  it('completes from the checklist and uses the projected checklist fallback', () => {
    const view = render(<MissionView {...props({
      ...completeProjections,
      goal: { ...completeProjections.goal, goal: { ...completeProjections.goal.goal, phase: 'active' } },
      todos: [{ content: 'Tout est livré', status: 'completed' }],
    })} />)
    expect(screen.getByRole('status').textContent).toContain('Terminée')
    view.unmount()

    const { todos: _todos, ...withoutTodos } = completeProjections
    render(<MissionView {...props({
      ...withoutTodos,
      missionActivity: {
        ...completeProjections.missionActivity,
        checklist: {
          todos: [{ content: 'Liste projetée', status: 'pending' }], updatedAt: 50,
        },
      },
    })} />)
    expect(screen.getByText('Liste projetée')).toBeTruthy()
  })

  it('renders catalog diagnostics, summary-only children, and every job lifecycle verbatim', () => {
    const sessions = {
      ids: [],
      byId: {
        'catalog-summary': {
          id: 'catalog-summary', displayTitle: 'Titre du résumé', parentId: 'mission-session',
          origin: 'subagent', running: false, blank: false, updatedAt: 1,
        },
        'summary-running': {
          id: 'summary-running', displayTitle: 'Résumé actif', parentId: 'mission-session',
          origin: 'subagent', running: true, blank: false, updatedAt: 2,
        },
        'summary-inactive': {
          id: 'summary-inactive', displayTitle: 'Résumé inactif', parentId: 'mission-session',
          origin: 'subagent', running: false, blank: false, updatedAt: 3,
        },
      },
      current: 'mission-session',
      phase: 'ready',
      subagentsByParent: {
        'mission-session': {
          entries: [
            { kind: 'child', id: 'catalog-summary', activity: 'inactive', hasChildren: false, mode: 'one-shot' },
            { kind: 'child', id: 'catalog-unnamed', activity: 'inactive', hasChildren: false, mode: 'one-shot' },
            { kind: 'diagnostic', id: 'diagnostic-corrupt', reason: 'corrupt' },
            { kind: 'diagnostic', id: 'diagnostic-unsupported', reason: 'unsupported' },
            { kind: 'diagnostic', id: 'diagnostic-unavailable', reason: 'unavailable' },
          ],
          parentAvailable: false,
          state: 'ready',
          error: null,
        },
      },
      jobsBySession: {
        'mission-session': [
          { id: 'job-stopping', kind: 'bash', label: 'Stopping job', status: 'stopping', startedAt: 1 },
          { id: 'job-completed', kind: 'bash', label: 'Completed job', status: 'completed', startedAt: 2, finishedAt: 3 },
          { id: 'job-killed', kind: 'bash', label: 'Killed job', status: 'killed', startedAt: 4, finishedAt: 5 },
          { id: 'job-failed', kind: 'bash', label: 'Failed job', status: 'failed', detail: 'exit code: 2', startedAt: 6, finishedAt: 7 },
        ],
      },
      currentAddress: undefined,
    } as unknown as SessionListState
    render(<MissionView {...props(
      completeProjections, snapshot(), vi.fn(async () => false), sessions,
    )} />)

    expect(screen.getByText('Titre du résumé')).toBeTruthy()
    expect(screen.getByText('Agent enfant sans libellé')).toBeTruthy()
    expect(screen.getByText('Résumé actif')).toBeTruthy()
    expect(screen.getByText('Résumé inactif')).toBeTruthy()
    expect(screen.getByText('Données persistées corrompues')).toBeTruthy()
    expect(screen.getByText('Format persistant non pris en charge')).toBeTruthy()
    expect(screen.getByText('Session enfant indisponible')).toBeTruthy()
    expect(screen.getByText('Arrêt en cours')).toBeTruthy()
    expect(screen.getAllByText('Terminée').length).toBeGreaterThan(1)
    expect(screen.getByText('Arrêtée')).toBeTruthy()
    expect(screen.getByText('Échouée')).toBeTruthy()
    expect(screen.getByText('exit code: 2')).toBeTruthy()
  })

  it('distinguishes loading and failed child catalogs', () => {
    for (const [state, label] of [
      ['loading', 'Chargement des agents enfants…'],
      ['error', 'Catalogue des agents enfants indisponible.'],
    ] as const) {
      const sessions = {
        ids: [], byId: {}, current: 'mission-session', phase: 'ready', jobsBySession: {},
        subagentsByParent: {
          'mission-session': {
            entries: [], parentAvailable: false, state,
            error: state === 'error' ? { code: 'catalog-error', message: 'not rendered' } : null,
          },
        },
        currentAddress: undefined,
      } as unknown as SessionListState
      const view = render(<MissionView {...props(
        completeProjections, snapshot(), vi.fn(async () => false), sessions,
      )} />)
      expect(screen.getByText(label)).toBeTruthy()
      view.unmount()
    }
  })

  it('renders configured and raw permission names and the loading paging label', () => {
    const configured = render(<MissionView {...props({
      ...completeProjections,
      permissions: {
        currentValue: 'team-policy', options: [{ value: 'team-policy', name: 'Politique équipe' }],
      },
    })} />)
    expect(screen.getByText('Politique équipe')).toBeTruthy()
    configured.unmount()

    const raw = render(<MissionView {...props({
      ...completeProjections,
      permissions: { currentValue: 'raw-policy', options: [] },
    }, snapshot({ hasMore: true, loadingOlder: true }))} />)
    expect(screen.getByText('raw-policy')).toBeTruthy()
    expect(screen.getByRole('button', {
      name: 'Chargement de l’historique antérieur…',
    }).hasAttribute('disabled')).toBe(true)
    raw.unmount()

    render(<MissionView {...props(completeProjections, snapshot({ openState: 'error' }))} />)
    expect(screen.getByRole('status').textContent).toContain('Indisponible')
  })
})
