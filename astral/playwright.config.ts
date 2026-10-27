import { defineConfig } from '@playwright/test';
export default defineConfig({
    testDir: './tests',
    testMatch: '*.e2e.ts',
    workers: 1,
    timeout: 90000,
    expect: { timeout: 20000 },
    use: {
        channel: process.env.ASTRAL_BROWSER_CHANNEL || 'msedge',
        baseURL: 'http://127.0.0.1:8000',
        viewport: { width: 1440, height: 960 },
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
    outputDir: 'test-output',
    reporter: 'list',
    webServer: process.env.ASTRAL_EXTERNAL_TEST_SERVER ? undefined : {
        command: 'npm run astral:dev',
        url: 'http://127.0.0.1:8000/csrf-token',
        reuseExistingServer: false,
        timeout: 120000,
        env: {
            ASTRAL_DATA_ROOT:
                process.env.ASTRAL_E2E_DATA_ROOT || `${process.cwd()}/.cache/e2e-${Date.now()}/data`,
        },
    },
});
