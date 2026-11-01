import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: '*.spec.ts',
  workers: 1,
  outputDir: './.artifacts/crm-browser',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `${process.platform === 'win32' ? 'npm.cmd' : 'npm'} exec -- vite --config vite.crm-browser.config.mts`,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60000
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } }
  ]
});
