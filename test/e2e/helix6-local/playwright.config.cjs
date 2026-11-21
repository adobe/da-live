const { defineConfig } = require('@playwright/test');

const cases = {
  browse: /first live checkpoint|independent real Browse/,
  history: /first live checkpoint|two Canvas tabs/,
  race: /first live checkpoint|alias room and delayed real PUT/,
  close: /first live checkpoint|last connection closes with an unflushed edit/,
};
if (process.env.H6_CASE && (!Object.hasOwn(cases, process.env.H6_CASE) || process.env.H6_EARLY_FULL !== '1')) {
  throw new Error('H6_CASE is only available for explicitly selected early diagnostics');
}

module.exports = defineConfig({
  testDir: '.',
  testMatch: '**/*.local.spec.cjs',
  workers: 1,
  retries: 0,
  grep: cases[process.env.H6_CASE],
  timeout: 90000,
  reporter: 'list',
  outputDir: process.env.H6_OUTPUT_DIR,
  use: { channel: 'chrome', serviceWorkers: 'block', trace: 'off', actionTimeout: 10000,
    navigationTimeout: 20000, launchOptions: { args: ['--no-proxy-server'] } },
});
