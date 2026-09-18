import { defineConfig } from '@playwright/test'

const host = '127.0.0.1'
const port = 4173

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://${host}:${port}`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `VITE_SUPABASE_URL=http://127.0.0.1:4174 VITE_SUPABASE_ANON_KEY=e2e-anon-key npm run dev -- --host ${host} --port ${port}`,
    url: `http://${host}:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
