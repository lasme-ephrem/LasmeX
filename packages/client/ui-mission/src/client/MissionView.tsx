/** French-first operational dashboard for one conversation session. */

import type { ReactNode } from 'react'
import type {
  JobView, SessionId, SessionSummary, SubagentAddress, SubagentCatalogSnapshot,
} from 'lasmex-client-runtime/client'
import type { ConvViewProps } from 'lasmex-client-ui-conversation/client'
import type { InjectFace, PropsLocale, TranslateNS } from 'lasmex-client-ui-slots'
import type { GoalProjection } from 'lasmex-goal/client'
import type { PermissionSelect } from 'lasmex-permission-presets/client'
import type {} from 'lasmex-plan-mode/client'
import type {
  MissionActivityProjection, MissionTurnOutcome, MissionValidationStatus,
} from 'lasmex-session-mission/client'
import type { SessionStatsProjection } from 'lasmex-session-stats/client'
import type { TokenUsageProjection } from 'lasmex-token-meter/client'
import type { TodoItem } from 'lasmex-tool-todo/client'
import type { MissionKey } from './locales.ts'
import css from './MissionView.module.css'

/** Session-bound paging callback not supplied by the conversation view slot. */
export interface MissionViewInjected {
  /**
   * Load one earlier history page.
   * @returns Whether the request reached the beginning of the history.
   */
  loadOlder: () => Promise<boolean>
  /** Open one healthy direct child through its catalog-derived address. */
  openChild: (address: SubagentAddress) => void
}

type CatalogDiagnostic = Extract<SubagentCatalogSnapshot['entries'][number], { kind: 'diagnostic' }>

type MissionStatus =
  | 'syncing'
  | 'inProgress'
  | 'awaiting'
  | 'queued'
  | 'ready'
  | 'complete'
  | 'attention'
  | 'unavailable'

interface StatusInput {
  removed: boolean
  openState: 'cold' | 'loading' | 'open' | 'error'
  running: boolean
  pendingCount: number
  queueCount: number
  goal: GoalProjection | null | undefined
  todos: readonly TodoItem[] | null | undefined
  mission: MissionActivityProjection | undefined
}

function missionStatus(input: StatusInput): MissionStatus {
  if (input.removed || input.openState === 'error') return 'unavailable'
  if (input.openState !== 'open') return 'syncing'
  if (input.pendingCount > 0) return 'awaiting'
  if (input.running) return 'inProgress'
  if (input.queueCount > 0) return 'queued'
  if (input.mission?.lastOutcome !== null && input.mission?.lastOutcome !== undefined) {
    return 'attention'
  }
  if (input.mission?.validations.some(validation => validation.status === 'failed')) {
    return 'attention'
  }
  if (input.goal?.goal.phase === 'complete') return 'complete'
  if (input.todos !== undefined && input.todos !== null
    && input.todos.length > 0 && input.todos.every(todo => todo.status === 'completed')) {
    return 'complete'
  }
  return 'ready'
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(1)} s`
  const minutes = Math.floor(milliseconds / 60_000)
  const seconds = Math.round((milliseconds % 60_000) / 1_000)
  return `${minutes} min ${seconds} s`
}

function phaseKey(phase: GoalProjection['goal']['phase']): MissionKey {
  switch (phase) {
    case 'active': return 'goal.phase.active'
    case 'paused': return 'goal.phase.paused'
    case 'blocked': return 'goal.phase.blocked'
    case 'complete': return 'goal.phase.complete'
  }
}

function outcomeKey(kind: MissionTurnOutcome['kind']): MissionKey {
  switch (kind) {
    case 'blocked': return 'outcome.blocked'
    case 'error': return 'outcome.error'
    case 'max-tokens': return 'outcome.max-tokens'
    case 'interrupted': return 'outcome.interrupted'
    case 'aborted': return 'outcome.aborted'
  }
}

function validationKey(status: MissionValidationStatus): MissionKey {
  switch (status) {
    case 'passed': return 'validation.passed'
    case 'failed': return 'validation.failed'
    case 'running': return 'validation.running'
    case 'interrupted': return 'validation.interrupted'
  }
}

function jobStatusKey(status: JobView['status']): MissionKey {
  switch (status) {
    case 'running': return 'job.status.running'
    case 'stopping': return 'job.status.stopping'
    case 'completed': return 'job.status.completed'
    case 'killed': return 'job.status.killed'
    case 'failed': return 'job.status.failed'
  }
}

function diagnosticKey(reason: CatalogDiagnostic['reason']): MissionKey {
  switch (reason) {
    case 'corrupt': return 'child.diagnostic.corrupt'
    case 'unsupported': return 'child.diagnostic.unsupported'
    case 'unavailable': return 'child.diagnostic.unavailable'
  }
}

function permissionName(value: PermissionSelect, t: TranslateNS<'mission'>): string {
  const known = [
    'read-only', 'workspace-write', 'danger-full-access', 'custom',
  ] as const
  const key = known.find(candidate => candidate === value.currentValue)
  if (key !== undefined) return t(`permission.${key}`)
  return value.options.find(option => option.value === value.currentValue)?.name ?? value.currentValue
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className={css.empty}>{children}</p>
}

function Card({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className={css.card} aria-labelledby={id}>
      <h2 id={id} className={css.cardTitle}>{title}</h2>
      {children}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={css.metric}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function GoalCard({ goal, t }: { goal: GoalProjection | null | undefined; t: TranslateNS<'mission'> }) {
  if (goal === undefined) return <EmptyState>{t('state.unavailable')}</EmptyState>
  if (goal === null) return <EmptyState>{t('state.noGoal')}</EmptyState>
  return (
    <>
      <p className={css.objectiveLabel}>{t('goal.objective')}</p>
      <p className={css.objective}>{goal.goal.objective}</p>
      <dl className={css.metrics}>
        <Metric label={t('goal.phase')} value={t(phaseKey(goal.goal.phase))} />
        <Metric label={t('goal.rounds')} value={goal.roundsStarted} />
        <Metric label={t('goal.limit')} value={goal.goal.maxGoalRounds} />
      </dl>
    </>
  )
}

function Checklist({ todos, t }: { todos: readonly TodoItem[] | null | undefined; t: TranslateNS<'mission'> }) {
  if (todos === undefined) return <EmptyState>{t('state.unavailable')}</EmptyState>
  if (todos === null || todos.length === 0) return <EmptyState>{t('state.noChecklist')}</EmptyState>
  const completed = todos.filter(todo => todo.status === 'completed').length
  return (
    <>
      <p className={css.progress}>{t('checklist.progress', { completed, total: todos.length })}</p>
      <ul className={css.list}>
        {todos.map(todo => (
          <li key={todo.content} className={css.todo} data-state={todo.status}>
            <span className={css.marker} aria-hidden="true" />
            <span>{todo.content}</span>
            <span className={css.stateLabel}>{t(`todo.${todo.status}`)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function Capabilities({ mission, t }: {
  mission: MissionActivityProjection | undefined
  t: TranslateNS<'mission'>
}) {
  if (mission === undefined) return <EmptyState>{t('state.unavailable')}</EmptyState>
  if (mission.capabilities.length === 0) return <EmptyState>{t('state.noCapabilities')}</EmptyState>
  return (
    <ul className={css.list}>
      {mission.capabilities.map(capability => (
        <li key={capability.name} className={css.capability}>
          <code>{capability.name}</code>
          <dl className={css.compactMetrics}>
            <Metric label={t('capability.started')} value={capability.started} />
            <Metric label={t('capability.settled')} value={capability.settled} />
            <Metric label={t('capability.failed')} value={capability.failed} />
            <Metric label={t('capability.running')} value={capability.running} />
          </dl>
        </li>
      ))}
    </ul>
  )
}

function Validations({ mission, t }: {
  mission: MissionActivityProjection | undefined
  t: TranslateNS<'mission'>
}) {
  if (mission === undefined) return <EmptyState>{t('state.unavailable')}</EmptyState>
  if (mission.validations.length === 0) return <EmptyState>{t('state.noValidations')}</EmptyState>
  return (
    <ol className={css.list}>
      {mission.validations.map(validation => (
        <li key={validation.seq} className={css.validation}>
          <div className={css.validationTop}>
            <code>{validation.command}</code>
            <span className={css.validationState} data-state={validation.status}>
              {t(validationKey(validation.status))}
            </span>
          </div>
          <span className={css.muted}>
            {validation.toolName}
            {validation.durationMs === undefined
              ? null
              : ` · ${t('validation.duration')} ${formatDuration(validation.durationMs)}`}
          </span>
        </li>
      ))}
    </ol>
  )
}

function Children({
  sessionId, catalog, summaries, openChild, t,
}: {
  sessionId: SessionId
  catalog: SubagentCatalogSnapshot | undefined
  summaries: Readonly<Record<SessionId, SessionSummary>>
  openChild: (address: SubagentAddress) => void
  t: TranslateNS<'mission'>
}) {
  const catalogChildren = catalog?.entries.filter(entry => entry.kind === 'child') ?? []
  const diagnostics = catalog?.entries.filter(entry => entry.kind === 'diagnostic') ?? []
  const catalogIds = new Set(catalogChildren.map(entry => entry.id))
  const summaryOnly = Object.values(summaries).filter(summary => (
    summary.parentId === sessionId && summary.origin === 'subagent' && !catalogIds.has(summary.id)
  ))
  if (catalogChildren.length === 0 && diagnostics.length === 0 && summaryOnly.length === 0) {
    if (catalog?.state === 'loading') return <EmptyState>{t('state.loadingChildren')}</EmptyState>
    if (catalog?.state === 'error') return <EmptyState>{t('state.childrenUnavailable')}</EmptyState>
    return <EmptyState>{t('state.noChildren')}</EmptyState>
  }
  return (
    <ul className={css.list}>
      {catalogChildren.map((entry) => {
        const summary = summaries[entry.id]
        return (
          <li key={entry.id} className={css.orchestrationRow}>
            <div className={css.orchestrationTop}>
              <div>
                <strong>{entry.label ?? summary?.displayTitle ?? t('child.unnamed')}</strong>
                <code>{entry.id}</code>
              </div>
              <button
                className={css.openButton}
                type="button"
                aria-label={t('child.openLabel', { id: entry.id })}
                onClick={() => { openChild({ parentSessionId: sessionId, childSessionId: entry.id, mode: entry.mode }) }}
              >
                {t('child.open')}
              </button>
            </div>
            <dl className={css.compactMetrics}>
              <Metric label={t('child.activity')} value={t(`child.activity.${entry.activity}`)} />
              <Metric label={t('child.mode')} value={t(`child.mode.${entry.mode}`)} />
            </dl>
          </li>
        )
      })}
      {summaryOnly.map(summary => (
        <li key={summary.id} className={css.orchestrationRow}>
          <div className={css.orchestrationIdentity}>
            <strong>{summary.displayTitle}</strong>
            <code>{summary.id}</code>
          </div>
          <dl className={css.compactMetrics}>
            <Metric label={t('child.activity')} value={t(summary.running ? 'child.activity.running' : 'child.activity.inactive')} />
          </dl>
        </li>
      ))}
      {diagnostics.map(entry => (
        <li key={entry.id} className={css.orchestrationRow}>
          <div className={css.orchestrationIdentity}>
            <strong>{t('child.diagnostic')}</strong>
            <code>{entry.id}</code>
          </div>
          <p className={css.muted}>{t(diagnosticKey(entry.reason))}</p>
        </li>
      ))}
    </ul>
  )
}

function Jobs({ jobs, t }: { jobs: readonly JobView[]; t: TranslateNS<'mission'> }) {
  if (jobs.length === 0) return <EmptyState>{t('state.noJobs')}</EmptyState>
  return (
    <ul className={css.list}>
      {jobs.map(job => (
        <li key={job.id} className={css.orchestrationRow}>
          <div className={css.orchestrationIdentity}>
            <strong>{job.label}</strong>
            <code>{job.id}</code>
          </div>
          <dl className={css.compactMetrics}>
            <Metric label={t('job.kind')} value={job.kind} />
            <Metric label={t('job.status')} value={t(jobStatusKey(job.status))} />
          </dl>
          {job.detail === undefined ? null : <p className={css.muted}>{job.detail}</p>}
        </li>
      ))}
    </ul>
  )
}

function OrchestrationCard({
  sessionId, catalog, summaries, jobs, openChild, t,
}: {
  sessionId: SessionId
  catalog: SubagentCatalogSnapshot | undefined
  summaries: Readonly<Record<SessionId, SessionSummary>>
  jobs: readonly JobView[]
  openChild: (address: SubagentAddress) => void
  t: TranslateNS<'mission'>
}) {
  return (
    <>
      <h3 className={css.subsectionTitle}>{t('orchestration.children')}</h3>
      <Children
        sessionId={sessionId}
        catalog={catalog}
        summaries={summaries}
        openChild={openChild}
        t={t}
      />
      <h3 className={css.subsectionTitle}>{t('orchestration.jobs')}</h3>
      <Jobs jobs={jobs} t={t} />
    </>
  )
}

function MissionMetrics({ stats, usage, t }: {
  stats: SessionStatsProjection | undefined
  usage: TokenUsageProjection | undefined
  t: TranslateNS<'mission'>
}) {
  const inputTokens = usage === undefined
    ? undefined
    : usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  const averageTtft = stats === undefined || stats.ttftSteps === 0
    ? undefined
    : stats.ttftMs / stats.ttftSteps
  const throughput = stats === undefined || stats.decodeMs === 0
    ? undefined
    : (stats.decodeTokens * 1_000 / stats.decodeMs).toFixed(1)
  return (
    <dl className={css.metrics}>
      <Metric label={t('metric.turns')} value={stats?.turns ?? t('state.unavailable')} />
      <Metric label={t('metric.steps')} value={stats?.steps ?? t('state.unavailable')} />
      <Metric label={t('metric.llm')} value={stats === undefined ? t('state.unavailable') : formatDuration(stats.llmMs)} />
      <Metric label={t('metric.tools')} value={stats === undefined ? t('state.unavailable') : formatDuration(stats.toolMs)} />
      <Metric label={t('metric.ttft')} value={averageTtft === undefined ? t('state.notRecorded') : formatDuration(averageTtft)} />
      <Metric label={t('metric.throughput')} value={throughput === undefined ? t('state.notRecorded') : t('unit.tokensPerSecond', { value: throughput })} />
      <Metric label={t('metric.inputTokens')} value={inputTokens ?? t('state.unavailable')} />
      <Metric label={t('metric.outputTokens')} value={usage?.outputTokens ?? t('state.unavailable')} />
      <Metric label={t('metric.cacheRead')} value={usage?.cacheReadTokens ?? t('state.unavailable')} />
    </dl>
  )
}

/**
 * Render one session's projection-backed Mission dashboard.
 * @param props - Framework session hooks, paging callback, and localized copy.
 * @returns Accessible dashboard content without transcript payloads.
 */
export function MissionView({
  sessionId, useSession, useProjection, useSessions, loadOlder, openChild, t,
}: ConvViewProps & InjectFace<MissionViewInjected> & PropsLocale<'mission'>) {
  const running = useSession(snapshot => snapshot.running)
  const pendingCount = useSession(snapshot => snapshot.pending.length)
  const queueCount = useSession(snapshot => snapshot.queue.length)
  const removed = useSession(snapshot => snapshot.removed)
  const openState = useSession(snapshot => snapshot.openState)
  const hasMore = useSession(snapshot => snapshot.hasMore)
  const loadingOlder = useSession(snapshot => snapshot.loadingOlder)
  const catalogs = useSessions(snapshot => snapshot.subagentsByParent)
  const summaries = useSessions(snapshot => snapshot.byId)
  const jobsBySession = useSessions(snapshot => snapshot.jobsBySession)

  const goal = useProjection('goal')
  const plan = useProjection('plan')
  const permissions = useProjection('permissions')
  const projectedTodos = useProjection('todos')
  const stats = useProjection('sessionStats')
  const usage = useProjection('tokenUsage')
  const mission = useProjection('missionActivity')
  const todos = projectedTodos === undefined ? mission?.checklist?.todos : projectedTodos
  const status = missionStatus({
    removed, openState, running, pendingCount, queueCount, goal, todos, mission,
  })

  return (
    <div className={css.root} role="region" aria-labelledby="mission-title">
      <div className={css.content}>
        <header className={css.hero}>
          <div>
            <h1 id="mission-title">{t('title')}</h1>
            <p>{t('subtitle')}</p>
          </div>
          <div className={css.status} data-state={status} role="status" aria-live="polite">
            <span>{t('status.label')}</span>
            <strong>{t(`status.${status}`)}</strong>
          </div>
        </header>

        <div className={css.grid}>
          <Card id="mission-goal" title={t('section.goal')}>
            <GoalCard goal={goal} t={t} />
          </Card>
          <Card id="mission-plan" title={t('section.plan')}>
            {plan === undefined
              ? <EmptyState>{t('state.unavailable')}</EmptyState>
              : <p className={css.primaryState}>{t(plan.active ? 'plan.active' : 'plan.inactive')}{plan.pending ? ` · ${t('plan.pending')}` : ''}</p>}
          </Card>
          <Card id="mission-permissions" title={t('section.permissions')}>
            {permissions === undefined
              ? <EmptyState>{t('state.unavailable')}</EmptyState>
              : <dl className={css.metrics}><Metric label={t('permissions.current')} value={permissionName(permissions, t)} /></dl>}
          </Card>
          <Card id="mission-checklist" title={t('section.checklist')}>
            <Checklist todos={todos} t={t} />
          </Card>
          <Card id="mission-capabilities" title={t('section.capabilities')}>
            <Capabilities mission={mission} t={t} />
          </Card>
          <Card id="mission-validations" title={t('section.validations')}>
            <Validations mission={mission} t={t} />
          </Card>
          <Card id="mission-approvals" title={t('section.approvals')}>
            {mission === undefined
              ? <EmptyState>{t('state.unavailable')}</EmptyState>
              : <dl className={css.metrics}>
                <Metric label={t('approval.asked')} value={mission.approvals.asked} />
                <Metric label={t('approval.allowed')} value={mission.approvals.allowed} />
                <Metric label={t('approval.rejected')} value={mission.approvals.rejected} />
                <Metric label={t('approval.cancelled')} value={mission.approvals.cancelled} />
                <Metric label={t('approval.unavailable')} value={mission.approvals.unavailable} />
              </dl>}
          </Card>
          <Card id="mission-outcome" title={t('section.outcome')}>
            {mission === undefined
              ? <EmptyState>{t('state.unavailable')}</EmptyState>
              : mission.lastOutcome === null
                ? <EmptyState>{t('state.noOutcome')}</EmptyState>
                : <dl className={css.metrics}>
                  <Metric label={t('section.outcome')} value={t(outcomeKey(mission.lastOutcome.kind))} />
                  {mission.lastOutcome.code === undefined ? null : <Metric label={t('outcome.code')} value={mission.lastOutcome.code} />}
                </dl>}
          </Card>
          <Card id="mission-live" title={t('section.live')}>
            <dl className={css.metrics}>
              <Metric label={t('live.agent')} value={t(running ? 'live.agent.running' : 'live.agent.idle')} />
              <Metric label={t('live.requests')} value={pendingCount} />
              <Metric label={t('live.queue')} value={queueCount} />
              <Metric label={t('live.history')} value={hasMore ? t('history.load') : t('history.complete')} />
            </dl>
            {hasMore
              ? <button className={css.loadButton} type="button" disabled={loadingOlder} onClick={() => { void loadOlder() }}>
                {loadingOlder ? t('history.loading') : t('history.load')}
              </button>
              : null}
          </Card>
          <Card id="mission-orchestration" title={t('section.orchestration')}>
            <OrchestrationCard
              sessionId={sessionId}
              catalog={catalogs[sessionId]}
              summaries={summaries}
              jobs={jobsBySession[sessionId] ?? []}
              openChild={openChild}
              t={t}
            />
          </Card>
          <Card id="mission-metrics" title={t('section.metrics')}>
            <MissionMetrics stats={stats} usage={usage} t={t} />
          </Card>
        </div>
      </div>
    </div>
  )
}
