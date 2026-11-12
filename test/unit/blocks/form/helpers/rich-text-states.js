import * as proseMirror from 'da-y-wrapper';
import { createSchema } from '../../../../../blocks/form/utils/rich-text/schema.js';
import { createRichTextCodec } from '../../../../../blocks/form/utils/rich-text/codec.js';

export const schema = createSchema(proseMirror);

const codec = createRichTextCodec({ proseMirror, schema });

export function stateFor(value, { from, to } = {}) {
  const richTextDocument = codec.parse(value);
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
  return { handled, state: next, html: codec.serialize(next.doc) };
}
