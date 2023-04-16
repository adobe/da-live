import { getLibs } from '../../../scripts/utils.js';
const { signal } = await import(`${getLibs()}/deps/htm-preact.js`);

export const origin = signal('http://localhost:8787');
export const breadcrumbs = signal([]);
export const content = signal([]);
export const showFolder = signal(false);
export const newFolder = signal('');