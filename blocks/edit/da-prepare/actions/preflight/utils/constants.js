export const ICONS = new Map([
  ['success', 'blocks/edit/img/S2_Icon_CheckmarkCircle_20_N.svg#S2_Icon_CheckmarkCircle'],
  ['info', '/blocks/edit/img/S2_Icon_InfoCircle_20_N.svg#S2_Icon_InfoCircle'],
  ['warn', '/blocks/edit/img/S2_Icon_AlertTriangle_20_N.svg#S2_Icon_AlertTriangle'],
  ['error', '/blocks/edit/img/S2_Icon_AlertDiamond_20_N.svg#S2_Icon_AlertDiamond'],
  ['more', '/blocks/edit/img/S2_Icon_More_20_N.svg#S2_Icon_More'],
]);

// Maps a check's domain-level result status to the badge/icon vocabulary ICONS
// understands. Checks/providers only ever produce a status; this is the one seam
// that translates that into something rendered.
export const STATUS_TO_BADGE = {
  success: 'success',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

export const REASONS = {
  'h1.info': { status: 'info', reason: 'Found exactly one H1 heading.' },
  'h1.warn': { status: 'warn', reason: 'Found more than one H1 heading.' },
  'h1.error': { status: 'error', reason: 'No H1 Elements found.' },
  'lorem.info': { status: 'info', reason: 'This document appears to be free of lorem ipsum.' },
  'lorem.error': { status: 'error', reason: 'This document appears to have lorem ipsum.' },
  'title.info.meta': { status: 'info', reason: 'Title found in metadata.' },
  'title.info.h1': { status: 'info', reason: 'Document using H1 as title.' },
  'title.error': { status: 'error', reason: 'No title found in metadata or H1 fallback.' },
  'title.warn': { status: 'warn', reason: 'No title found in metadata or H1 fallback.' },
  'description.info.meta': { status: 'info', reason: 'Description found in metadata.' },
  'description.info.para': { status: 'info', reason: 'Description found as first paragraph.' },
  'description.warn': { status: 'warn', reason: 'Description not found in metadata or first paragraph.' },
  'link.working': { status: 'info', reason: 'Getting link details' },
  'link.success': { status: 'success', reason: 'Link published' },
  'link.warn': { status: 'warn', reason: 'Link redirected' },
  'link.error': { status: 'error', reason: 'Could not validate link' },
};
