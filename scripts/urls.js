import config, { getServiceEnvs } from './config.js';

const TOKEN = /\{(org|site|branch|snapshot|owner|repo)\}/g;
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const trimSlash = (value) => value.replace(/\/+$/, '');

export function resolveUrlTemplate(template, values) {
  const resolved = template.replace(TOKEN, (_, key) => {
    const value = values[key];
    if (value === undefined || !/^[a-z0-9_.-]+$/i.test(value) || ['.', '..'].includes(value)) {
      throw new Error(`Invalid URL template value: ${key}`);
    }
    return encodeURIComponent(value);
  });
  const url = new URL(resolved);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.search || url.hash || /[{}]/.test(resolved)) {
    throw new Error('Expected an HTTP(S) base URL template without credentials, query or fragment');
  }
  return trimSlash(url.href);
}

export function appendUrlPath(base, path = '') {
  return path ? `${trimSlash(base)}/${path.replace(/^\/+/, '')}` : trimSlash(base);
}

export function getAppUrl(path = '', page = false, settings = config) {
  return `${new URL(`https://${page ? settings.da.pageDomain : settings.da.domain}`).origin}${path}`;
}

function siteTemplate(tier, settings) {
  if (settings.aem[`${tier}Url`]) return settings.aem[`${tier}Url`];
  if (tier === 'ue' || tier === 'uePage') {
    const domain = tier === 'uePage' ? settings.da.pageDomain : settings.da.domain;
    return `https://{branch}--{site}--{org}.ue.${domain}`;
  }
  const host = settings.aem[`${tier}Host`];
  return `https://${tier === 'review' ? '{snapshot}--' : ''}{branch}--{site}--{org}.${host}`;
}

export function getSiteUrl(tier, { path = '', search = '', hash = '', host, ...values }, settings = config) {
  let template = siteTemplate(tier, settings);
  if (host && !settings.aem[`${tier}Url`]) template = host.includes('://') ? host : `https://${host}`;
  const base = resolveUrlTemplate(template, { branch: 'main', ...values });
  return `${appendUrlPath(base, path)}${search}${hash}`;
}

function previewTemplate(value) {
  if (value.includes('://')) return value;
  const protocol = value.startsWith('localhost') ? 'http' : 'https';
  return `${protocol}://{branch}--{site}--{org}.${value}`;
}

export function getPreviewUrl(endpoint, values) {
  const { path = '', search = '', hash = '' } = values;
  return `${appendUrlPath(resolveUrlTemplate(previewTemplate(endpoint), values), path)}${search}${hash}`;
}

function matchTemplate(input, template, fallback = {}) {
  try {
    const url = new URL(input);
    if (url.username || url.password) return null;
    const keys = [];
    const marked = template.replace(TOKEN, (_, key) => {
      keys.push(key);
      return `zzurltoken${keys.length}zz`;
    });
    const base = new URL(marked);
    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password
      || base.search || base.hash) return null;
    let pattern = escapeRegex(`${base.origin}${trimSlash(base.pathname)}`);
    const captures = [];
    keys.forEach((key, index) => {
      let replacement = `\\${captures.indexOf(key) + 1}`;
      if (!captures.includes(key)) {
        captures.push(key);
        replacement = '([a-zA-Z0-9_.%-]+?)';
      }
      pattern = pattern.replace(`zzurltoken${index + 1}zz`, () => replacement);
    });
    const match = new RegExp(`^${pattern}(/.*)?$`).exec(`${url.origin}${url.pathname}`);
    if (!match) return null;
    const values = { branch: 'main', ...fallback };
    for (let index = 0; index < captures.length; index += 1) {
      const key = captures[index];
      const value = decodeURIComponent(match[index + 1]);
      if (!/^[a-z0-9_.-]+$/i.test(value) || ['.', '..'].includes(value)) return null;
      values[key] = value;
    }
    if (!values.org || !values.site) return null;
    return { ...values, pathname: match[captures.length + 1] || '/', search: url.search, hash: url.hash };
  } catch {
    return null;
  }
}

export function parseSiteUrl(input, fallback = {}, settings = config) {
  for (const tier of ['preview', 'live', 'review']) {
    const template = siteTemplate(tier, settings);
    const details = matchTemplate(input, template, fallback)
      || (!settings.aem[`${tier}Url`] && matchTemplate(input, template.replace(/^https:/, 'http:'), fallback));
    if (details) return { ...details, tier };
  }
  for (const host of settings.aem.legacyHosts) {
    const template = `://{branch}--{site}--{org}.${host}`;
    const details = matchTemplate(input, `https${template}`, fallback)
      || matchTemplate(input, `http${template}`, fallback);
    if (details) return { ...details, tier: host.endsWith('.page') ? 'preview' : 'live' };
  }
  return null;
}

export function parsePreviewUrl(input, fallback = {}, settings = config) {
  const endpoints = [settings.da.services.preview, settings.da.pageServices.preview]
    .flatMap((envs) => Object.values(envs));
  for (const endpoint of endpoints) {
    const template = previewTemplate(endpoint);
    const details = matchTemplate(input, template, fallback)
      || (!endpoint.includes('://') && matchTemplate(input, template.replace(/^https:/, 'http:'), fallback));
    if (details) return details;
  }
  // Local wildcard preview hosts have historically omitted the configured port.
  return matchTemplate(input, 'https://{branch}--{site}--{org}.localhost', fallback)
    || matchTemplate(input, 'http://{branch}--{site}--{org}.localhost', fallback);
}

export function toSiteUrl(input, tier, settings = config) {
  const details = parseSiteUrl(input, {}, settings);
  return details ? getSiteUrl(tier, { ...details, path: details.pathname }, settings) : input;
}

export function isStageLocation(location, settings = config) {
  const { hostname = '' } = location;
  return hostname === 'localhost' || hostname.endsWith('.localhost')
    || parseSiteUrl(location.href || `https://${hostname}${location.pathname || '/'}`, {}, settings)?.tier === 'preview';
}

function serviceEndpoints(name, settings) {
  return [...new Set([settings.da.services, settings.da.pageServices]
    .flatMap((services) => Object.values(services[name])))];
}

export function getServiceOrigins(name, settings = config) {
  return [...new Set(serviceEndpoints(name, settings).map((value) => new URL(value).origin))];
}

export function parseDaUrl(input, settings = config, allowHostFallback = false) {
  try {
    const url = new URL(input);
    // Ports distinguish services sharing a hostname, including localhost.
    for (const service of ['content', 'admin']) {
      for (const endpoint of serviceEndpoints(service, settings)) {
        const base = new URL(endpoint);
        const prefix = `${trimSlash(base.pathname)}/`;
        const other = service === 'content' ? 'admin' : 'content';
        const uniqueHost = !serviceEndpoints(other, settings)
          .some((value) => new URL(value).hostname === base.hostname);
        const matches = url.origin === base.origin || (allowHostFallback
          && uniqueHost && url.hostname === base.hostname);
        if (matches && url.pathname.startsWith(prefix)) {
          const segments = url.pathname.slice(prefix.length).split('/');
          if (service === 'admin') segments.shift();
          const [org, site, ...parts] = segments;
          if (org && site) {
            return {
              org,
              site,
              branch: 'main',
              pathname: `/${parts.join('/')}`,
              search: url.search,
              hash: url.hash,
              service,
              base: trimSlash(base.href),
            };
          }
        }
      }
    }
  } catch { /* not a configured service URL */ }
  return null;
}

export function getStoredContentOrigin(hostname, source, settings = config) {
  const origins = getServiceOrigins('content', settings)
    .filter((origin) => new URL(origin).hostname === hostname);
  const preferred = new URL(source).origin;
  if (origins.includes(preferred)) return preferred;
  return origins.length === 1 ? origins[0] : null;
}

export function isAuthoringOrigin(input, settings = config) {
  try {
    const url = new URL(input);
    const allowed = [getAppUrl('', false, settings), getAppUrl('', true, settings),
      'http://localhost:3000', 'https://localhost', ...(settings.da.previewOrigins || [])];
    if (allowed.some((origin) => new URL(origin).origin === url.origin)) return true;
    for (const tier of ['preview', 'live']) {
      const base = resolveUrlTemplate(siteTemplate(tier, settings), { org: settings.da.owner, site: settings.da.repo, branch: 'zzbranchzz' });
      const { origin } = new URL(base);
      // Path-based deployments share an origin: require explicit trust instead of inferring it.
      if (origin.includes('zzbranchzz')) {
        const pattern = escapeRegex(origin).replace('zzbranchzz', '[a-z0-9-]+');
        if (new RegExp(`^${pattern}$`).test(url.origin)) return true;
      }
    }
  } catch { /* reject malformed or opaque origins */ }
  return false;
}

export function getCanvasPreviewUrl(values, location = window.location, settings = config) {
  const envs = getServiceEnvs('preview', location.origin, settings);
  return getPreviewUrl(isStageLocation(location, settings) ? envs.stage : envs.prod, values);
}

export function getNxUrl(base, branch, version2 = false, settings = config) {
  const custom = version2 ? settings.nx.urlV2 : settings.nx.url;
  if (custom) {
    return resolveUrlTemplate(custom, { branch, owner: settings.nx.owner, repo: settings.nx.repo });
  }
  if (version2 && settings.nx.url) return `${getNxUrl(base, branch, false, settings)}2`;
  const origin = resolveUrlTemplate(`https://{branch}--{repo}--{owner}.${settings.aem.liveHost}`, { branch, owner: settings.nx.owner, repo: settings.nx.repo });
  return appendUrlPath(origin, version2 ? `${base}2` : base);
}
