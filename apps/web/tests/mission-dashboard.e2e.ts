// Keyless assembled Mission dashboard coverage. One generated cold session
// proves whole-log projection stability across pagination and reload, while
// its nested Code Mode events prove capability accounting and produce the
// stable accessibility golden. No assertion reads transcript payloads.
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  acknowledgeReloadConnectionLoss, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, seedSession, watchConsole, webSnapshotMode,
  type WebScaffold,
} from './scaffold.ts'
import { newFrenchPage, saveFailureShot } from './support.ts'

const MODE = webSnapshotMode()
const MISSION_EXPECTED = fileURLToPath(new URL('./snapshots/mission-dashboard/code-mode.expected.md', import.meta.url))
const PAGED_ID = 'mission-paged-web-e2e'
const PAGED_TURNS = 28

/**
 * Generate a closed session whose 56 surface messages exceed one history page.
 * @param cwd - Real scaffold workspace path serialized by JSON.stringify.
 * @returns Deterministic JSONL accepted by the real persistence seeder.
 */
function pagedSeed(cwd: string): string {
  const records: Record<string, unknown>[] = [{
    type: 'session', version: 0, id: '{{sessionId}}', createdAt: 1_784_974_100_000, cwd,
  }]
  let seq = 0
  let time = 1_784_974_100_000
  const event = (type: string, data: Record<string, unknown>, surfaceOp?: 'append'): void => {
    records.push({ type, seq: seq++, time: time++, data, ...(surfaceOp === undefined ? {} : { surfaceOp }) })
  }
  /* jscpd:ignore-start -- deterministic session-protocol fixture; the event vocabulary is intentionally literal. */
  for (let turn = 1; turn <= PAGED_TURNS; turn++) {
    event('turn/start', { turn })
    event('user/message', {
      content: [{ type: 'text', text: `mission-${turn}` }], source: { kind: 'user' },
    }, 'append')
    event('step/start', { turn, step: 1 })
    if (turn === PAGED_TURNS) {
      event('tool/code-dispatch-start', {
        rootCallId: 'code-root', parentCallId: 'code-root', subCallId: 'code-root:code:1',
        name: 'bash', arguments: { command: 'pnpm test' },
      })
      event('tool/code-dispatch', {
        rootCallId: 'code-root', parentCallId: 'code-root', subCallId: 'code-root:code:1',
        name: 'bash', arguments: { command: 'pnpm test' }, isError: false,
        content: [{ type: 'text', text: 'validation complete' }],
      })
      event('tool/code-dispatch-start', {
        rootCallId: 'code-root', parentCallId: 'code-root', subCallId: 'code-root:code:2',
        name: 'read', arguments: { file_path: 'private-source.ts' },
      })
      event('tool/code-dispatch', {
        rootCallId: 'code-root', parentCallId: 'code-root', subCallId: 'code-root:code:2',
        name: 'read', arguments: { file_path: 'private-source.ts' }, isError: true,
        content: [{ type: 'text', text: 'private tool result' }],
      })
    }
    event('assistant/message', {
      turn,
      step: 1,
      message: {
        id: `10000000-0000-4000-8000-${String(turn).padStart(12, '0')}`,
        role: 'assistant',
        content: [{ type: 'text', text: `settled-${turn}` }],
        source: { kind: 'model', provider: 'snapshot', model: 'snapshot-replier' },
      },
    }, 'append')
    event('step/end', { turn, step: 1 })
    event('turn/end', { turn, reason: { kind: 'completed' } })
  }
  /* jscpd:ignore-end */
  return `${records.map(record => JSON.stringify(record)).join('\n')}\n`
}

async function openSeededSession(page: Page): Promise<void> {
  const group = page.locator('[role="treeitem"]').first()
  await group.waitFor({ timeout: 15_000 })
  await group.click()
  const session = page.locator('[role="treeitem"]').nth(1)
  await session.waitFor({ timeout: 10_000 })
  await session.click()
  await expect.poll(() => page.getByText(`settled-${PAGED_TURNS}`, { exact: true }).count(), {
    timeout: 15_000,
  }).toBe(1)
}

async function openMission(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Mission' }).click()
  await page.getByRole('heading', { name: 'Tableau de mission' }).waitFor({ timeout: 10_000 })
}

describe('web e2e: Mission survives pagination and resume', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    if (MODE === 'record') throw new Error('mission-dashboard is a keyless assembled snapshot')
    scaffold = await launchWebScaffold()
    await seedSession(scaffold, pagedSeed(scaffold.workspaceCwd), PAGED_ID)
    browser = await chromium.launch()
    page = await newFrenchPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('keeps whole-log totals while paging and after a browser reload', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-mission-paged-resume'))
    await openSeededSession(page)
    expect(await page.getByText('mission-1', { exact: true }).count()).toBe(0)
    await openMission(page)

    const dashboard = page.getByRole('region', { name: 'Tableau de mission' })
    await expect.poll(() => dashboard.getByText(String(PAGED_TURNS), { exact: true }).count(), {
      timeout: 10_000,
    }).toBeGreaterThanOrEqual(2)
    const capabilities = dashboard.getByRole('region', { name: 'Capacités utilisées' })
    expect(await capabilities.getByText('bash', { exact: true }).count()).toBe(1)
    expect(await capabilities.getByText('read', { exact: true }).count()).toBe(1)
    expect(await capabilities.getByText('run_code', { exact: true }).count()).toBe(0)
    await dashboard.getByRole('button', { name: 'Charger l’historique antérieur' }).click()
    await expect.poll(() => dashboard.getByText('Historique chargé', { exact: true }).count(), {
      timeout: 10_000,
    }).toBe(1)
    expect(await dashboard.getByText(String(PAGED_TURNS), { exact: true }).count()).toBeGreaterThanOrEqual(2)

    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await page.getByRole('heading', { name: 'Tableau de mission' }).waitFor({ timeout: 15_000 })
    expect(await page.getByRole('region', { name: 'Tableau de mission' })
      .getByText(String(PAGED_TURNS), { exact: true }).count()).toBeGreaterThanOrEqual(2)
    const snapshot = await captureStableAria(page, '[role="region"][aria-labelledby="mission-title"]', scaffold.workspaceCwd)
    expect(snapshot).not.toContain('mission-28')
    expect(snapshot).not.toContain('settled-28')
    expect(snapshot).not.toContain('private-source.ts')
    expect(snapshot).not.toContain('private tool result')
    await compareOrRefreshGolden(MISSION_EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 90_000)
})
