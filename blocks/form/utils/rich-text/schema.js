import { safeHref } from '../../../shared/safe-href.js';

/** The levels of the heading text styles. */
export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6];

/** The names of the list nodes. */
export const LIST_NAMES = new Set(['bullet_list', 'ordered_list']);

/** The `font-weight` values pasted text is bold with. */
const BOLD_WEIGHT = /^(bold(er)?|[6-9]00)$/;

/**
 * The ProseMirror schema of rich-text fields. It holds what the SDK stores, paragraphs,
 * headings, blockquotes, lists, line breaks and inline marks.
 */
export const SCHEMA_SPEC = {
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      defining: true,
      parseDOM: HEADING_LEVELS.map((level) => ({ tag: `h${level}`, attrs: { level } })),
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    blockquote: {
      content: 'block+',
      group: 'block',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: () => ['blockquote', 0],
    },
    bullet_list: {
      content: 'list_item+',
      group: 'block',
      parseDOM: [{ tag: 'ul' }],
      toDOM: () => ['ul', 0],
    },
    ordered_list: {
      content: 'list_item+',
      group: 'block',
      parseDOM: [{ tag: 'ol' }],
      toDOM: () => ['ol', 0],
    },
    list_item: {
      content: 'paragraph (bullet_list | ordered_list)*',
      defining: true,
      parseDOM: [{ tag: 'li' }],
      toDOM: () => ['li', 0],
    },
    text: { group: 'inline' },
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br'],
    },
  },
  // Order sets the serialized nesting, with link outermost and code innermost.
  marks: {
    link: {
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
    },
    strong: {
      parseDOM: [
        { tag: 'strong' },
        { tag: 'b' },
        { style: 'font-weight', getAttrs: (value) => (BOLD_WEIGHT.test(value) ? null : false) },
      ],
      toDOM: () => ['strong', 0],
    },
    em: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
      toDOM: () => ['em', 0],
    },
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
    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM: () => ['code', 0],
    },
  },
};
