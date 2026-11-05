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
import { saveSourceHtml } from './da-api.js';

/**
 * Saves the engine's document as HTML whenever it changes. The engine's model is passed
 * to the SDK, so asset fields are written as images that EDS ingests and other files as
 * links.
 * @param {object} editor The engine, see `createEngine`.
 * @param {object} [options] The save settings.
 * @param {string} options.path The path of the source document.
 * @param {Function} [options.save] Saves the HTML, see `saveSourceHtml`.
 * @param {() => object|undefined} [options.getConfig] Returns the SDK writer `config`,
 *   such as `externalImagesAsLinks`. It is read on every save.
 * @returns {{ notify: () => void, detach: () => void }} Saves after a change, and stops
 *   saving.
 */
export function attachPersistence(editor, {
  path,
  save = saveSourceHtml,
  getConfig = () => undefined,
} = {}) {
  let inFlight = false;
  let pending = false;
  let lastValues = editor.getState()?.document;
  let detached = false;

  /**
   * Saves the latest document, one request at a time. A change during a save marks the
   * document as pending, so the loop saves again with the latest document once the
   * current save settles. A conversion or save error ends the loop until the next change.
   * @returns {Promise<void>} Settles once no save is in flight.
   */
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
        if (error) {
          return;
        }

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
    /**
     * Saves when the document changed. The shell's onChange calls this after every state
     * transition. Mutations are detected by reference comparison on the document, because
     * mutate.js deep-clones on every real mutation, so a new reference means new content.
     */
    notify: () => {
      if (detached) {
        return;
      }

      const next = editor.getState()?.document;
      if (next === lastValues) {
        return;
      }

      lastValues = next;
      persist();
    },
    /** Stops saving, so later changes are ignored. */
    detach: () => {
      detached = true;
    },
  };
}
