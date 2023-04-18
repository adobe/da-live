import { getLibs } from '../../../scripts/utils.js';
const { getConfig } = await import(`${getLibs()}/utils/utils.js`);
const { signal } = await import(`${getLibs()}/deps/htm-preact.js`);

export const origin = getConfig().env.name === 'local' ? 'http://localhost:8787' : 'https://das.chris4303.workers.dev';

export const breadcrumbs = signal([]);
export const content = signal([]);
export const showFolder = signal(false);
export const newFolder = signal('');
