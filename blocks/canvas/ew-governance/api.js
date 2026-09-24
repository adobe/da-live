import { getAuthToken } from '../../shared/utils.js';

// Experience Governance "evaluate page" REST endpoint.
const BASE_URL = 'https://enterprise-context.adobe.io';
const EVALUATE_PATH = '/api/v0/evaluate/page';
// Fixed enterprise-context API key (NOT the IMS client id).
const API_KEY = 'darkalley';

/**
 * Calls the evaluate-page REST API for the given preview page URL and returns
 * the raw JSON response.
 * @param {string} pageUrl absolute preview URL of the page to evaluate
 * @returns {Promise<object>} raw REST response
 */
export async function evaluatePage(pageUrl) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

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
    // The API may return a { detail } message explaining the failure; surface
    // it so the caller can show it instead of a generic error.
    let detail;
    try {
      detail = (await resp.json())?.detail;
    } catch {
      // Body was absent or not JSON; fall back to the generic error.
    }
    const error = new Error(detail || `Evaluate page failed: ${resp.status}`);
    if (detail) error.detail = detail;
    throw error;
  }
  return resp.json();
}
