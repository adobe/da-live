import { getLibs } from '../../../scripts/utils.js';
const { getConfig } = await import(`${getLibs()}/utils/utils.js`);
const { signal } = await import(`${getLibs()}/deps/htm-preact.js`);

export const origin = getConfig().env.name === 'local' ? 'http://localhost:8787' : 'https://das.chris4303.workers.dev';
export const hlxOrigin = 'https://admin.hlx.page/preview/auniverseaway/dac/main';

export const breadcrumbs = signal([]);
export const content = signal([]);

export const showNew = signal('');
export const newType = signal('');
export const newName = signal('');
