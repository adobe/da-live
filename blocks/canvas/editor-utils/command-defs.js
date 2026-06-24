/* eslint-disable import/no-unresolved -- importmap */
import { DOMParser, Fragment } from 'da-y-wrapper';
import {
  blockType,
  wrap,
  list,
  inlineMark,
  sinkListLevel,
  liftListLevel,
  markIsActive,
  inList,
  canSinkList,
  canLiftList,
  getTableHeading,
  getTableBody,
  LOREM_SENTENCES,
  addTableColumnLeft,
  addTableColumnRight,
  addTableRowAbove,
  addTableRowBelow,
  deleteTableColumn,
  deleteTableRow,
  mergeTableCells,
  splitTableCell,
  inTable,
  canMergeCells,
  canSplitCell,
  isImageNodeSelected,
  selectionHasLink,
  removeLink,
} from './command-helpers.js';
import { openLinkDialog, openAltDialog, triggerAddImage } from './selection-toolbar.js';

const notImageSelected = (state) => !isImageNodeSelected(state);

/** Spectrum icon stem for `/img/icons/s2-icon-{stem}-20-n.svg` */
const iconName = (name) => name.replace(/-/g, '').toLowerCase();

export const COMMANDS = [
  // Toolbar: inline mark buttons
  {
    id: 'strong',
    label: 'Bold',
    schema: 'strong',
    icon: iconName('TagBold'),
    showIn: ['toolbar-marks'],
    visible: notImageSelected,
    active: (state) => markIsActive(state, 'strong'),
    apply: inlineMark('strong'),
  },
  {
    id: 'em',
    label: 'Italic',
    schema: 'em',
    icon: iconName('TagItalic'),
    showIn: ['toolbar-marks'],
    visible: notImageSelected,
    active: (state) => markIsActive(state, 'em'),
    apply: inlineMark('em'),
  },
  {
    id: 'code',
    label: 'Inline code',
    schema: 'code',
    icon: iconName('Code'),
    showIn: ['toolbar-marks'],
    visible: notImageSelected,
    active: (state) => markIsActive(state, 'code'),
    apply: inlineMark('code'),
  },
  {
    id: 'underline',
    label: 'Underline',
    schema: 'u',
    icon: iconName('TagUnderline'),
    showIn: ['toolbar-marks'],
    visible: notImageSelected,
    active: (state) => markIsActive(state, 'u'),
    apply: inlineMark('u'),
  },
  {
    id: 'strikethrough',
    label: 'Strikethrough',
    schema: 's',
    icon: iconName('TagStrikeThrough'),
    showIn: ['toolbar-marks'],
    visible: notImageSelected,
    active: (state) => markIsActive(state, 's'),
    apply: inlineMark('s'),
  },
  {
    id: 'sup',
    label: 'Superscript',
    schema: 'sup',
    icon: iconName('TextSuperscript'),
    showIn: ['toolbar-marks'],
    visible: notImageSelected,
    active: (state) => markIsActive(state, 'sup'),
    apply: inlineMark('sup'),
  },
  {
    id: 'sub',
    label: 'Subscript',
    schema: 'sub',
    icon: iconName('TextSubscript'),
    showIn: ['toolbar-marks'],
    visible: notImageSelected,
    active: (state) => markIsActive(state, 'sub'),
    apply: inlineMark('sub'),
  },

  // Toolbar: block-type picker
  {
    id: 'paragraph',
    label: 'Paragraph',
    schema: 'paragraph',
    showIn: ['toolbar-picker'],
    visible: notImageSelected,
    apply: blockType('paragraph'),
  },
  {
    id: 'heading-1',
    label: 'Heading 1',
    icon: iconName('Heading1'),
    schema: 'heading',
    showIn: ['toolbar-picker', 'slash-text'],
    visible: notImageSelected,
    apply: blockType('heading', { level: 1 }),
  },
  {
    id: 'heading-2',
    label: 'Heading 2',
    icon: iconName('Heading2'),
    schema: 'heading',
    showIn: ['toolbar-picker', 'slash-text'],
    visible: notImageSelected,
    apply: blockType('heading', { level: 2 }),
  },
  {
    id: 'heading-3',
    label: 'Heading 3',
    icon: iconName('Heading3'),
    schema: 'heading',
    showIn: ['toolbar-picker', 'slash-text'],
    visible: notImageSelected,
    apply: blockType('heading', { level: 3 }),
  },
  {
    id: 'heading-4',
    label: 'Heading 4',
    icon: iconName('Heading4'),
    schema: 'heading',
    showIn: ['toolbar-picker', 'slash-text'],
    visible: notImageSelected,
    apply: blockType('heading', { level: 4 }),
  },
  {
    id: 'heading-5',
    label: 'Heading 5',
    icon: iconName('Heading5'),
    schema: 'heading',
    showIn: ['toolbar-picker', 'slash-text'],
    visible: notImageSelected,
    apply: blockType('heading', { level: 5 }),
  },
  {
    id: 'heading-6',
    label: 'Heading 6',
    icon: iconName('Heading6'),
    schema: 'heading',
    showIn: ['toolbar-picker', 'slash-text'],
    visible: notImageSelected,
    apply: blockType('heading', { level: 6 }),
  },
  {
    id: 'code-block',
    label: 'Code block',
    icon: iconName('BlockCode'),
    schema: 'code_block',
    showIn: ['toolbar-picker', 'slash-text'],
    visible: notImageSelected,
    disabled: (state) => state.selection.$from.parent.type.name === 'code_block',
    apply: blockType('code_block'),
  },

  // Toolbar: structure buttons
  {
    id: 'blockquote',
    label: 'Blockquote',
    icon: iconName('BlockQuote'),
    schema: 'blockquote',
    showIn: ['toolbar-structure', 'slash-text'],
    visible: notImageSelected,
    apply: wrap('blockquote'),
  },
  {
    id: 'bullet-list',
    label: 'Bullet list',
    icon: iconName('ListBulleted'),
    schema: 'bullet_list',
    showIn: ['toolbar-structure', 'slash-text'],
    visible: (state) => notImageSelected(state) && !inList(state.selection.$from),
    apply: list('bullet_list'),
  },
  {
    id: 'numbered-list',
    label: 'Numbered list',
    icon: iconName('ListNumbered'),
    schema: 'ordered_list',
    showIn: ['toolbar-structure', 'slash-text'],
    visible: (state) => notImageSelected(state) && !inList(state.selection.$from),
    apply: list('ordered_list'),
  },
  {
    id: 'list-indent',
    label: 'Indent list',
    icon: iconName('TextIndentIncrease'),
    showIn: ['toolbar-structure'],
    visible: (state) => notImageSelected(state) && inList(state.selection.$from),
    disabled: (state) => !canSinkList(state),
    apply: sinkListLevel,
  },
  {
    id: 'list-outdent',
    label: 'Outdent list',
    icon: iconName('TextIndentDecrease'),
    showIn: ['toolbar-structure'],
    visible: (state) => notImageSelected(state) && inList(state.selection.$from),
    disabled: (state) => !canLiftList(state),
    apply: liftListLevel,
  },

  // Toolbar: table block structure (visible inside tables only)
  {
    id: 'table-add-column-left',
    label: 'Add column left',
    icon: iconName('tablecolumnaddleft'),
    showIn: ['toolbar-table'],
    visible: inTable,
    apply: addTableColumnLeft,
  },
  {
    id: 'table-add-column-right',
    label: 'Add column right',
    icon: iconName('tablecolumnaddright'),
    showIn: ['toolbar-table'],
    visible: inTable,
    apply: addTableColumnRight,
  },
  {
    id: 'table-add-row-above',
    label: 'Add row above',
    icon: iconName('tablerowaddtop'),
    showIn: ['toolbar-table'],
    visible: inTable,
    apply: addTableRowAbove,
  },
  {
    id: 'table-add-row-below',
    label: 'Add row below',
    icon: iconName('tablerowaddbottom'),
    showIn: ['toolbar-table'],
    visible: inTable,
    apply: addTableRowBelow,
  },
  {
    id: 'table-delete-column',
    label: 'Delete column',
    icon: iconName('tablecolumnremove'),
    showIn: ['toolbar-table'],
    visible: inTable,
    apply: deleteTableColumn,
  },
  {
    id: 'table-delete-row',
    label: 'Delete row',
    icon: iconName('tablerowremove'),
    showIn: ['toolbar-table'],
    visible: inTable,
    apply: deleteTableRow,
  },
  {
    id: 'table-merge-cells',
    label: 'Merge cells',
    icon: iconName('tablemergecells'),
    showIn: ['toolbar-table'],
    visible: canMergeCells,
    apply: mergeTableCells,
  },
  {
    id: 'table-split-cell',
    label: 'Split cell',
    icon: iconName('tablesplitcell'),
    showIn: ['toolbar-table'],
    visible: canSplitCell,
    apply: splitTableCell,
  },

  // Toolbar: link buttons
  {
    id: 'link-create',
    label: 'Create link',
    icon: 'link',
    showIn: ['toolbar-link'],
    visible: (state) => !selectionHasLink(state),
    apply: openLinkDialog,
  },
  {
    id: 'link-edit',
    label: 'Edit link',
    icon: 'link',
    showIn: ['toolbar-link'],
    visible: selectionHasLink,
    apply: openLinkDialog,
  },
  {
    id: 'link-remove',
    label: 'Remove link',
    icon: 'unlink',
    showIn: ['toolbar-link'],
    visible: selectionHasLink,
    apply: removeLink,
  },

  // Toolbar: image commands
  {
    id: 'image-alt-text',
    label: 'Edit alt text',
    icon: iconName('imagetext'),
    showIn: ['toolbar-image'],
    visible: isImageNodeSelected,
    apply: openAltDialog,
  },
  {
    id: 'image-add',
    label: 'Add image',
    icon: iconName('imageadd'),
    showIn: ['toolbar-image'],
    apply: triggerAddImage,
  },

  // Slash menu: text section only
  {
    id: 'section-break',
    label: 'Section break',
    icon: iconName('Separator'),
    showIn: ['slash-text'],
    apply: (view) => {
      const div = document.createElement('div');
      div.append(document.createElement('hr'), document.createElement('p'));
      const nodes = DOMParser.fromSchema(view.state.schema).parse(div);
      view.dispatch(view.state.tr.replaceSelectionWith(nodes));
    },
  },
  {
    id: 'lorem-ipsum',
    label: 'Lorem ipsum',
    icon: iconName('Rail'),
    showIn: ['slash-text'],
    apply: (view) => {
      const { $cursor } = view.state.selection;
      if (!$cursor) return;
      const text = Array.from(
        { length: 5 },
        (_, i) => LOREM_SENTENCES[i % LOREM_SENTENCES.length],
      ).join('  ');
      view.dispatch(
        view.state.tr.replaceWith($cursor.before(), $cursor.pos, view.state.schema.text(text)),
      );
    },
  },

  // Slash menu: blocks section
  {
    id: 'open-library',
    label: 'Open block library',
    icon: iconName('CCLibrary'),
    showIn: ['slash-blocks'],
    apply: async (view) => {
      const { insertBlock } = await import('../ew-panel-extensions/helpers.js');
      const { openBlockLibraryModal } = await import('../ew-block-library-modal/ew-block-library-modal.js');
      openBlockLibraryModal({ onInsert: (dom) => insertBlock(view, dom) });
    },
  },
  {
    id: 'insert-block',
    label: 'Insert block',
    icon: iconName('TableAdd'),
    showIn: ['slash-blocks'],
    apply: (view) => {
      const { state } = view;
      const heading = getTableHeading(state.schema);
      const body = getTableBody(state.schema);
      const frag = document.createDocumentFragment();
      frag.append(document.createElement('p'));
      const para = DOMParser.fromSchema(state.schema).parse(frag);
      const node = state.schema.nodes.table.create(null, Fragment.fromArray([heading, body]));
      const trx = state.tr.insert(state.selection.head, para);
      trx.replaceSelectionWith(node).scrollIntoView();
      view.dispatch(trx);
    },
  },
];

export function commandsFor(showIn) {
  return COMMANDS.filter((c) => c.showIn.includes(showIn));
}

export const COMMAND_BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

const SLASH_GROUPS = [
  { section: 'Blocks', showIn: 'slash-blocks' },
  { section: 'Text', showIn: 'slash-text' },
];

export function slashMenuItemsForQuery(query) {
  const q = (query || '').toLowerCase();
  const groups = SLASH_GROUPS
    .map(({ section, showIn }) => ({
      section,
      items: commandsFor(showIn).filter((i) => !q || i.label.toLowerCase().startsWith(q)),
    }))
    .filter((g) => g.items.length > 0);
  return groups.flatMap(({ section, items }) => [{ section }, ...items]);
}
