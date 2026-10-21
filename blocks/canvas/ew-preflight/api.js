import { getAuthToken } from '../../shared/utils.js';

// Experience Governance (experience-context) origins.
const EC_ENVS = {
  prod: 'https://experience-context.adobe.io',
  stage: 'https://experience-context-stage.adobe.io',
};
const API_KEY = 'darkalley';
const EC_KEY = 'ec';
const EPHEMERAL_HOST = /^adobe-aem-foundation-brand-governance-agent-deploy-[0-9a-f]{6}\.stage\.cloud\.adobe\.io$/;

function getDefaultOrigin(hostname) {
  const isStage = hostname.endsWith('aem.page') || hostname.endsWith('localhost');
  return isStage ? EC_ENVS.stage : EC_ENVS.prod;
}

function resolveOrigin(value) {
  if (Object.hasOwn(EC_ENVS, value)) return EC_ENVS[value];
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  return EPHEMERAL_HOST.test(url.hostname) ? url.origin : null;
}

/**
 * Resolves the experience-context origin. `?ec=prod|stage|<ephemeral url>` overrides
 * the hostname-based default and is persisted in localStorage until `?ec=reset`.
 * The value is validated on every read; invalid values fall back to the default.
 * @param {Location} [location]
 * @returns {string} origin without trailing slash
 */
export function getEcOrigin(location = window.location) {
  const query = new URLSearchParams(location.search).get(EC_KEY);
  if (query === 'reset') localStorage.removeItem(EC_KEY);
  else if (query) localStorage.setItem(EC_KEY, query);
  return resolveOrigin(localStorage.getItem(EC_KEY)) ?? getDefaultOrigin(location.hostname);
}

/**
 * Calls the evaluate-page REST API for the given preview page URL and returns
 * the raw JSON response.
 * @param {string} pageUrl absolute preview URL of the page to evaluate
 * @returns {Promise<object>} raw REST response
 */
export async function evaluatePage(pageUrl) {
  const token = await getAuthToken();
  if (!token) {
    const error = new Error('Not authenticated');
    error.detail = error.message;
    throw error;
  }

  const resp = await fetch(`${getEcOrigin()}/api/v0/evaluate/page`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({ url: pageUrl }),
  });

  if (!resp.ok) {
    // Route errors return { detail }, while the auth middleware returns { error };
    // surface whichever is present, always with the HTTP status.
    let reason;
    try {
      const body = await resp.json();
      reason = [body?.detail, body?.error].find((v) => typeof v === 'string' && v);
    } catch {
      // Body was absent or not JSON; fall back to the status alone.
    }
    const detail = reason
      ? `${reason} (${resp.status})`
      : `Evaluate page failed (${resp.status})`;
    const error = new Error(detail);
    error.detail = detail;
    error.status = resp.status;
    throw error;
  }
  return resp.json();
}
