/*
 * Copyright 2026 Adobe. All rights reserved.
 * Derives the upload parent and name from a source document URL, in either store's shape.
 */

// da-admin: https://admin.da.live/source/{org}/{site}/dir/doc.html
// source bus: https://api.aem.live/{org}/sites/{site}/source/dir/doc.html
function orgSiteAndRest(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'source') return segments.slice(1);
  if (segments[1] === 'sites' && segments[3] === 'source') {
    return [segments[0], segments[2], ...segments.slice(4)];
  }
  return null;
}

/**
 * @param {string} sourceUrl a document url on either store
 * @returns {{ parent: string, name: string } | null} the parent in the `/org/site/dir` form the
 * source api takes, and the document name without its extension
 */
export function getSourceUploadContext(sourceUrl) {
  if (!sourceUrl || typeof sourceUrl !== 'string') return null;
  try {
    const segments = orgSiteAndRest(new URL(sourceUrl).pathname);
    if (!segments || segments.length < 3) return null;
    const name = segments[segments.length - 1].replace(/\.html?$/i, '');
    return { parent: `/${segments.slice(0, -1).join('/')}`, name };
  } catch {
    return null;
  }
}
