import { safeHref } from '../../../shared/safe-href.js';

/** The levels of the heading text styles. */
export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6];

/** The names of the list nodes. */
export const LIST_NAMES = new Set(['bullet_list', 'ordered_list']);

/** The base schema nodes the SDK does not store. */
const DROPPED_NODES = ['horizontal_rule', 'code_block', 'image'];

/** Links only keep a safe href, so pasted markup cannot add an unsafe one. */
const LINK = {
  attrs: { href: {}, title: { default: null } },
  inclusive: false,
  parseDOM: [{
    tag: 'a[href]',
    getAttrs: (element) => {
      const href = safeHref(element.getAttribute('href'));
      return href ? { href, title: element.getAttribute('title')?.trim() || null } : false;
    },
  }],
  toDOM: ({ attrs: { href, title } }) => ['a', title ? { href, title } : { href }, 0],
};

/**
 * Creates the schema of rich-text fields. It holds what the SDK stores.
 * @param {object} proseMirror The da-y-wrapper namespace.
 * @returns {object} The ProseMirror schema.
 */
export function createSchema({ Schema, baseSchema, addListNodes }) {
  const { nodes, marks } = baseSchema.spec;
  const blocks = DROPPED_NODES.reduce((kept, name) => kept.remove(name), nodes);
  const lists = addListNodes(blocks, 'paragraph (bullet_list | ordered_list)*', 'block');
  // The SDK stores numbered lists without a start number.
  const { content, group } = lists.get('ordered_list');
  const orderedList = { content, group, parseDOM: [{ tag: 'ol' }], toDOM: () => ['ol', 0] };
  return new Schema({
    nodes: lists.update('ordered_list', orderedList),
    // Order sets the serialized nesting, with link outermost and code innermost.
    marks: {
      link: LINK,
      strong: marks.get('strong'),
      em: marks.get('em'),
      u: {
        parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
        toDOM: () => ['u', 0],
      },
      s: {
        parseDOM: [
          { tag: 's' },
          { tag: 'strike' },
          { tag: 'del' },
          { style: 'text-decoration=line-through' },
        ],
        toDOM: () => ['s', 0],
      },
      sup: {
        excludes: 'sup sub',
        parseDOM: [{ tag: 'sup' }, { style: 'vertical-align=super' }],
        toDOM: () => ['sup', 0],
      },
      sub: {
        excludes: 'sup sub',
        parseDOM: [{ tag: 'sub' }, { style: 'vertical-align=sub' }],
        toDOM: () => ['sub', 0],
      },
      code: marks.get('code'),
    },
  });
}
