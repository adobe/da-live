import { getLibs } from '../../../scripts/utils.js';
const { getConfig } = await import(`${getLibs()}/utils/utils.js`);
const { signal } = await import(`${getLibs()}/deps/htm-preact.js`);

// export const origin = getConfig().env.name === 'local' ? 'http://localhost:8787' : 'https://das.chris4303.workers.dev';
export const origin = 'https://admin.da.live';
export const hlxOrigin = 'https://admin.hlx.page';

export const breadcrumbs = signal([]);
export const content = signal([]);

const CREATE_DEFAULT = { show: '', name: '', type: '' };
export const create = signal({ ...CREATE_DEFAULT });
export function resetCreate() { create.value = { ...CREATE_DEFAULT }; }
