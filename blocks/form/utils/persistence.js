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

import { convertJsonToHtml } from '../../../deps/da-sc-sdk/dist/index.js';
import { saveSourceHtml, saveSourceJson } from './da-api.js';

// `mode` is 'html' (default; convert to DA HTML) or 'json' (Helix 6 native
// JSON; document saved as-is via `save({ path, json })`).
export function attachPersistence(editor, { path, mode = 'html', save } = {}) {
  const isJson = mode === 'json';
  const doSave = save ?? (isJson ? saveSourceJson : saveSourceHtml);
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
        // The model lets the SDK write each rich-text value into a block of its own.
        const { document, model } = editor.getState();
        let payload;
        if (isJson) {
          payload = { json: document };
        } else {
          const { html, error } = convertJsonToHtml({ json: document, model });
          if (error) return;
          payload = { html };
        }
        try {
          await doSave({ path, ...payload });
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
