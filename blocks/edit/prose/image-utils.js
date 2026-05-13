/**
 * Rewrites an image src from an AEM preview/publish host to the DA preview host.
 *
 * Images stored in DA content may reference *.aem.page (preview) or *.aem.live
 * (publish) URLs. These hosts require AEM authentication that the DA editor does
 * not carry, causing 401 errors when the browser fetches them. The equivalent
 * *.preview.da.live URL serves the same content and is accessible from the editor.
 *
 * @param {string} src - The original image src URL.
 * @returns {string} The rewritten src, or the original if no rewrite was needed.
 */
export function rewriteImageSrcForEditor(src) {
  try {
    const url = new URL(src);
    if (url.host.endsWith('.aem.page') || url.host.endsWith('.aem.live')) {
      url.host = url.host.replace(/\.aem\.(page|live)$/, '.preview.da.live');
      return url.toString();
    }
  } catch {
    // relative or malformed src — leave unchanged
  }
  return src;
}
