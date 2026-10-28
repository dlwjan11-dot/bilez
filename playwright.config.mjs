import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'tests/e2e',
    testMatch: /.*\.spec\.mjs$/,
    globalSetup: './tests/global-setup.mjs',
    outputDir: 'tests/results/artifacts',
    timeout: 90_000,
    expect: { timeout: 10_000 },
    workers: 1,
    fullyParallel: false,
    retries: 0,
    reporter: [
        ['list'],
        ['json', { outputFile: 'tests/results/results.json' }],
        ['html', { outputFolder: 'tests/results/html', open: 'never' }],
    ],
});
