import {
  BLOCK_TYPES,
  getActiveMarks,
  getBlockType,
  getListType,
  insertHardBreak,
  isInBlockquote,
  removeLink,
  requestLink,
  setBlock,
  toggleBlockquote,
  toggleList,
} from './commands.js';

/** The tool ids. Toggle tools are named after the mark or node they apply. */
export const TOOL_IDS = Object.freeze({
  undo: 'undo',
  redo: 'redo',
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strikethrough: 's',
  link: 'link',
  unlink: 'unlink',
  code: 'code',
  orderedList: 'ordered_list',
  bulletList: 'bullet_list',
  blockquote: 'blockquote',
  superscript: 'sup',
  subscript: 'sub',
});

/**
 * Builds a check for a mark at the selection.
 * @param {string} name The mark name.
 * @returns {(state: object) => boolean} Whether the selection has the mark.
 */
const hasMark = (name) => (state) => getActiveMarks(state).has(name);

/**
 * Builds a check for the innermost list at the selection.
 * @param {string} name The list node name.
 * @returns {(state: object) => boolean} Whether the selection is in such a list.
 */
const isInList = (name) => (state) => getListType(state)?.name === name;

/**
 * Creates the tools of a rich-text editor, bound to its ProseMirror.
 * @param {object} options The editor.
 * @param {object} options.proseMirror The da-y-wrapper namespace.
 * @param {object} options.schema The schema built from `SCHEMA_SPEC`.
 * @param {() => void} options.onLink Opens the link dialog.
 * @returns {import('../../fields/rich-text-toolbar.js').Toolset} The tools.
 */
export function createToolset({ proseMirror, schema, onLink }) {
  const markTool = (tool) => ({
    ...tool,
    command: proseMirror.toggleMark(schema.marks[tool.id]),
    isActive: hasMark(tool.id),
  });
  const listTool = (tool) => ({
    ...tool,
    command: toggleList({ proseMirror, name: tool.id }),
    isActive: isInList(tool.id),
  });

  return {
    leading: [
      { id: TOOL_IDS.undo, label: 'Undo', keys: 'Mod-z', icon: 'undo', command: proseMirror.undo },
      { id: TOOL_IDS.redo, label: 'Redo', keys: 'Mod-Shift-z', icon: 'redo', command: proseMirror.redo },
    ],
    picker: {
      label: 'Text style',
      items: BLOCK_TYPES,
      getValue: getBlockType,
      isEnabled: (state) => !getListType(state),
      commandFor: (value) => setBlock({ proseMirror, value }),
    },
    groups: [
      [
        markTool({ id: TOOL_IDS.bold, label: 'Bold', keys: 'Mod-b', icon: 'tagbold' }),
        markTool({ id: TOOL_IDS.italic, label: 'Italic', keys: 'Mod-i', icon: 'tagitalic' }),
        markTool({ id: TOOL_IDS.underline, label: 'Underline', icon: 'tagunderline' }),
        markTool({ id: TOOL_IDS.strikethrough, label: 'Strikethrough', icon: 'tagstrikethrough' }),
      ],
      [
        {
          id: TOOL_IDS.link,
          label: 'Link',
          keys: 'Mod-k',
          icon: 'link',
          command: requestLink({ onLink }),
          isActive: hasMark(TOOL_IDS.link),
        },
        {
          id: TOOL_IDS.unlink,
          label: 'Remove link',
          icon: 'unlink',
          command: removeLink,
          isVisible: hasMark(TOOL_IDS.link),
        },
      ],
      [
        listTool({ id: TOOL_IDS.orderedList, label: 'Numbered list', keys: 'Ctrl-Shift-9', icon: 'listnumbered' }),
        listTool({ id: TOOL_IDS.bulletList, label: 'Bulleted list', keys: 'Ctrl-Shift-8', icon: 'listbulleted' }),
      ],
    ],
    menuGroups: [
      [
        {
          id: TOOL_IDS.blockquote,
          label: 'Blockquote',
          keys: 'Ctrl->',
          icon: 'blockquote',
          command: toggleBlockquote({ proseMirror }),
          isActive: isInBlockquote,
        },
      ],
      [
        markTool({ id: TOOL_IDS.code, label: 'Inline code', keys: 'Mod-`', icon: 'code' }),
        markTool({ id: TOOL_IDS.superscript, label: 'Superscript', icon: 'textsuperscript' }),
        markTool({ id: TOOL_IDS.subscript, label: 'Subscript', icon: 'textsubscript' }),
      ],
    ],
  };
}

/**
 * Lists every tool of a toolset, on the bar and in the more menu.
 * @param {import('../../fields/rich-text-toolbar.js').Toolset} toolset The tools.
 * @returns {import('../../fields/rich-text-toolbar.js').ToolbarTool[]} The tools.
 */
export const listTools = ({ leading, groups, menuGroups }) => [
  ...leading, ...groups.flat(), ...menuGroups.flat(),
];

/**
 * Binds the shortcut of each tool that has one.
 * @param {import('../../fields/rich-text-toolbar.js').Toolset} toolset The tools.
 * @returns {Record<string, import('./commands.js').RichTextCommand>} The commands by key.
 */
const toolShortcuts = (toolset) => Object.fromEntries(listTools(toolset)
  .filter((tool) => tool.keys)
  .map((tool) => [tool.keys, tool.command]));

/**
 * Binds Ctrl+Shift+0 to the paragraph and Ctrl+Shift+1 to 6 to the headings.
 * @param {import('../../fields/rich-text-toolbar.js').ToolbarPicker} picker The text style picker.
 * @returns {Record<string, import('./commands.js').RichTextCommand>} The commands by key.
 */
const textStyleShortcuts = (picker) => Object.fromEntries(BLOCK_TYPES
  .map(({ value, attrs }) => [`Ctrl-Shift-${attrs?.level ?? 0}`, picker.commandFor(value)]));

/**
 * Builds the shortcuts of the field, which match the Canvas editor.
 * @param {object} options The editor.
 * @param {object} options.proseMirror The da-y-wrapper namespace.
 * @param {object} options.schema The schema built from `SCHEMA_SPEC`.
 * @param {import('../../fields/rich-text-toolbar.js').Toolset} options.toolset The tools.
 * @returns {Record<string, import('./commands.js').RichTextCommand>} The commands by key.
 */
export function buildKeymap({ proseMirror, schema, toolset }) {
  const listItem = schema.nodes.list_item;
  return {
    ...toolShortcuts(toolset),
    ...textStyleShortcuts(toolset.picker),
    'Mod-y': proseMirror.redo,
    Enter: proseMirror.splitListItem(listItem),
    'Shift-Enter': insertHardBreak,
    'Mod-Enter': insertHardBreak,
    Tab: proseMirror.sinkListItem(listItem),
    'Shift-Tab': proseMirror.liftListItem(listItem),
  };
}
