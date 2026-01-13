import { daFetch } from '../../shared/utils.js';
import { DA_ORIGIN } from '../../shared/constants.js';
import HTMLConverter from './html2json.js';
import JSONConverter from './json2html.js';

/**
 * Load form data from source URL and convert to JSON.
 * Handles the HTML to JSON conversion internally.
 * @param {string} path - The URL to load the form data from
 * @returns {Promise<{json: object} | {error: string}>}
 */
export async function loadJson(path) {
  try {
    const resp = await daFetch(path);
    if (!resp.ok) {
      return { error: 'Could not fetch document' };
    }

    const html = await resp.text();
    if (!html) {
      return { error: 'Empty document' };
    }

    const converter = new HTMLConverter(html);
    return { json: converter.json };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error loading form data:', error);
    return { error: error.message };
  }
}

/**
 * Save form data (JSON) to the specified path.
 * Handles the JSON to HTML conversion internally.
 * @param {object} json - The form data in JSON format
 * @param {string} path - The path to save the form data to
 * @returns {Promise<{success: boolean, response: Response} | {error: string, response?: Response}>}
 */
export async function saveJson(json, path) {
  try {
    const html = JSONConverter(json);
    const formData = new Blob([html], { type: 'text/html' });
    const body = new FormData();
    body.append('data', formData);

    const opts = { method: 'POST', body };
    const url = `${DA_ORIGIN}/source${path}`;

    const resp = await daFetch(url, opts);
    if (!resp.ok) {
      // eslint-disable-next-line no-console
      console.error('Failed to save data:', resp.status, resp.statusText);
      return { error: 'Failed to save data', response: resp };
    }

    return { success: true, response: resp };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error saving form data:', error);
    return { error: error.message };
  }
}
