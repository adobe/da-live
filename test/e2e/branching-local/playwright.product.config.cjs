const config = require('./playwright.config.cjs');

const cases = { browse: /real browse and legacy editor/, switch: /branch browse selector/, mixed: /real sheet, config and media UI/, control: /non-enabled product routes/, history: /real browse Site History/ };
if (process.env.POC_CASE && !Object.hasOwn(cases, process.env.POC_CASE)) throw new Error('Invalid POC_CASE');

module.exports = { ...config, testMatch: '**/product.local.spec.cjs', grep: cases[process.env.POC_CASE] };
