/*
eslint-disable no-continue
*/
import { Plugin } from 'da-y-wrapper';

const MAX_MATCH = 500;

/**
 * This is just a copy of the private run() method from inputrules
 */
function run(view, from, to, text, rules, plugin) {
  if (view.composing) return false;
  // eslint-disable-next-line prefer-destructuring
  const state = view.state;
  const $from = state.doc.resolve(from);

  const textBefore = $from.parent.textBetween(
    Math.max(0, $from.parentOffset - MAX_MATCH),
    $from.parentOffset,
    null,
    '\ufffc',
  ) + text;
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    if ($from.parent.type.spec.code) {
      // eslint-disable-next-line no-continue
      if (!rule.inCode) continue;
    } else if (rule.inCode === 'only') {
      continue;
    }
    const match = rule.match.exec(textBefore);
    const tr = match && rule.handler(state, match, from - (match[0].length - text.length), to);
    if (!tr) continue;
    if (rule.undoable) tr.setMeta(plugin, {transform: tr, from, to, text});
    view.dispatch(tr);
    return true;
  }
  return false;
}

/**
 * This is a variant to the inpurRules method that only kicks into action if 'enter' was pressed.
 */
export default function enterInputRules({ rules }) {
  const plugin = new Plugin({
    state: {
      init() { return null; },
      apply(tr, prev) {
        const stored = tr.getMeta(this);
        if (stored) return stored;
        return tr.selectionSet || tr.docChanged ? null : prev;
      },
    },

    props: {
      handleTextInput(view, from, to, text) {
        return run(view, from, to, text, rules, plugin);
      },
      handleDOMEvents: {
        compositionend: (view) => {
          setTimeout(() => {
            const { $cursor } = view.state.selection;
            if ($cursor) run(view, $cursor.pos, $cursor.pos, '', rules, plugin);
          });
        },
      },
      handleKeyDown(view, event) {
        if (event.key !== 'Enter') return false;
        const { $cursor } = view.state.selection;
        if ($cursor) return run(view, $cursor.pos, $cursor.pos, '\n', rules, plugin);
        return false;
      },
    },

    isInputRules: true,
  });
  return plugin;
}
