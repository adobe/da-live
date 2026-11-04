// Status lines for sections stored in a content file of the site (library lists, translate sheet).

import { html, nothing } from 'da-lit';
import { needsPublish } from '../library-paths.js';
import { renderAlert, renderCallout } from './fields.js';
import { FILES, failureDetail } from '../messages.js';

// What Set up does with a library's candidate paths (see api.js setupLibrary).
const setupText = ([first, ...fallbacks]) => (fallbacks.length
  ? FILES.setupFallbacks(first, fallbacks) : FILES.setupOne(first));

const message = (content) => html`<p class="config-message">${content}</p>`;

const sheetLink = (org, site, path) => html`<a
  href=${`https://da.live/sheet#/${org}/${site}${path.replace(/\.json$/, '')}`}
  target="_blank" rel="noopener"><code>${path}</code></a>`;

// Status of a fixed content file (e.g. `/.da/translate.json`); `file` is the shell's load state.
export function renderFileStatus(file, { org, site }) {
  switch (file?.status ?? 'loading') {
    case 'loading':
      return message(FILES.loading());
    case 'error':
      return renderAlert(FILES.loadFailed(file.path), failureDetail(file));
    default:
      return file.missing
        ? message(FILES.missing(file.path))
        : message(FILES.storedIn(sheetLink(org, site, file.path)));
  }
}

// Where a library list comes from, or why it can't be edited. `lib` is the shell's load state
// (see stores.js readFile): { status: 'loading' | 'unregistered' | 'external' | 'error' | 'ok',
// registered, path, missing }.
export function renderLibraryStatus(store, lib, { org, site, locked, onSetup }) {
  const { title, paths } = store;
  const name = title.toLowerCase();
  switch (lib?.status ?? 'loading') {
    case 'loading':
      return message(FILES.loading(name));
    case 'unregistered':
      return renderCallout(
        FILES.unregistered(name, setupText(paths)),
        html`<button type="button" class="nx-form-btn-primary" ?disabled=${locked}
          @click=${onSetup}>Set up ${name}</button>`,
      );
    case 'external':
      return message(FILES.external(title, lib.registered));
    case 'error':
      return renderAlert(FILES.loadFailed(lib.path), failureDetail(lib));
    default:
      break;
  }
  if (lib.missing) {
    return message(FILES.missing(lib.path));
  }
  return message(html`${FILES.storedIn(sheetLink(org, site, lib.path))}
    ${needsPublish(lib.registered) ? FILES.needsPublish : nothing}`);
}
