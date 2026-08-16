import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest" />')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toEqual({
    id: '/',
    name: 'LasmeX',
    short_name: 'LasmeX',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    icons: [{
      src: '/favicon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any',
    }],
  })
})

it('ships the cube-mark favicon as a scalable SVG', async () => {
  const favicon = await readFile(join(DIST_ROOT, 'favicon.svg'), 'utf8')
  expect(favicon).toContain('<svg')
  expect(favicon).toMatch(/viewBox="0 0 \d+ \d+"/)
  // The traced mark ships its own palette; no background key survives.
  expect(favicon).not.toContain('#ff00ff')
})
