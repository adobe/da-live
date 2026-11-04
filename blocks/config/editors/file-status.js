// Status lines for sections stored in a content file of the site (library lists, translate sheet).

import { html, nothing } from 'da-lit';
import { needsPublish } from '../library-paths.js';
import { renderAlert, renderCallout } from './fields.js';
import { FILES, failureDetail } from '../messages.js';

// What Set up does with a library's candidate paths (see api.js setupLibrary).
const setupText = ([first, ...fallbacks]) => (fallbacks.length
  ? FILES.setupFallbacks(first, fallbacks) : FILES.setupOne(first));

// A status is either a note for the section's info box, or a block (error, setup) shown on its own.
const note = (content) => ({ note: html`<p>${content}</p>`, block: nothing });
const block = (content) => ({ note: nothing, block: content });

const sheetLink = (org, site, path) => html`<a
  href=${`https://da.live/sheet#/${org}/${site}${path.replace(/\.json$/, '')}`}
  target="_blank" rel="noopener"><code>${path}</code></a>`;

// Status of a fixed content file (e.g. `/.da/translate.json`); `file` is the shell's load state.
// Resolves to { note, block }.
export function renderFileStatus(file, { org, site }) {
  switch (file?.status ?? 'loading') {
    case 'loading':
      return note(FILES.loading());
    case 'error':
      return block(renderAlert(FILES.loadFailed(file.path), failureDetail(file)));
    default:
      return file.missing
        ? note(FILES.missing(file.path))
        : note(FILES.storedIn(sheetLink(org, site, file.path)));
  }
}

// Where a library list comes from, or why it can't be edited. `lib` is the shell's load state
// (see stores.js readFile): { status: 'loading' | 'unregistered' | 'external' | 'error' | 'ok',
// registered, path, missing }. Resolves to { note, block }.
export function renderLibraryStatus(store, lib, { org, site, locked, onSetup }) {
  const { title, paths } = store;
  const name = title.toLowerCase();
  switch (lib?.status ?? 'loading') {
    case 'loading':
      return note(FILES.loading(name));
    case 'unregistered':
      return block(renderCallout(
        FILES.unregistered(name, setupText(paths)),
        html`<button type="button" class="nx-form-btn-primary" ?disabled=${locked}
          @click=${onSetup}>Set up ${name}</button>`,
      ));
    case 'external':
      return note(FILES.external(title, lib.registered));
    case 'error':
      return block(renderAlert(FILES.loadFailed(lib.path), failureDetail(lib)));
    default:
      break;
  }
  if (lib.missing) {
    return note(FILES.missing(lib.path));
  }
  return note(html`${FILES.storedIn(sheetLink(org, site, lib.path))}
    ${needsPublish(lib.registered) ? FILES.needsPublish : nothing}`);
}
