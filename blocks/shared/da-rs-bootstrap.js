// Deployment-owned, same-origin demo bootstrap. It carries no tokens and no origins,
// only allowed environment keys. It must stay free of imports: constants.js awaits it.
export const DA_RS_DEMO_PATH = '/da-rs-demo.json';
export const DA_RS_DEMO_TIMEOUT = 5000;

const ENV_KEYS = ['local', 'stage', 'prod'];
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
    || !ENV_KEYS.includes(raw.adminEnv) || !ENV_KEYS.includes(raw.collabEnv)
    || (raw.authoringMode !== undefined && !['single', 'collaboration'].includes(raw.authoringMode))) {
    throw new Error('Invalid da-rs demo config');
  }
  return Object.freeze({ ...raw });
}

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

// Eligible local PoC context: http(s) served from a loopback host. Everything else (hosted
// da.live, da.page, previews) never fetches the demo config and can never select da-rs by it.
export function isDaRsDemoEligible(location = window.location) {
  if (!/^https?:$/.test(location.protocol)) return false;
  const hostname = (location.hostname ?? new URL(location.origin).hostname).toLowerCase();
  return LOOPBACK_HOSTS.includes(hostname);
}

export async function loadDaRsDemoState(location = window.location, fetchFn = window.fetch) {
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

// Explicit ?da-source wins; otherwise a configured (or failed, fail-closed) demo selects da-rs,
// but only for an eligible loopback href so demo state never leaks onto a hosted href.
export function isDaRsSelected(href = window.location.href) {
  const url = new URL(href);
  const explicit = url.searchParams.get('da-source');
  if (explicit) return explicit === 'da-rs';
  return isDaRsDemoEligible(url) && daRsDemoState.status !== 'absent';
}

// Demo default for a URL env key, or undefined when none applies.
export function daRsDemoEnvDefault(key) {
  const { config } = daRsDemoState;
  if (key === 'da-admin') return config?.adminEnv;
  if (key === 'da-collab') return config?.collabEnv;
  return undefined;
}

// A configured demo is in effect (not overridden by an explicit non-da-rs selection).
export const isDaRsDemoActive = (href = window.location.href) => daRsDemoState.status === 'ready'
  && isDaRsSelected(href);

// Single-author is the default only for the selected, loopback-hosted demo.
export const isSingleAuthorDemo = () => isDaRsDemoActive()
  && daRsDemoState.config?.authoringMode !== 'collaboration';
