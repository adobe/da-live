import { getAuthToken } from '../../shared/utils.js';

// Experience Governance "evaluate page" REST endpoint.
const BASE_URL = 'https://experience-context.adobe.io';
const EVALUATE_PATH = '/api/v0/evaluate/page';
// Fixed experience-context API key (NOT the IMS client id).
const API_KEY = 'darkalley';

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

  const resp = await fetch(`${BASE_URL}${EVALUATE_PATH}`, {
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
