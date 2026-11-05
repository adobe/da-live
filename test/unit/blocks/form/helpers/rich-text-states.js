import * as proseMirror from 'da-y-wrapper';
import { SCHEMA_SPEC } from '../../../../../blocks/form/utils/rich-text/schema.js';
import { parseRichText, serializeRichText } from '../../../../../blocks/form/utils/rich-text/html.js';

/** The schema of rich-text fields. */
export const schema = new proseMirror.Schema(SCHEMA_SPEC);

/**
 * Creates an editor state with history for HTML.
 * @param {string} value The HTML.
 * @param {{ from?: number, to?: number }} [selection] The selection, the document start
 *   when left out.
 * @returns {object} The editor state.
 */
export function stateFor(value, { from, to } = {}) {
  const richTextDocument = parseRichText({ proseMirror, schema, value });
  const plugins = [proseMirror.history()];
  const state = proseMirror.EditorState.create({ doc: richTextDocument, schema, plugins });
  if (from === undefined) {
    return state;
  }

  const selection = proseMirror.TextSelection.create(richTextDocument, from, to ?? from);
  return state.apply(state.tr.setSelection(selection));
}

/**
 * Runs a command and applies what it dispatched.
 * @param {import('../../../../../blocks/form/utils/rich-text/commands.js').RichTextCommand}
 *   command The command.
 * @param {object} state The editor state.
 * @returns {{ handled: boolean, state: object, html: string }} Whether it applied, and the
 *   resulting state and value.
 */
export function run(command, state) {
  const transactions = [];
  const handled = command(state, (transaction) => transactions.push(transaction));
  const next = transactions.reduce((current, transaction) => current.apply(transaction), state);
  return { handled, state: next, html: serializeRichText({ richTextDocument: next.doc }) };
}
