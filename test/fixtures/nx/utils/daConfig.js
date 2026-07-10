// Mock NX /utils/daConfig.js utils for tests
// Real contract (see blocks/shared/utils.js's fetchDaConfigs): returns a plain
// array of promises synchronously, one per org/site config, so callers can
// `await Promise.all(fetchDaConfigs({ org, site }))`.
export const fetchDaConfigs = () => [];
export const getFirstSheet = () => null;
