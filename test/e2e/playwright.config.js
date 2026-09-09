// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 3 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  /* 'list' prints a per-test progress line (title + status + duration) to the
     console as tests run; 'html' keeps the report artifact for CI/debugging. */
  reporter: [['list'], ['html']],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  /* Default expect timeout. The app relies on Y.js WebSocket sync and may
     cycle through IMS login redirects, both of which regularly exceed 5s. */
  expect: { timeout: 15000 },

  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Failure-only artifacts: now that runs clean up their own test data (see
       utils/fixtures.js), these are the debugging record instead of kept-around
       server files. */
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    // Setup project (auth + clean-at-start). 'cleanup' is its teardown, so
    // Playwright runs it AFTER every project that depends on setup finishes -
    // guaranteed to be last regardless of worker count or how the suite is
    // launched (npm/npx/IDE), which a plain spec in tests/ cannot promise.
    { name: 'setup', testMatch: /.*\.setup\.js/, teardown: 'cleanup' },

    // Teardown project: deletes this run's /tests/pw-{branch} folder once, at
    // the very end. Runs even when tests failed. testIgnore on the browser
    // projects below keeps teardown.spec.js from also running mid-suite.
    {
      name: 'cleanup',
      testMatch: /teardown\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.playwright/.auth/user.json',
      },
    },

    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.playwright/.auth/user.json',
      },
      testIgnore: /teardown\.spec\.js/,
      dependencies: ['setup'],
    },

    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: '.playwright/.auth/user.json',
      },
      testIgnore: /teardown\.spec\.js/,
      dependencies: ['setup'],
    },

    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: '.playwright/.auth/user.json',
      },
      testIgnore: /teardown\.spec\.js/,
      dependencies: ['setup'],
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
