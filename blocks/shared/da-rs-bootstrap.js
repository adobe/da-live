// Deployment-owned, same-origin demo bootstrap. It carries no tokens and no origins,
// only allowed environment keys. It must stay free of imports: constants.js awaits it.
export const DA_RS_DEMO_PATH = '/da-rs-demo.json';
export const DA_RS_DEMO_TIMEOUT = 5000;

const ADMIN_ENV_KEYS = ['local', 'stage', 'prod', 'rspoc'];
const COLLAB_ENV_KEYS = ['local', 'stage', 'prod'];
const CONFIG_KEYS = ['apiVersion', 'provider', 'org', 'adminEnv', 'collabEnv'];

export function validateDaRsDemoConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid da-rs demo config');
  const keys = Object.keys(raw);
  if (!CONFIG_KEYS.every((key) => keys.includes(key))
    || keys.some((key) => !CONFIG_KEYS.includes(key) && key !== 'authoringMode')) {
    throw new Error('Invalid da-rs demo config');
  }
  if (raw.apiVersion !== 1 || raw.provider !== 'da-rs'
    || typeof raw.org !== 'string' || !/^[a-z0-9_-]+$/.test(raw.org)
    || !ADMIN_ENV_KEYS.includes(raw.adminEnv) || !COLLAB_ENV_KEYS.includes(raw.collabEnv)
    || (raw.authoringMode !== undefined && !['single', 'collaboration'].includes(raw.authoringMode))) {
    throw new Error('Invalid da-rs demo config');
  }
  return Object.freeze({ ...raw });
}

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const HOSTED_DEMO_ORIGIN = 'https://rspoc--da-live--adobe.aem.page';
const HOSTED_DEMO = Object.freeze({
  apiVersion: 1,
  provider: 'da-rs',
  org: 'demo',
  adminEnv: 'rspoc',
  collabEnv: 'stage',
  authoringMode: 'single',
});

// Local demos retain their deployment-owned configuration. Hosted activation is a separate,
// exact-origin exception and never trusts a preview-supplied backend URL.
export function isDaRsDemoEligible(location = window.location) {
  if (!/^https?:$/.test(location.protocol)) return false;
  const hostname = (location.hostname ?? new URL(location.origin).hostname).toLowerCase();
  return LOOPBACK_HOSTS.includes(hostname);
}

export const isHostedDaRsDemo = (location = window.location) => (
  location.origin === HOSTED_DEMO_ORIGIN
);

export async function loadDaRsDemoState(location = window.location, fetchFn = window.fetch) {
  if (isHostedDaRsDemo(location)) return Object.freeze({ status: 'ready', config: HOSTED_DEMO });
  if (!isDaRsDemoEligible(location)) return Object.freeze({ status: 'absent', config: null });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DA_RS_DEMO_TIMEOUT);
  try {
    const response = await fetchFn.call(window, new URL(DA_RS_DEMO_PATH, location.origin).href, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
    });
    if (response.status === 404) return Object.freeze({ status: 'absent', config: null });
    if (!response.ok) throw new Error(`da-rs demo config unavailable (${response.status})`);
    const config = validateDaRsDemoConfig(await response.json());
    return Object.freeze({ status: 'ready', config });
  } catch (error) {
    // A configured but unusable demo must not fall back to hosted/native writes.
    return Object.freeze({ status: 'failed', config: null, error });
  } finally {
    clearTimeout(timer);
  }
}

export const daRsDemoState = await loadDaRsDemoState();

export const getDaRsDemoState = () => daRsDemoState;

function matchesDemoContext(location) {
  return (isDaRsDemoEligible(location) && isDaRsDemoEligible())
    || (isHostedDaRsDemo(location) && isHostedDaRsDemo());
}

// Explicit ?da-source wins. Implicit demo state is never reused across local and hosted contexts.
export function isDaRsSelected(href = window.location.href) {
  const url = new URL(href);
  const explicit = url.searchParams.get('da-source');
  if (explicit) return explicit === 'da-rs';
  return matchesDemoContext(url) && daRsDemoState.status !== 'absent';
}

// Demo default for a URL env key, or undefined when none applies.
export function daRsDemoEnvDefault(key) {
  const { config } = daRsDemoState;
  if (key === 'da-admin') return config?.adminEnv;
  if (key === 'da-collab') return config?.collabEnv;
  return undefined;
}

// A configured demo is in effect (not overridden by an explicit non-da-rs selection).
export const isDaRsDemoActive = (href = window.location.href) => {
  const url = new URL(href);
  return matchesDemoContext(url) && daRsDemoState.status === 'ready' && isDaRsSelected(href);
};

// Single-author is the default for the selected demo, unless it explicitly enables collaboration.
export const isSingleAuthorDemo = () => isDaRsDemoActive()
  && daRsDemoState.config?.authoringMode !== 'collaboration';
