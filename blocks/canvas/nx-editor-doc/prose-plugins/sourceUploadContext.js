/*
 * Copyright 2026 Adobe. All rights reserved.
 * Derives upload parent/name from a DA source document URL (same shape as da.live getPathDetails).
 */
import { DA_ADMIN } from '../../../shared/nxutils.js';

/**
 * @param {string} sourceUrl - e.g. https://admin.da.live/source/org/repo/path/doc.html
 * @returns {{ origin: string, parent: string, name: string } | null}
 */
export function getSourceUploadContext(sourceUrl) {
  if (!sourceUrl || typeof sourceUrl !== 'string') return null;
  try {
    const u = new URL(sourceUrl);
    const mark = '/source/';
    const idx = u.pathname.indexOf(mark);
    if (idx === -1) return null;
    const rest = u.pathname.slice(idx + mark.length);
    const segments = rest.split('/').filter(Boolean);
    if (segments.length === 0) return null;
    const lastSeg = segments[segments.length - 1];
    const name = lastSeg.replace(/\.html?$/i, '');
    const parentSegments = segments.slice(0, -1);
    const parent = parentSegments.length ? `/${parentSegments.join('/')}` : '/';
    return { origin: DA_ADMIN, parent, name };
  } catch {
    return null;
  }
}
