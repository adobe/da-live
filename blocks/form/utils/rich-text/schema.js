import {
  addListNodes,
  baseSchema,
  DOMParser as ProseMirrorParser,
  DOMSerializer,
  Schema,
} from 'da-y-wrapper';
import { safeHref } from '../safe-href.js';

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
 * @returns {object} The ProseMirror schema.
 */
function createSchema() {
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

/** The schema of rich-text fields. */
export const schema = createSchema();

/** Parses HTML into inert documents. It keeps no state, so one serves every value. */
const HTML_PARSER = new DOMParser();

/** The entities of the characters text content escapes. */
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

/**
 * Escapes text content.
 * @param {string} value The text.
 * @returns {string} The escaped text.
 */
const escapeText = (value) => value.replace(/[&<>]/g, (character) => ENTITIES[character]);

/**
 * Turns plain text into paragraphs. Blank lines separate paragraphs, single line breaks
 * become `<br>`.
 * @param {string} text The plain text.
 * @returns {string} The HTML.
 */
function plainTextToHtml(text) {
  const toParagraph = (block) => {
    const lines = block.split('\n').map((line) => escapeText(line.trim()));
    return `<p>${lines.join('<br>')}</p>`;
  };
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(toParagraph)
    .join('');
}

/**
 * Parses HTML into the body of an inert document, so no scripts run and no resources load.
 * @param {string} html The HTML.
 * @returns {HTMLElement} The body.
 */
const parseHtml = (html) => HTML_PARSER.parseFromString(html, 'text/html').body;

const parser = ProseMirrorParser.fromSchema(schema);

const serializer = DOMSerializer.fromSchema(schema);

/**
 * Reads a stored HTML or plain-text value into a ProseMirror document. Plain text from before
 * the field was rich text becomes paragraphs.
 * @param {unknown} value The stored value.
 * @returns {object} The ProseMirror document.
 */
export function parseRichText(value) {
  const text = typeof value === 'string' ? value : '';
  const parsed = parseHtml(text);
  return parser.parse(parsed.firstElementChild ? parsed : parseHtml(plainTextToHtml(text)));
}

/**
 * Writes a document as HTML, or an empty string when it shows no text. The SDK brings the
 * value into its stored form on save.
 * @param {object} richTextDocument The ProseMirror document.
 * @returns {string} The HTML.
 */
export function serializeRichText(richTextDocument) {
  if (!richTextDocument.textContent.trim()) {
    return '';
  }

  const container = document.createElement('div');
  container.append(serializer.serializeFragment(richTextDocument.content));
  return container.innerHTML;
}
