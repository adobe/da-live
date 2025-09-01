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
  return [{
    tag: locTag,

    // Do we need to add this to the contentElement function?
    // Only parse the content of the node, not the temporary elements
    // const deleteThese = dom.querySelectorAll('[loc-temp-dom]');
    // deleteThese.forEach((e) => e.remove());
    contentElement: (dom) => dom,
  }];
}

const topLevelAttrs = { dataId: { default: null, validate: 'string|null' } };
const getTopLevelToDomAttrs = (node) => ({ 'data-id': node.attrs.dataId });
const getTopLevelParseAttrs = (dom) => ({ dataId: dom.getAttribute('dataId') || null });

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
      ...topLevelAttrs,
    },
    group: 'inline',
    draggable: true,
    parseDOM: [{
      tag: 'img[src]',
      getAttrs(dom) {
        return {
          src: dom.getAttribute('src'),
          title: dom.getAttribute('title'),
          alt: dom.getAttribute('alt'),
          href: dom.getAttribute('href'),
          ...getTopLevelParseAttrs(dom),
        };
      },
    }],
    toDOM(node) {
      const {
        src,
        alt,
        title,
        href,
      } = node.attrs;
      return ['img', {
        src,
        alt,
        title,
        href,
        ...getTopLevelToDomAttrs(node),
      }];
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
  // DA diffing tags
  loc_added: {
    group: 'block',
    content: 'block+',
    atom: true,
    isolating: true,
    parseDOM: parseLocDOM('da-loc-added'),
    toDOM: () => ['da-loc-added', { contenteditable: false }, 0],
  },
  loc_deleted: {
    group: 'block',
    content: 'block+',
    atom: true,
    isolating: true,
    parseDOM: parseLocDOM('da-loc-deleted'),
    toDOM: () => ['da-loc-deleted', { contenteditable: false }, 0],
  },
};

const baseMarks = {
  link: {
    attrs: {
      href: {},
      title: { default: null },
    },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs(dom) {
          return { href: dom.getAttribute('href'), title: dom.getAttribute('title') };
        },
      },
    ],
    toDOM(node) {
      const { href, title } = node.attrs;
      return ['a', { href, title }, 0];
    },
  },
  em: {
    parseDOM: [
      { tag: 'i' },
      { tag: 'em' },
      { style: 'font-style=italic' },
      { style: 'font-style=normal', clearMark: (m) => m.type.name === 'em' },
    ],
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
  code: {
    parseDOM: [{ tag: 'code' }],
    toDOM() {
      return ['code', 0];
    },
  },
  s: {
    parseDOM: [{ tag: 's' }],
    toDOM() {
      return ['s', 0];
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
    toDOM() { return ['sup', 0]; },
  };

  const sub = {
    parseDOM: [{ tag: 'sub' }, { clearMark: (m) => m.type.name === 'sub' }],
    toDOM() { return ['sub', 0]; },
  };

  const contextHighlight = { toDOM: () => ['span', { class: 'highlighted-context' }, 0] };

  return marks
    .addToEnd('sup', sup)
    .addToEnd('sub', sub)
    .addToEnd('contextHighlightingMark', contextHighlight);
}

function getTableNodeSchema() {
  const schema = tableNodes({ tableGroup: 'block', cellContent: 'block+' });
  schema.table.attrs = { ...topLevelAttrs };
  schema.table.parseDOM = [{ tag: 'table', getAttrs: getTopLevelParseAttrs }];
  schema.table.toDOM = (node) => ['table', node.attrs, ['tbody', 0]];
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
  nodes = nodes.append(getTableNodeSchema());
  const customMarks = addCustomMarks(marks);
  return new Schema({ nodes, marks: customMarks });
}
