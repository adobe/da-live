import {
  setBlockType,
  wrapIn,
  wrapInList,
  addColumnBefore,
  addColumnAfter,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  mergeCells,
  splitCell,
} from 'da-y-wrapper';
import openLibrary from '../../../da-library/da-library.js';
import insertTable from '../../table.js';
import { insertSectionBreak } from '../menu.js';
import loremIpsum from './loremIpsum.js';

const setHeading = (state, dispatch, level) => {
  const type = state.schema.nodes.heading;
  return setBlockType(type, { level })(state, dispatch);
};

const wrapInBlockquote = (state, dispatch) => {
  const { blockquote } = state.schema.nodes;
  return wrapIn(blockquote)(state, dispatch);
};

const wrapInCodeBlock = (state, dispatch) => {
  // eslint-disable-next-line camelcase
  const { code_block } = state.schema.nodes;
  return setBlockType(code_block)(state, dispatch);
};

const items = [
  {
    title: 'Heading 1',
    command: (state, dispatch) => setHeading(state, dispatch, 1),
    class: 'menu-item-h1',
  },
  {
    title: 'Heading 2',
    command: (state, dispatch) => setHeading(state, dispatch, 2),
    class: 'menu-item-h2',
  },
  {
    title: 'Heading 3',
    command: (state, dispatch) => setHeading(state, dispatch, 3),
    class: 'menu-item-h3',
  },
  {
    title: 'Blockquote',
    command: wrapInBlockquote,
    class: 'menu-item-blockquote',
  },
  {
    title: 'Code block',
    command: wrapInCodeBlock,
    class: 'menu-item-codeblock',
  },
  {
    title: 'Bullet list',
    command: (state, dispatch) => wrapInList(state.schema.nodes.bullet_list)(state, dispatch),
    class: 'bullet-list',
  },
  {
    title: 'Numbered list',
    command: (state, dispatch) => wrapInList(state.schema.nodes.ordered_list)(state, dispatch),
    class: 'ordered-list',
  },
  {
    title: 'Section break',
    command: insertSectionBreak,
    class: 'edit-hr',
    excludeFromTable: true,
  },
  {
    title: 'Lorem ipsum',
    command: loremIpsum,
    class: 'lorem-ipsum',
    argument: true,
  },
  {
    title: 'Table',
    command: insertTable,
    class: 'insert-table',
    excludeFromTable: true,
  },
  {
    title: 'Library',
    command: openLibrary,
    class: 'open-library',
  },
];

const tableItems = [
  {
    title: 'Add Column After',
    command: addColumnAfter,
    class: 'insert-column-right',
  },
  {
    title: 'Add Column Before',
    command: addColumnBefore,
    class: 'insert-column-left',
  },
  {
    title: 'Add Row After',
    command: addRowAfter,
    class: 'insert-row-after',
  },
  {
    title: 'Add Row Before',
    command: addRowBefore,
    class: 'insert-row-before',
  },
  {
    title: 'Delete Row',
    command: deleteRow,
    class: 'delete-row',
  },
  {
    title: 'Delete Column',
    command: deleteColumn,
    class: 'delete-column',
  },
  {
    title: 'Split Cell',
    command: splitCell,
    class: 'split-cell',
  },
];

export const getTableItems = (state) => ([
  {
    title: 'Edit Block',
    // prevent showing unavailable options.
    // item.command(state) does not commit the command, but returns whether it's available.
    submenu: tableItems.filter((item) => item.command(state)),
    class: 'table-options',
  },
  ...items.filter((item) => !item.excludeFromTable),
]);

export const getTableCellItems = (state) => ([
  {
    title: 'Merge Cells',
    command: mergeCells,
    class: 'merge-cells',
    enabled: mergeCells(state),
  },
].filter((x) => x.enabled !== false));

export const getDefaultItems = () => items;
