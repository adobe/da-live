export const CATEGORIES = ['References', 'Content', 'SEO'];

export const ICONS = new Map([
  ['success', 'blocks/edit/img/S2_Icon_CheckmarkCircle_20_N.svg#S2_Icon_CheckmarkCircle'],
  ['info', '/blocks/edit/img/S2_Icon_InfoCircle_20_N.svg#S2_Icon_InfoCircle'],
  ['warn', '/blocks/edit/img/S2_Icon_AlertTriangle_20_N.svg#S2_Icon_AlertTriangle'],
  ['error', '/blocks/edit/img/S2_Icon_AlertDiamond_20_N.svg#S2_Icon_AlertDiamond'],
  ['more', '/blocks/edit/img/S2_Icon_More_20_N.svg#S2_Icon_More'],
]);

export const REASONS = {
  'h1.info': { badge: 'info', reason: 'Found exactly one H1 heading.' },
  'h1.warn': { badge: 'warn', reason: 'Found found more than one H1 heading.' },
  'h1.error': { badge: 'error', reason: 'No H1 Elements found.' },
  'lorem.info': { badge: 'info', reason: 'This document appears to be free of lorem ipsum.' },
  'lorem.error': { badge: 'error', reason: 'This document appears to have lorem ipsum.' },
  'title.info.meta': { badge: 'info', reason: 'Title found in metadata.' },
  'title.info.h1': { badge: 'info', reason: 'Document using H1 as title.' },
  'title.error': { badge: 'error', reason: 'No title found in metadata or H1 fallback.' },
  'title.warn': { badge: 'warn', reason: 'No title found in metadata or H1 fallback.' },
  'description.info.meta': { badge: 'info', reason: 'Description found in metadata.' },
  'description.info.para': { badge: 'info', reason: 'Description found as first paragraph.' },
  'description.warn': { badge: 'warn', reason: 'Description not found in metadata or first paragraph.' },
  'link.working': { badge: 'info', reason: 'Getting link details' },
  'link.success': { badge: 'success', reason: 'Link published' },
  'link.warn': { badge: 'warn', reason: 'Link redirected' },
  'link.error': { badge: 'error', reason: 'Could not validate link' },
};
