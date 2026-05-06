import { initIms as loadIms } from '../../../shared/utils.js';

export function generateColor(name, hRange = [0, 360], sRange = [60, 80], lRange = [40, 60]) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  const normalizeHash = (min, max) => Math.floor((hash % (max - min)) + min);
  const h = normalizeHash(hRange[0], hRange[1]);
  const s = normalizeHash(sRange[0], sRange[1]);
  const l = normalizeHash(lRange[0], lRange[1]) / 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export async function getCollabIdentity() {
  try {
    const ims = await loadIms();
    if (ims?.anonymous) return null;
    const name = (ims?.displayName || ims?.name || '').trim();
    const id = ims?.userId || ims?.email || '';
    if (name && id) {
      return {
        name,
        id,
        colorSeed: ims?.email || ims?.userId || name,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}
