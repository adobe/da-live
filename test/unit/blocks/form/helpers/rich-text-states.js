import * as proseMirror from 'da-y-wrapper';
import { createSchema } from '../../../../../blocks/form/utils/rich-text/schema.js';
import { parseRichText, serializeRichText } from '../../../../../blocks/form/utils/rich-text/html.js';

export const schema = createSchema(proseMirror);

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

export function run(command, state) {
  const transactions = [];
  const handled = command(state, (transaction) => transactions.push(transaction));
  const next = transactions.reduce((current, transaction) => current.apply(transaction), state);
  return { handled, state: next, html: serializeRichText({ richTextDocument: next.doc }) };
}
