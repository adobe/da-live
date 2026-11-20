const { defineConfig } = require('@playwright/test');

// Deliberately independent of ../playwright.config.js: no IMS, setup or cleanup projects.
module.exports = defineConfig({
  testDir: '.',
  testMatch: ['**/source.local.spec.cjs', '**/components.local.spec.cjs'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: 'list',
  outputDir: process.env.POC_OUTPUT_DIR,
  use: { channel: 'chrome', trace: 'off', serviceWorkers: 'block', actionTimeout: 10000, navigationTimeout: 20000, launchOptions: { args: ['--no-proxy-server'] } },
});
