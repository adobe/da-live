const config = require('./playwright.config.cjs');

module.exports = { ...config, testMatch: '**/collab.local.spec.cjs' };
