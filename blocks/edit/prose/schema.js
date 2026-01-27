/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/*
 * IMPORTANT:
 * Until getSchema() is separated into its own module,
 * these files need to be kept in-sync:
 *
 * da-live /blocks/edit/prose/schema.js
 * da-collab /src/schema.js
 *
 * Note that the import locations are different between the two files
 * but otherwise the files should be identical.
 */

import { addListNodes, Schema, tableNodes } from 'da-y-wrapper';

function parseLocDOM(locTag) {
  return [
    {
      tag: locTag,
      contentElement: (dom) => dom,
    },
  ];
}

const topLevelAttrs = {
  dataId: { default: null, validate: 'string|null' },
  daDiffAdded: { default: null, validate: 'string|null' },
};

const getTopLevelToDomAttrs = (node) => {
  const attrs = {};
  if (node.attrs.dataId != null) attrs['data-id'] = node.attrs.dataId;
  if (node.attrs.daDiffAdded === '') attrs['da-diff-added'] = '';
  return attrs;
};

const getTopLevelParseAttrs = (dom) => ({
  dataId: dom.getAttribute('dataId') ?? null,
  daDiffAdded: dom.getAttribute('da-diff-added') ?? null,
});

const getHeadingAttrs = (level) => (dom) => ({
  level,
  ...getTopLevelParseAttrs(dom),
});

/* Base nodes taken from prosemirror-schema-basic */
const baseNodes = {
  doc: { content: 'block+' },
  paragraph: {
    attrs: { ...topLevelAttrs },
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p', getAttrs: getTopLevelParseAttrs }],
    toDOM(node) {
      return ['p', { ...getTopLevelToDomAttrs(node) }, 0];
    },
  },
  blockquote: {
    attrs: { ...topLevelAttrs },
    content: 'block+',
    group: 'block',
    defining: true,
    parseDOM: [{ tag: 'blockquote', getAttrs: getTopLevelParseAttrs }],
    toDOM(node) {
      return ['blockquote', { ...getTopLevelToDomAttrs(node) }, 0];
    },
  },
  horizontal_rule: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM() {
      return ['hr'];
    },
  },
  heading: {
    attrs: {
      level: { default: 1 },
      ...topLevelAttrs,
    },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [
      { tag: 'h1', getAttrs: getHeadingAttrs(1) },
      { tag: 'h2', getAttrs: getHeadingAttrs(2) },
      { tag: 'h3', getAttrs: getHeadingAttrs(3) },
      { tag: 'h4', getAttrs: getHeadingAttrs(4) },
      { tag: 'h5', getAttrs: getHeadingAttrs(5) },
      { tag: 'h6', getAttrs: getHeadingAttrs(6) },
    ],
    toDOM(node) {
      return [`h${node.attrs.level}`, { ...getTopLevelToDomAttrs(node) }, 0];
    },
  },
  code_block: {
    attrs: { ...topLevelAttrs },
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    parseDOM: [{ tag: 'pre', preserveWhitespace: 'full', getAttrs: getTopLevelParseAttrs }],
    toDOM(node) {
      return ['pre', { ...getTopLevelToDomAttrs(node) }, ['code', 0]];
    },
  },
  text: { group: 'inline' },
  // due to bug in y-prosemirror, add href to image node
  // which will be converted to a wrapping <a> tag
  image: {
    inline: true,
    attrs: {
      src: { validate: 'string' },
      alt: { default: null, validate: 'string|null' },
      title: { default: null, validate: 'string|null' },
      href: { default: null, validate: 'string|null' },
      dataFocalX: { default: null, validate: 'string|null' },
      dataFocalY: { default: null, validate: 'string|null' },
      ...topLevelAttrs,
    },
    group: 'inline',
    draggable: true,
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs(dom) {
          const attrs = {
            src: dom.getAttribute('src'),
            alt: dom.getAttribute('alt'),
            href: dom.getAttribute('href'),
            dataFocalX: dom.getAttribute('data-focal-x'),
            dataFocalY: dom.getAttribute('data-focal-y'),
            ...getTopLevelParseAttrs(dom),
          };
          const title = dom.getAttribute('title');
          // TODO: Remove this once helix properly supports data-focal-x and data-focal-y
          if (!title?.includes('data-focal:')) {
            attrs.title = title;
          }
          return attrs;
        },
      },
    ],
    toDOM(node) {
      const {
        src, alt, title, href, dataFocalX, dataFocalY,
      } = node.attrs;
      const attrs = {
        src,
        alt,
        title,
        href,
        ...getTopLevelToDomAttrs(node),
      };
      if (dataFocalX != null) attrs['data-focal-x'] = dataFocalX;
      if (dataFocalY != null) attrs['data-focal-y'] = dataFocalY;
      // TODO: This is temp code to store the focal data in the title attribute
      // Once helix properly supports data-focal-x and data-focal-y, we can remove this code
      if (dataFocalX != null) attrs.title = `data-focal:${dataFocalX},${dataFocalY}`;
      return ['img', attrs];
    },
  },
  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM() {
      return ['br'];
    },
  },
  loc_added: {
    group: 'block',
    content: 'block+',
    atom: true,
    isolating: true,
    parseDOM: parseLocDOM('da-loc-added'),
    toDOM: () => ['da-loc-added', { contenteditable: false }, 0],
  },
  diff_added: {
    group: 'block',
    content: 'block+',
    atom: true,
    isolating: true,
    parseDOM: [
      {
        tag: 'da-diff-added',
        contentElement: (dom) => {
          [...dom.children].forEach((child) => {
            if (child.properties) {
              // eslint-disable-next-line no-param-reassign
              child.properties['da-diff-added'] = '';
            }
          });
          return dom;
        },
      },
      {
        tag: 'da-loc-added', // Temp code to support old regional edits
        contentElement: (dom) => {
          [...dom.children].forEach((child) => {
            if (child.properties) {
              // eslint-disable-next-line no-param-reassign
              child.properties['da-diff-added'] = '';
            }
          });
          return dom;
        },
      },
    ],
    toDOM: () => ['da-diff-added', { contenteditable: false }, 0],
  },
  loc_deleted: {
    group: 'block',
    content: 'block+',
    atom: true,
    isolating: true,
    parseDOM: parseLocDOM('da-loc-deleted'),
    toDOM: () => ['da-loc-deleted', { contenteditable: false }, 0],
  },
  diff_deleted: {
    group: 'block',
    content: 'block+',
    atom: true,
    isolating: true,
    parseDOM: [
      {
        tag: 'da-diff-deleted',
        contentElement: (dom) => dom,
      },
      {
        tag: 'da-loc-deleted', // Temp code to support old regional edits
        contentElement: (dom) => dom,
      },
    ],
    toDOM: () => ['da-diff-deleted', { 'data-mdast': 'ignore', contenteditable: false }, 0],
  },
};

const baseMarks = {
  s: {
    parseDOM: [{ tag: 's' }],
    toDOM() {
      return ['s', 0];
    },
  },
  em: {
    parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }, { style: 'font-style=normal', clearMark: (m) => m.type.name === 'em' }],
    toDOM() {
      return ['em', 0];
    },
  },
  strong: {
    parseDOM: [
      { tag: 'strong' },
      // This works around a Google Docs misbehavior where
      // pasted content will be inexplicably wrapped in `<b>`
      // tags with a font-weight normal.
      { tag: 'b', getAttrs: (node) => node.style.fontWeight !== 'normal' && null },
      { style: 'font-weight=400', clearMark: (m) => m.type.name === 'strong' },
      { style: 'font-weight', getAttrs: (value) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null },
    ],
    toDOM() {
      return ['strong', 0];
    },
  },
  link: {
    attrs: {
      href: {},
      title: { default: null },
      ...topLevelAttrs,
    },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs(dom) {
          return { href: dom.getAttribute('href'), title: dom.getAttribute('title'), ...getTopLevelParseAttrs(dom) };
        },
      },
    ],
    toDOM(node) {
      const { href, title } = node.attrs;
      return ['a', { href, title, ...getTopLevelToDomAttrs(node) }, 0];
    },
  },
  code: {
    parseDOM: [{ tag: 'code' }],
    toDOM() {
      return ['code', 0];
    },
  },
  u: {
    parseDOM: [{ tag: 'u' }],
    toDOM() {
      return ['u', 0];
    },
  },
};

const baseSchema = new Schema({ nodes: baseNodes, marks: baseMarks });

function addCustomMarks(marks) {
  const sup = {
    parseDOM: [{ tag: 'sup' }, { clearMark: (m) => m.type.name === 'sup' }],
    toDOM() {
      return ['sup', 0];
    },
  };

  const sub = {
    parseDOM: [{ tag: 'sub' }, { clearMark: (m) => m.type.name === 'sub' }],
    toDOM() {
      return ['sub', 0];
    },
  };

  const contextHighlight = { toDOM: () => ['span', { class: 'highlighted-context' }, 0] };

  return marks.addToEnd('sub', sub).addToEnd('sup', sup).addToEnd('contextHighlightingMark', contextHighlight);
}

function getTableNodeSchema() {
  const schema = tableNodes({ tableGroup: 'block', cellContent: 'block+' });
  schema.table.attrs = { ...topLevelAttrs };
  schema.table.parseDOM = [{ tag: 'table', getAttrs: getTopLevelParseAttrs }];
  schema.table.toDOM = (node) => ['table', node.attrs, ['tbody', 0]];
  schema.table.draggable = true;
  return schema;
}

function addAttrsToListNode(_nodes, listType, tag) {
  const nodes = _nodes;
  nodes.get(listType).attrs = { ...topLevelAttrs };
  nodes.get(listType).parseDOM = [{ tag, getAttrs: getTopLevelParseAttrs }];
  nodes.get(listType).toDOM = (node) => [tag, { ...getTopLevelToDomAttrs(node) }, 0];
}

function addListNodeSchema(nodes) {
  const withListNodes = addListNodes(nodes, 'block+', 'block');
  addAttrsToListNode(withListNodes, 'bullet_list', 'ul');
  addAttrsToListNode(withListNodes, 'ordered_list', 'ol');
  return withListNodes;
}

// eslint-disable-next-line import/prefer-default-export
export function getSchema() {
  let { nodes } = baseSchema.spec;
  const { marks } = baseSchema.spec;
  nodes = addListNodeSchema(nodes);

  // Update diff nodes to allow list_item after list nodes are added
  nodes = nodes.update('diff_deleted', { ...nodes.get('diff_deleted'), content: '(block | list_item)+' });
  nodes = nodes.update('diff_added', { ...nodes.get('diff_added'), content: '(block | list_item)+' });
  nodes = nodes.update('loc_deleted', { ...nodes.get('loc_deleted'), content: '(block | list_item)+' });
  nodes = nodes.update('loc_added', { ...nodes.get('loc_added'), content: '(block | list_item)+' });

  nodes = nodes.append(getTableNodeSchema());
  const customMarks = addCustomMarks(marks);
  return new Schema({ nodes, marks: customMarks });
}
