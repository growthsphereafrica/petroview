import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Scoped to the web app. backend/test holds its own suite, run from the
    // backend workspace, and must not be collected by the root runner.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
})
