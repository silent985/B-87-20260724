import { defineConfig } from 'vitest/config'

// A standalone Vitest config so the test run does not load the Electron build
// plugin from vite.config.ts (which would try to bundle the main process).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
