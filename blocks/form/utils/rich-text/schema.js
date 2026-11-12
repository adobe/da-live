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
 * Lists the text nodes inside an element.
 * @param {HTMLElement} element The element.
 * @returns {Text[]} The text nodes.
 */
function textNodesOf(element) {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }
  return textNodes;
}

/**
 * Replaces each line feed in a text node with a `<br>`.
 * @param {Text} textNode The text node.
 */
function breakLines(textNode) {
  const [firstLine, ...nextLines] = textNode.data.split('\n');
  const lineBreak = () => textNode.ownerDocument.createElement('br');
  textNode.replaceWith(firstLine, ...nextLines.flatMap((line) => [lineBreak(), line]));
}

/**
 * Reads a code block the way the SDK stores it, as a paragraph that keeps its line breaks
 * but not its code formatting.
 * @param {HTMLElement} pre The `pre` element.
 * @returns {HTMLElement} A copy to read the paragraph content from.
 */
function preformattedContent(pre) {
  const content = pre.cloneNode(true);
  content.querySelectorAll('code').forEach((code) => code.replaceWith(...code.childNodes));
  textNodesOf(content).forEach(breakLines);
  return content;
}

/** Reads a code block as a paragraph. */
const PREFORMATTED_RULE = { tag: 'pre', contentElement: preformattedContent };

/**
 * Creates the schema of rich-text fields. It holds what the SDK stores.
 * @param {object} proseMirror The da-y-wrapper namespace.
 * @returns {object} The ProseMirror schema.
 */
export function createSchema({ Schema, baseSchema, addListNodes }) {
  const { nodes, marks } = baseSchema.spec;
  const paragraph = nodes.get('paragraph');
  const blocks = DROPPED_NODES
    .reduce((kept, name) => kept.remove(name), nodes)
    .update('paragraph', { ...paragraph, parseDOM: [...paragraph.parseDOM, PREFORMATTED_RULE] });
  const lists = addListNodes(blocks, 'paragraph (bullet_list | ordered_list)*', 'block');
  // The SDK stores numbered lists without a start number.
  const { content, group } = lists.get('ordered_list');
  const orderedList = { content, group, parseDOM: [{ tag: 'ol' }], toDOM: () => ['ol', 0] };
  return new Schema({
    nodes: lists.update('ordered_list', orderedList),
    // Order sets the serialized nesting like the SDK, with del outermost and code innermost.
    marks: {
      del: {
        parseDOM: [
          { tag: 'del' },
          { tag: 's' },
          { tag: 'strike' },
          { style: 'text-decoration=line-through' },
        ],
        toDOM: () => ['del', 0],
      },
      em: marks.get('em'),
      strong: marks.get('strong'),
      link: LINK,
      u: {
        parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
        toDOM: () => ['u', 0],
      },
      sub: {
        excludes: 'sup sub',
        parseDOM: [{ tag: 'sub' }, { style: 'vertical-align=sub' }],
        toDOM: () => ['sub', 0],
      },
      sup: {
        excludes: 'sup sub',
        parseDOM: [{ tag: 'sup' }, { style: 'vertical-align=super' }],
        toDOM: () => ['sup', 0],
      },
      code: marks.get('code'),
    },
  });
}
