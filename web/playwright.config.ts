import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/signin',
    reuseExistingServer: true,
    timeout: 120_000,
    cwd: '.',
  },
});
