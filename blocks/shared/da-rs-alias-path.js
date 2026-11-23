import { parseSiteSegment } from './content-branch-context.js';
import { isValidDaRsSegment } from './da-rs-provider.js';

function pathSegments(path) {
  if (!path.startsWith('/')) throw new TypeError('Invalid da-rs path');
  const parts = path.slice(1).split('/');
  if (parts.slice(0, -1).includes('')) throw new TypeError('Invalid da-rs path');
  return parts;
}

function validateAliasSegment(part) {
  if (part === '.' || part === '..' || /[/\\%?#\p{Cc}\p{Cs}]/u.test(part)) {
    throw new TypeError('Invalid da-rs path');
  }
  return part;
}

function decodeAliasSegment(part) {
  // Keep the existing prohibition on encoded dots; never decode an already decoded path.
  if (/%2e/i.test(part)) throw new TypeError('Invalid da-rs path');
  let decoded;
  try {
    decoded = decodeURIComponent(part);
  } catch {
    throw new TypeError('Invalid da-rs path');
  }
  return validateAliasSegment(decoded);
}

// Parse browser hash paths. Org and site identities must be literal and already canonical.
export function parseDaRsAliasPath(path) {
  const [org, site, ...aliases] = pathSegments(path);
  if (!isValidDaRsSegment(org)) throw new TypeError('Invalid da-rs organization');
  if (site) parseSiteSegment(site);
  return [org, ...(site === undefined ? [] : [site]), ...aliases.map(decodeAliasSegment)];
}

// Source paths and normalized listing paths are decoded internal strings, not URL strings.
export function encodeDaRsAliasPath(path = '') {
  if (!path) return '';
  return `/${pathSegments(path).map((part) => encodeURIComponent(validateAliasSegment(part))).join('/')}`;
}
