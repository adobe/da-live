if (process.env.H6_BRANCH !== '1') throw new Error('Use the dedicated B5 runner');
const config = require('./playwright.config.cjs');

module.exports = { ...config, testMatch: '**/branch.local.spec.cjs', grep: undefined };
