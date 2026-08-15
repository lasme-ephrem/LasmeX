import { mergeConfig } from 'vite'
import webConfig from '../web/vite.config.ts'

export default mergeConfig(webConfig, {
  build: {
    emptyOutDir: true,
    outDir: 'renderer',
  },
})
