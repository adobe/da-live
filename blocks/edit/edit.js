import { origin } from '../browse/state/index.js';
import getTools from './tools/index.js';

export default async function init(el) {
    const { getLibs } = await import('../../../scripts/utils.js');
    const { createTag } = await import(`${getLibs()}/utils/utils.js`);

    const { hash } = window.location;
    const filename = hash.split('/').pop();
    const name = createTag('h1', { class: 'da-title-name' }, filename);

    const title = createTag('div', { class: 'da-title' }, name);
    const editor = createTag('div', { class: 'da-editor', contenteditable: true, id: 'da-editor' });

    const meta = createTag('div', { class: 'da-meta' });

    const tools = await getTools(el);

    el.append(title, editor, meta, tools);

    // const h2 = createTag('h2', { class: 'da-edit-title' }, 'This does\'t exist yet.');

    // const headerOpts = { 'Content-Type': 'text/html' };
    // const headers = new Headers(headerOpts);

    // const blob = new Blob([h2.outerHTML], { type: 'text/html' });

    // const opts = { method: 'PUT', headers, body: blob };
    // const resp = await fetch(`${origin}/content/test.html`, opts);
}