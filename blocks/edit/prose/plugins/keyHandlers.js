import {
  DOMParser,
  TextSelection,
  goToNextCell,
  selectedRect,
  isInTable,
  addRowAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
  InputRule,
  inputRules,
  wrappingInputRule,
  yUndo,
  yRedo,
} from 'da-y-wrapper';
import { isURL } from '../../utils/helpers.js';

export function getURLInputRule() {
  return new InputRule(
    /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)\s$/,
    (state, match, start, end) => {
      const url = match[0].trim();

      if (!isURL(url)) {
        return null;
      }

      const linkMark = state.schema.marks.link.create({ href: url });

      // Replace the URL text with linked version, keeping the space
      const { tr } = state;
      tr.delete(start, end);
      tr.insert(start, state.schema.text(url, [linkMark]));
      tr.insert(start + url.length, state.schema.text(' '));

      return tr;
    },
  );
}

export function getDashesInputRule(dispatchTransaction) {
  return new InputRule(
    /^---[\n]$/,
    (state, match, start, end) => {
      const div = document.createElement('div');
      div.append(document.createElement('hr'));
      const newNodes = DOMParser.fromSchema(state.schema).parse(div);

      const selection = TextSelection.create(state.doc, start, end);
      dispatchTransaction(state.tr.setSelection(selection).replaceSelectionWith(newNodes));
    },
  );
}

// This function returns a modified inputrule plugin that triggers when the regex in the
// rule matches and the Enter key is pressed
export function getEnterInputRulesPlugin(dispatchTransaction) {
  const irsplugin = inputRules({ rules: [getDashesInputRule(dispatchTransaction)] });

  const hkd = (view, event) => {
    if (event.key !== 'Enter') return false;
    const { $cursor } = view.state.selection;
    if ($cursor) return irsplugin.props.handleTextInput(view, $cursor.pos, $cursor.pos, '\n');
    return false;
  };
  irsplugin.props.handleKeyDown = hkd; // Add the handleKeyDown function

  return irsplugin;
}

// Returns a standard inputRules plugin for URL auto-linking on space
export function getURLInputRulesPlugin() {
  return inputRules({ rules: [getURLInputRule()] });
}

// Returns an inputRules plugin for auto-creating bullet and ordered lists
export function getListInputRulesPlugin(schema) {
  const rules = [
    wrappingInputRule(/^\s*1[.)]\s$/, schema.nodes.ordered_list),
    wrappingInputRule(/^\s*([-*])\s$/, schema.nodes.bullet_list),
  ];
  return inputRules({ rules });
}

const isRowSelected = (rect) => rect.left === 0 && rect.right === rect.map.width;

const isColumnSelected = (rect) => rect.top === 0 && rect.bottom === rect.map.height;

const isTableSelected = (rect) => isRowSelected(rect) && isColumnSelected(rect);

export function handleTableBackspace(state, dispatch) {
  if (!isInTable(state) || !state.selection.$anchorCell) return false;

  const rect = selectedRect(state);
  if (!rect || rect.top === null) return false;

  const cellSelection = state.selection.$anchor.node(1)?.type.name === 'table';

  if (cellSelection) {
    if (isTableSelected(rect)) {
      deleteTable(state, dispatch);
      return true;
    }
    if (isRowSelected(rect)) {
      deleteRow(state, dispatch);
      return true;
    }
    if (isColumnSelected(rect)) {
      deleteColumn(state, dispatch);
      return true;
    }
  }

  return false;
}

export function handleTableTab(direction) {
  const isCursorInLastTableCell = (rect) => {
    const { left, bottom } = rect;
    const { height, width } = rect.map;
    return left + 1 === width && bottom === height;
  };

  const gtnc = goToNextCell(direction);
  return (state, dispatch) => {
    if (!isInTable(state)) return false;
    const rect = selectedRect(state);
    if (isCursorInLastTableCell(rect)) {
      addRowAfter(state, dispatch);
      return gtnc(window.view.state, dispatch);
    }
    return gtnc(state, dispatch);
  };
}

const forceMenuUpdate = () => {
  // Dispatch an empty transaction that will trigger the full view update cycle
  setTimeout(() => {
    const { tr } = window.view.state;
    window.view.dispatch(tr);
  }, 0);
};

const runWithMenuUpdate = (cmd, state) => {
  const result = cmd(state);
  if (result) forceMenuUpdate();
  return result;
};

export const handleUndo = (state) => runWithMenuUpdate(yUndo, state);
export const handleRedo = (state) => runWithMenuUpdate(yRedo, state);
