import { fileURLToPath } from 'node:url'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from '../../vitest.shared.ts'

const rootTsconfig = fileURLToPath(new URL('../../tsconfig.base.json', import.meta.url))
const rootSetup = fileURLToPath(new URL('../../scripts/test-invariants.ts', import.meta.url))

export default defineConfig({
  plugins: [
    tsconfigPaths({ projects: [rootTsconfig] }),
    standardDecoratorPlugin(),
  ],
  test: {
    execArgv: vitestExecArgv,
    include: ['tests/**/*.spec.ts'],
    pool: 'forks',
    setupFiles: [rootSetup],
  },
})
