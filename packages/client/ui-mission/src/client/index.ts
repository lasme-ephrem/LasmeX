/** Browser plugin registering the Mission conversation view. */

import type { ClientContext, SessionId } from 'lasmex-client-runtime/client'
import type {} from 'lasmex-client-locale/client'
import type {} from 'lasmex-client-ui-conversation/client'
import type {} from 'lasmex-goal/client'
import type {} from 'lasmex-permission-presets/client'
import type {} from 'lasmex-plan-mode/client'
import type {} from 'lasmex-session-mission/client'
import type {} from 'lasmex-session-stats/client'
import type {} from 'lasmex-token-meter/client'
import type {} from 'lasmex-tool-todo/client'
import { MissionView, type MissionViewInjected } from './MissionView.tsx'
import { en, fr, NS, zh, type MissionKey } from './locales.ts'

export type { MissionViewInjected } from './MissionView.tsx'
export type { MissionKey } from './locales.ts'

declare module 'lasmex-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Mission dashboard copy. */
    mission: MissionKey
  }
}

/** Required services: the target slot, session paging, and locale registry. */
export const inject = ['slots', 'sessions', 'locale']

/**
 * Register the Mission view after its conversation slot declaration exists.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { fr, en, zh }), 'ui-mission: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'mission',
    order: 5,
    locale: NS,
    label: () => t('view.mission'),
    inject: (sessionId: SessionId): MissionViewInjected => {
      const session = ctx.sessions.binding(sessionId)?.session
      if (session === undefined) {
        throw new Error(`ui-mission: session "${sessionId}" is unavailable`)
      }
      return {
        openChild(address) {
          ctx.sessions.openSubagent(address)
        },
        loadOlder: async () => {
          const before = session.getSnapshot().hasMore
          await session.loadOlder()
          return before && !session.getSnapshot().hasMore
        },
      }
    },
  }, MissionView))
}
