import deployment from './deployment.js';

function serviceDefaults(domain) {
  return {
    admin: { local: 'http://localhost:8787', stage: `https://stage-admin.${domain}`, prod: `https://admin.${domain}` },
    content: { local: 'http://localhost:8788', stage: `https://stage-content.${domain}`, prod: `https://content.${domain}` },
    collab: { local: 'ws://localhost:4711', stage: `wss://stage-collab.${domain}`, prod: `wss://collab.${domain}` },
    preview: { local: 'localhost:8000', stage: `stage-preview.${domain}`, prod: `preview.${domain}` },
    etc: { local: 'http://localhost:8787', prod: 'https://da-etc.adobeaem.workers.dev' },
  };
}

function mergeServices(defaults, overrides = {}) {
  return Object.fromEntries(Object.entries(defaults)
    .map(([name, envs]) => [name, { ...envs, ...overrides[name] }]));
}

export function createConfig(overrides = {}) {
  const domain = overrides.da?.domain || 'da.live';
  const pageDomain = overrides.da?.pageDomain || 'da.page';
  const da = {
    domain,
    pageDomain,
    owner: 'adobe',
    repo: 'da-live',
    ...overrides.da,
    services: mergeServices(serviceDefaults(domain), overrides.da?.services),
    pageServices: mergeServices(serviceDefaults(pageDomain), overrides.da?.pageServices),
  };
  const aem = {
    previewHost: 'aem.page',
    liveHost: 'aem.live',
    reviewHost: 'aem.reviews',
    legacyHosts: ['hlx.page', 'hlx.live'],
    adminOrigin: 'https://admin.hlx.page',
    apiOrigin: 'https://api.aem.live',
    adminOrigins: ['https://admin.aem.live'],
    toolsOrigin: 'https://tools.aem.live',
    ...overrides.aem,
  };
  return {
    da,
    aem,
    nx: { owner: 'adobe', repo: 'da-nx', ...overrides.nx },
    ims: { clientId: 'darkalley', ...overrides.ims },
  };
}

const config = createConfig(deployment);
export default config;

export function getServiceEnvs(name, origin, settings = config) {
  return origin === new URL(`https://${settings.da.pageDomain}`).origin
    ? settings.da.pageServices[name] : settings.da.services[name];
}
