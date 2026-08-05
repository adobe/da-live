// Mock NX /utils/daConfig.js utils for tests.
//
// By default `fetchDaConfigs` resolves to no configs, so callers that depend on
// site config are a no-op. Tests can inject config sheets via `__setDaConfigs`.
let mockConfigs = [];

/** Test helper: set the configs `fetchDaConfigs` resolves to. Pass `[]` to reset. */
export function __setDaConfigs(configs = []) {
  mockConfigs = configs;
}

export const fetchDaConfigs = () => mockConfigs.map((config) => Promise.resolve(config));

export const getFirstSheet = (config) => config?.data ?? null;
