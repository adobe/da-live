import { getLibs } from '../../../scripts/utils.js';
const { signal } = await import(`${getLibs()}/deps/htm-preact.js`);

export const origin = signal('https://das.chris4303.workers.dev');
export const breadcrumbs = signal([]);
export const content = signal([]);
export const showFolder = signal(false);
export const newFolder = signal('');