import { COLLAB_HTTP_ORIGIN } from './constants.js';

/**
 * Convert AEM HTML to ProseMirror JSON using the da-collab convert API.
 * This provides a single source of truth for HTML-to-ProseMirror conversion,
 * ensuring consistency between live editing and version preview/restore.
 *
 * @param {string} html - The AEM HTML string to convert
 * @returns {Promise<{prosemirror: Object, daMetadata: Object}>} - The converted document
 * @throws {Error} - If the conversion fails
 */
export default async function convertHtmlToProsemirror(html) {
  const response = await fetch(`${COLLAB_HTTP_ORIGIN}/api/v1/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Conversion failed: ${response.status}`);
  }

  return response.json();
}
