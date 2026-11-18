import { EditorState, TextSelection } from 'da-y-wrapper';
import {
  parseRichText,
  schema,
  serializeRichText,
} from '../../../../../blocks/form/utils/rich-text/schema.js';

export { schema };

export function stateFor(value, { from, to } = {}) {
  const richTextDocument = parseRichText(value);
  const state = EditorState.create({ doc: richTextDocument, schema });
  if (from === undefined) {
    return state;
  }

  const selection = TextSelection.create(richTextDocument, from, to ?? from);
  return state.apply(state.tr.setSelection(selection));
}

export function run(command, state) {
  const transactions = [];
  const handled = command(state, (transaction) => transactions.push(transaction));
  const next = transactions.reduce((current, transaction) => current.apply(transaction), state);
  return { handled, state: next, html: serializeRichText(next.doc) };
}
