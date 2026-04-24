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
import toggleLibrary from '../menu/toggleLibrary.js';
import insertTable from '../../table.js';
import { insertSectionBreak } from '../menu/menu.js';
import loremIpsum from './loremIpsum.js';
import { SUPPORTED_IMAGE_TYPES, uploadImageFile } from '../imageDrop.js';
import { t } from '../../../../shared/i18n.js';

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

const insertImage = (state, dispatch, argument, view) => {
  if (!view) return false;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = SUPPORTED_IMAGE_TYPES.join(',');
  input.addEventListener('change', () => {
    const [file] = input.files || [];
    if (!file) return;
    view.focus();
    uploadImageFile(view, file);
  });
  input.click();
  return true;
};

const items = () => [
  {
    title: t('edit.prose.slash.heading1'),
    command: (state, dispatch) => setHeading(state, dispatch, 1),
    class: 'menu-item-h1',
  },
  {
    title: t('edit.prose.slash.heading2'),
    command: (state, dispatch) => setHeading(state, dispatch, 2),
    class: 'menu-item-h2',
  },
  {
    title: t('edit.prose.slash.heading3'),
    command: (state, dispatch) => setHeading(state, dispatch, 3),
    class: 'menu-item-h3',
  },
  {
    title: t('edit.prose.slash.blockquote'),
    command: wrapInBlockquote,
    class: 'menu-item-blockquote',
  },
  {
    title: t('edit.prose.slash.codeBlock'),
    command: wrapInCodeBlock,
    class: 'menu-item-codeblock',
  },
  {
    title: t('edit.prose.slash.bulletList'),
    command: (state, dispatch) => wrapInList(state.schema.nodes.bullet_list)(state, dispatch),
    class: 'bullet-list',
  },
  {
    title: t('edit.prose.slash.orderedList'),
    command: (state, dispatch) => wrapInList(state.schema.nodes.ordered_list)(state, dispatch),
    class: 'ordered-list',
  },
  {
    title: t('edit.prose.slash.sectionBreak'),
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
    title: t('edit.prose.menu.block.label'),
    command: insertTable,
    class: 'insert-table',
    excludeFromTable: true,
  },
  {
    title: t('edit.prose.menu.library.label'),
    command: toggleLibrary,
    class: 'open-library',
  },
  {
    title: t('edit.prose.slash.insertImage'),
    command: insertImage,
    class: 'insert-image',
  },
];

const tableItems = () => [
  {
    title: t('edit.prose.slash.table.insertColumnAfter'),
    command: addColumnAfter,
    class: 'insert-column-right',
  },
  {
    title: t('edit.prose.slash.table.insertColumnBefore'),
    command: addColumnBefore,
    class: 'insert-column-left',
  },
  {
    title: t('edit.prose.slash.table.insertRowAfter'),
    command: addRowAfter,
    class: 'insert-row-after',
  },
  {
    title: t('edit.prose.slash.table.insertRowBefore'),
    command: addRowBefore,
    class: 'insert-row-before',
  },
  {
    title: t('edit.prose.slash.table.deleteRow'),
    command: deleteRow,
    class: 'delete-row',
  },
  {
    title: t('edit.prose.slash.table.deleteColumn'),
    command: deleteColumn,
    class: 'delete-column',
  },
  {
    title: t('edit.prose.slash.table.splitCell'),
    command: splitCell,
    class: 'split-cell',
  },
];

export const getTableItems = (state) => ([
  {
    title: t('edit.prose.slash.editBlock'),
    // prevent showing unavailable options.
    // item.command(state) does not commit the command, but returns whether it's available.
    submenu: tableItems().filter((item) => item.command(state)),
    class: 'table-options',
  },
  ...items().filter((item) => !item.excludeFromTable),
]);

export const getTableCellItems = (state) => ([
  {
    title: t('edit.prose.slash.mergeCells'),
    command: mergeCells,
    class: 'merge-cells',
    enabled: mergeCells(state),
  },
].filter((x) => x.enabled !== false));

export const getDefaultItems = () => items();
