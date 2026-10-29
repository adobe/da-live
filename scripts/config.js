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
  return origin === `https://${settings.da.pageDomain}`
    ? settings.da.pageServices[name] : settings.da.services[name];
}

export function getServiceOrigins(name, settings = config) {
  return [...new Set([settings.da.services, settings.da.pageServices]
    .flatMap((services) => Object.values(services[name]))
    .map((value) => new URL(value).origin))];
}

export function getServiceHosts(name, settings = config) {
  return new Set(getServiceOrigins(name, settings).map((origin) => new URL(origin).hostname));
}

export function getAemHosts(settings = config) {
  return [settings.aem.previewHost, settings.aem.liveHost, ...settings.aem.legacyHosts];
}

export function isAemHost(hostname, settings = config) {
  return getAemHosts(settings).some((host) => hostname.endsWith(`.${host}`));
}

export function isPreviewHost(hostname, settings = config) {
  const hosts = [settings.da.services.preview, settings.da.pageServices.preview]
    .flatMap((envs) => Object.values(envs))
    .map((host) => new URL(`https://${host}`).hostname);
  return hosts.some((host) => hostname.endsWith(`.${host}`))
    || hostname.endsWith('.localhost');
}

export function isStageHost(hostname, settings = config) {
  return hostname.endsWith(`.${settings.aem.previewHost}`)
    || hostname === 'localhost' || hostname.endsWith('.localhost');
}

export function toAemHost(hostname, target, settings = config) {
  const suffix = getAemHosts(settings).find((host) => hostname.endsWith(`.${host}`));
  return suffix ? `${hostname.slice(0, -suffix.length)}${target}` : hostname;
}

export function isAuthoringOrigin(value, settings = config) {
  try {
    const url = new URL(value);
    if ([`https://${settings.da.domain}`, `https://${settings.da.pageDomain}`,
      'http://localhost:3000', 'https://localhost'].includes(url.origin)) return true;
    if (url.protocol !== 'https:' || url.port) return false;
    const suffixes = [settings.aem.previewHost, settings.aem.liveHost]
      .map((host) => `--${settings.da.repo}--${settings.da.owner}.${host}`);
    return suffixes.some((suffix) => url.hostname.endsWith(suffix)
      && /^[a-z0-9-]+$/.test(url.hostname.slice(0, -suffix.length)));
  } catch {
    return false;
  }
}
