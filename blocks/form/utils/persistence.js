// Persistence for the form block.
//
// Single-flight save with re-queue: at most one POST is in flight at a time;
// mutations during a save flip `pending` so the loop re-iterates with the
// latest document when the current save settles. Prevents out-of-order
// overwrites on slow networks.
//
// Usage:
//   const editor = createEngine({ schema, document, onChange });
//   const persistence = attachPersistence(editor, { path });
//   // ...in the shell's onChange handler:
//   persistence.notify();
//   persistence.detach();   // on teardown
//
// `save` is injectable so the call is testable in isolation; default is the
// form block's `saveSourceHtml`. A different consumer could swap in a
// queue-backed save, an offline write, etc., without touching persistence.
// The engine's model is passed along so the SDK writes asset fields as images
// that EDS ingests, and non-image files as links. `getConfig` returns the
// SDK writer `config`, such as `externalImagesAsLinks`. It is read on every
// save.

import { convertJsonToHtml } from '../../../deps/da-sc-sdk/dist/index.js';
import { saveSourceHtml } from './da-api.js';

export function attachPersistence(editor, {
  path,
  save = saveSourceHtml,
  getConfig = () => undefined,
} = {}) {
  let inFlight = false;
  let pending = false;
  let lastValues = editor.getState()?.document;
  let detached = false;

  async function persist() {
    if (inFlight) {
      pending = true;
      return;
    }
    inFlight = true;
    try {
      do {
        pending = false;
        const { document, model } = editor.getState();
        const { html, error } = convertJsonToHtml({
          json: document,
          model,
          config: getConfig(),
        });
        if (error) return;
        try {
          await save({ path, html });
        } catch {
          return;
        }
      } while (pending);
    } finally {
      inFlight = false;
    }
  }

  return {
    // Called by the shell's onChange after every state transition. Mutations
    // are detected by reference comparison on document: mutate.js
    // deep-clones on every real mutation, so a new reference means new content.
    notify: () => {
      if (detached) return;
      const next = editor.getState()?.document;
      if (next === lastValues) return;
      lastValues = next;
      persist();
    },
    detach: () => { detached = true; },
  };
}
