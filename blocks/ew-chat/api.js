import { getNx } from '../../scripts/utils.js';
const { DA_ADMIN } = await import(`${getNx()}/utils/utils.js`);
import { daFetch } from '../shared/utils.js';

export async function loadPrompts(org, site) {
  try {
    const resp = await daFetch(`${DA_ADMIN}/config/${org}/${site}`);
    if (!resp.ok) return null;
    const json = await resp.json();
    return json?.prompts?.data ?? [];
  } catch {
    return null;
  }
}
