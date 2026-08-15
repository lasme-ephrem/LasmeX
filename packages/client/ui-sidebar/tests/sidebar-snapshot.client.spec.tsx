// @vitest-environment jsdom
/**
 * Local DOM snapshots of the sidebar shell through the real assembly path:
 * SlotTestRuntime mounts the package apply on its own fiber, the auto frame
 * supplies the layout's owner share at the render site, and the snapshot
 * captures exactly the 'sidebar' slot's output (CSS-module class names
 * folded to their semantic locals by the runtime's serializer). The child
 * holes (sidebar.workspaces / sidebar.settings) have no registrant here, so
 * the snapshots pin the shell chrome itself.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, waitFor } from '@testing-library/react'
import { SlotTestRuntime, usePinnedBrowserLanguages } from 'lasmex-client-test-runtime'
import { LocaleRuntime } from 'lasmex-client-locale/client'
import { apply, inject } from 'lasmex-client-ui-sidebar/client'

// These specs advertise Chinese for their default-locale snapshot.
usePinnedBrowserLanguages('zh-CN')

afterEach(cleanup)

/**
 * Boot the package over the slot test runtime. The default bench stays on
 * the service's browser-derived locale, pinning
 * what a Chinese browser shows; explicit options pin the French or English copy.
 * The installed face backs the entry's standard `t` seat either way.
 */
async function bench(options: { locale?: 'fr' | 'en' } = {}) {
  const runtime = await SlotTestRuntime.create()
  runtime.provide('layout', { toggleSidebar: vi.fn() })
  const locale = new LocaleRuntime(runtime.ctx)
  if (options.locale !== undefined) locale.setLocale(options.locale)
  runtime.provide('locale', locale)
  runtime.slots.installLocale(locale)
  await runtime.declare({ 'sidebar': { kind: 'single', scope: 'root' } })
  await runtime.mount({ inject: [...inject], apply })
  return { runtime, locale }
}

describe('sidebar shell snapshots', () => {
  it('renders the French-first LasmeX shell', async () => {
    const { runtime } = await bench({ locale: 'fr' })
    const slot = runtime.renderSlot('sidebar', { collapsed: false, width: 300 })
    expect(slot.view.getAllByRole('button', { name: 'Créer une session' })).toHaveLength(2)
    expect(slot.container).toMatchSnapshot()
    await runtime.dispose()
  })

  it('renders the expanded column in the browser locale (zh, no setLocale)', async () => {
    const { runtime } = await bench()
    const slot = runtime.renderSlot('sidebar', { collapsed: false, width: 300 })
    // Wordmark + capsule both start a session in the expanded state.
    expect(slot.view.getAllByRole('button', { name: '新建会话' })).toHaveLength(2)
    expect(slot.container).toMatchSnapshot()
    await runtime.dispose()
  })

  it('renders the expanded column (wordmark, capsule, empty holes)', async () => {
    const { runtime } = await bench({ locale: 'en' })
    const slot = runtime.renderSlot('sidebar', { collapsed: false, width: 300 })
    // Wordmark + capsule both start a session in the expanded state.
    expect(slot.view.getAllByRole('button', { name: 'New session' })).toHaveLength(2)
    expect(slot.container).toMatchSnapshot()
    await runtime.dispose()
  })

  it('renders the collapsed rail after the crossfade settles, in place', async () => {
    const { runtime } = await bench({ locale: 'en' })
    const slot = runtime.renderSlot('sidebar', { collapsed: false, width: 300 })
    const shell = slot.container.firstElementChild
    slot.update({ collapsed: true, width: 56 })
    // The wide content (wordmark shortcut) unmounts at the 150ms settle;
    // only the rail's capsule remains a New-session button.
    await waitFor(() => {
      expect(slot.view.getAllByRole('button', { name: 'New session' })).toHaveLength(1)
    })
    expect(slot.container).toMatchSnapshot()
    // Same tree position: the owner flip re-rendered the shell in place.
    expect(slot.container.firstElementChild).toBe(shell)
    await runtime.dispose()
  })

  it('a locale switch refreshes mounted copy without re-registration', async () => {
    const { runtime, locale } = await bench()
    const slot = runtime.renderSlot('sidebar', { collapsed: false, width: 300 })
    expect(slot.view.getAllByRole('button', { name: '新建会话' })).toHaveLength(2)
    // Same fiber, same registration: setLocale alone re-renders the outlet.
    act(() => { locale.setLocale('en') })
    expect(slot.view.getAllByRole('button', { name: 'New session' })).toHaveLength(2)
    expect(slot.view.queryByRole('button', { name: '新建会话' })).toBeNull()
    await runtime.dispose()
  })
})
