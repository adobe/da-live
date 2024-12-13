import { setBlockType, wrapIn, wrapInList } from 'da-y-wrapper';
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
    title: 'Heading-1',
    command: (state, dispatch) => setHeading(state, dispatch, 1),
    class: 'menu-item-h1',
  },
  {
    title: 'Heading-2',
    command: (state, dispatch) => setHeading(state, dispatch, 2),
    class: 'menu-item-h2',
  },
  {
    title: 'Heading-3',
    command: (state, dispatch) => setHeading(state, dispatch, 3),
    class: 'menu-item-h3',
  },
  {
    title: 'Blockquote',
    command: wrapInBlockquote,
    class: 'menu-item-blockquote',
  },
  {
    title: 'CodeBlock',
    command: wrapInCodeBlock,
    class: 'menu-item-codeblock',
  },
  {
    title: 'BulletList',
    command: (state, dispatch) => wrapInList(state.schema.nodes.bullet_list)(state, dispatch),
    class: 'bullet-list',
  },
  {
    title: 'NumberedList',
    command: (state, dispatch) => wrapInList(state.schema.nodes.ordered_list)(state, dispatch),
    class: 'ordered-list',
  },
  {
    title: 'Section-Break',
    command: insertSectionBreak,
    class: 'edit-hr',
  },
  {
    title: 'Lorem-Ipsum',
    command: loremIpsum,
    class: 'lorem-ipsum',
    argument: true,
  },
  {
    title: 'Table',
    command: insertTable,
    class: 'insert-table',
  },
  {
    title: 'Library',
    command: openLibrary,
    class: 'open-library',
  },
];

export default items;
