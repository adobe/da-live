/**
 * Site-level image-modifier handling for AEM Assets Open API delivery URLs.
 *
 * A site admin sets `aem.asset.image.modifiers` in DA site config to a
 * query-string fragment (no leading `?`), e.g. `width=1920&quality=85`.
 * Every image inserted via the AEM Asset picker gets these merged into its
 * `src` URL at insert time, so the customer's site-wide rendition policy is
 * applied uniformly without per-image authoring work.
 *
 * Scope (deliberately narrow to avoid surprises):
 *   - Only applied to AEM Assets Open API delivery URLs (`/adobe/assets/...`).
 *     Drag-drop uploads to the content store and non-DM URLs are untouched.
 *   - Skips `.../as/<name>/play` (video) paths.
 *   - "If not present" semantics: existing query params on the URL win, so
 *     per-asset overrides (e.g. `?smartcrop=Square`) and any future per-image
 *     authoring continue to take precedence.
 *
 * Security: modifier strings come from authenticated DA admin config and are
 * merged via `URLSearchParams.set()` which percent-encodes values. We never
 * interpolate them into HTML or JS contexts.
 */

const IMAGE_EXTENSIONS = new Set(['avif', 'webp', 'jpg', 'jpeg', 'png', 'gif']);

/**
 * Parses the raw `aem.asset.image.modifiers` config value.
 *
 * @param {string|null|undefined} rawValue
 * @returns {string|null} trimmed modifier string, or null when absent/empty.
 */
export function parseSiteImageModifiers(rawValue) {
  if (typeof rawValue !== 'string') return null;
  const trimmed = rawValue.trim().replace(/^\?/, '');
  return trimmed || null;
}

function isAemAssetsDeliveryImageUrl(url) {
  if (!url.pathname.includes('/adobe/assets/')) return false;
  const path = url.pathname.toLowerCase();
  // Skip video delivery paths like `/as/<name>/play`.
  if (path.endsWith('/play') || path.endsWith('/play/')) return false;
  const lastSegment = path.split('/').pop() || '';
  const dotIdx = lastSegment.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const ext = lastSegment.slice(dotIdx + 1);
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Merges site-level modifiers into an AEM Assets Open API image URL.
 *
 * Returns the original URL unchanged when:
 *   - `modifiers` is empty/null
 *   - `srcUrl` is empty or unparseable
 *   - `srcUrl` is not an AEM Assets Open API delivery image URL
 *
 * For matching URLs, every key in `modifiers` is set ONLY if the URL doesn't
 * already carry that key. This preserves per-asset overrides (smartcrop,
 * future per-image presets, etc.).
 */
export function applySiteImageModifiers(srcUrl, modifiers) {
  if (!srcUrl || !modifiers) return srcUrl;
  let url;
  try {
    url = new URL(srcUrl);
  } catch {
    return srcUrl;
  }
  if (!isAemAssetsDeliveryImageUrl(url)) return srcUrl;

  let modParams;
  try {
    modParams = new URLSearchParams(modifiers);
  } catch {
    return srcUrl;
  }

  let mutated = false;
  modParams.forEach((value, key) => {
    if (!url.searchParams.has(key)) {
      url.searchParams.set(key, value);
      mutated = true;
    }
  });

  return mutated ? url.toString() : srcUrl;
}
