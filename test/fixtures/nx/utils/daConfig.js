// Mock NX /utils/daConfig.js utils for tests
const daConfigsKey = '__daConfigsFixture__';
let daConfigs = globalThis[daConfigsKey] || [];

export const setDaConfigs = (configs) => {
  daConfigs = configs;
  globalThis[daConfigsKey] = configs;
};

export const fetchDaConfigs = () => (globalThis[daConfigsKey] || daConfigs)
  .map((config) => Promise.resolve(config));
export const getFirstSheet = (config) => config?.data || null;
