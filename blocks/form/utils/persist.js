import { daFetch } from '../../shared/utils.js';
import { DA_ORIGIN } from '../../shared/constants.js';
import HTMLConverter from './html2json.js';
import JSONConverter from './json2html.js';

/**
 * Convert JSON to HTML with code block format.
 * @param {object} json - The form data in JSON format
 * @returns {string} HTML string with JSON in a code block
 */
function json2CodeBlock(json) {
  const doc = document.implementation.createHTMLDocument();

  const header = document.createElement('header');
  const main = document.createElement('main');
  const section = document.createElement('div');
  const footer = document.createElement('footer');

  // Create da-form block with metadata
  const daForm = document.createElement('div');
  daForm.className = 'da-form';

  // Add x-schema-name
  const schemaRow = document.createElement('div');
  const schemaKey = document.createElement('div');
  schemaKey.textContent = 'x-schema-name';
  const schemaValue = document.createElement('div');
  schemaValue.textContent = json.metadata?.schemaName || '';
  schemaRow.append(schemaKey, schemaValue);

  // Add x-storage-format
  const formatRow = document.createElement('div');
  const formatKey = document.createElement('div');
  formatKey.textContent = 'x-storage-format';
  const formatValue = document.createElement('div');
  formatValue.textContent = 'code';
  formatRow.append(formatKey, formatValue);

  daForm.append(schemaRow, formatRow);

  // Create code block with JSON data only (not metadata)
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = JSON.stringify(json.data, null, 2);
  pre.append(code);

  section.append(daForm, pre);
  main.append(section);
  doc.body.append(header, main, footer);

  return doc.body.outerHTML;
}

/**
 * Extract JSON from HTML code block format.
 * @param {string} html - The HTML string containing code block
 * @returns {object|null} The parsed JSON data or null if not found
 */
function extractJsonFromCodeBlock(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Check if x-storage-format is 'code'
  const daFormRows = doc.querySelectorAll('.da-form > div');
  let isCodeFormat = false;
  let schemaName = '';

  daFormRows.forEach((row) => {
    const cells = row.querySelectorAll('div');
    if (cells.length === 2) {
      const key = cells[0].textContent.trim();
      const value = cells[1].textContent.trim();
      if (key === 'x-storage-format' && value === 'code') {
        isCodeFormat = true;
      }
      if (key === 'x-schema-name') {
        schemaName = value;
      }
    }
  });

  if (!isCodeFormat) {
    return null;
  }

  // Extract JSON from code block
  const codeBlock = doc.querySelector('pre code');
  if (!codeBlock) {
    return null;
  }

  try {
    const data = JSON.parse(codeBlock.textContent);
    return {
      metadata: { schemaName },
      data,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to parse JSON from code block:', error);
    return null;
  }
}

/**
 * Load form data from source URL and convert to JSON.
 * Handles the HTML to JSON conversion internally.
 * Supports both table format and code block format.
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

    // Try to load from code block format first
    const codeBlockJson = extractJsonFromCodeBlock(html);
    if (codeBlockJson) {
      return { json: codeBlockJson };
    }

    // Fall back to table format
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
 * @param {object} options - Save options
 * @param {string} options.format - Format to save in: 'code' (default) or 'table'
 * @returns {Promise<{success: boolean, response: Response} | {error: string, response?: Response}>}
 */
export async function saveJson(json, path, options = {}) {
  try {
    const { format = 'code' } = options;

    // Use code block format by default, or table format if specified
    const html = format === 'table' ? JSONConverter(json) : json2CodeBlock(json);

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
