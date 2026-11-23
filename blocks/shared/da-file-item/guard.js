import { discoverDaRsCapabilities } from '../da-rs-provider.js';
import { isDaRsSelected } from '../da-rs-bootstrap.js';
import { parseSiteSegment } from '../content-branch-context.js';

export const IMPORTED_EDITOR_MESSAGE = 'Imported content is read-only and cannot be opened in the editor.';
export const CAPABILITIES_UNAVAILABLE_MESSAGE = 'Unable to verify the capabilities of this site.';

// Synchronous pre-check so unbound/hosted entries keep their existing timing.
export const editorAccessRequired = (org, site) => Boolean(org && site) && isDaRsSelected();

// Runs before any provider, default-document creation or collaboration connection.
// Unknown or failed discovery on a bound backend is denied, never treated as native.
export async function checkEditorAccess(org, site) {
  if (!editorAccessRequired(org, site)) return { allowed: true };
  try {
    const baseSite = site.includes('~') ? parseSiteSegment(site).site : site;
    const caps = await discoverDaRsCapabilities(org, baseSite);
    if (!caps) return { allowed: true };
    if (caps.contentProfile === 'aem-import' || caps.readOnly || caps.collaboration === false) {
      return { allowed: false, message: IMPORTED_EDITOR_MESSAGE };
    }
    return { allowed: true, caps };
  } catch {
    return { allowed: false, message: CAPABILITIES_UNAVAILABLE_MESSAGE };
  }
}
