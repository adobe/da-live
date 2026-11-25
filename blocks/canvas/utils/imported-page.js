import getPathDetails from '../../shared/pathDetails.js';
import { findImportedPageCaps, mountImportedPage, unmountImportedPage } from '../../edit/imported-page/imported-page.js';

export const unmountCanvasInspection = (mountRoot) => unmountImportedPage(mountRoot);

// Render in place: crossing /canvas and /edit can bounce through the site's
// editor-selection redirects before the destination viewer gets to initialize.
export async function mountCanvasInspection({ mountRoot, isCurrent }) {
  const details = getPathDetails();
  if (details?.view !== 'canvas' || details.depth < 3) return false;
  const caps = await findImportedPageCaps(details);
  if (!caps || !isCurrent()) return false;
  await import('../../edit/da-title/da-title.js');
  if (!isCurrent()) return false;
  await mountImportedPage({ el: mountRoot, details, caps, isCurrent });
  return true;
}
