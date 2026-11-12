import { safeHref } from '../../../shared/safe-href.js';
import { childrenOf } from './nodes.js';
import { LIST_NAMES } from './schema.js';

/** The whitespace HTML collapses. */
const WHITESPACE = /[ \t\n\r\f]+/g;

/** Parses HTML into inert documents. It keeps no state, so one serves every value. */
const HTML_PARSER = new DOMParser();

/** The entities of the characters HTML escapes. */
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/**
 * Escapes text content.
 * @param {string} value The text.
 * @returns {string} The escaped text.
 */
const escapeText = (value) => value.replace(/[&<>]/g, (character) => ENTITIES[character]);

/**
 * Escapes a double-quoted attribute value.
 * @param {string} value The value.
 * @returns {string} The escaped value.
 */
const escapeAttribute = (value) => value.replace(/[&"<>]/g, (character) => ENTITIES[character]);

/**
 * Answers whether HTML shows any text.
 * @param {string} html The HTML.
 * @returns {boolean} Whether text remains without the tags.
 */
const hasText = (html) => html.replace(/<[^>]*>/g, '').trim() !== '';

/**
 * Removes line breaks and whitespace at both ends, non-breaking spaces included, the way
 * the SDK trims a value.
 * @param {string} html The HTML.
 * @returns {string} The trimmed HTML.
 */
const trimEdges = (html) => html.replace(/^(?:\s|<br>)+|(?:\s|<br>)+$/g, '');

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

/**
 * Parses a stored value into a document. A value without elements is plain text from before
 * the field was rich text and becomes paragraphs.
 * @param {object} options The value and the parser.
 * @param {object} options.proseMirror The da-y-wrapper namespace.
 * @param {object} options.schema The schema.
 * @param {unknown} options.value The stored HTML or plain text.
 * @returns {object} The ProseMirror document.
 */
export function parseRichText({ proseMirror, schema, value }) {
  const text = typeof value === 'string' ? value : '';
  const parsed = parseHtml(text);
  const body = parsed.firstElementChild ? parsed : parseHtml(plainTextToHtml(text));
  return proseMirror.DOMParser.fromSchema(schema).parse(body);
}

/**
 * Wraps HTML in the tag of a mark. A link with an unsafe href keeps only its text.
 * @param {object} mark The ProseMirror mark.
 * @param {string} inner The HTML inside the mark.
 * @returns {string} The HTML.
 */
function wrapMark(mark, inner) {
  if (!hasText(inner)) {
    return inner;
  }

  const { name } = mark.type;
  if (name !== 'link') {
    return `<${name}>${inner}</${name}>`;
  }

  const href = safeHref(mark.attrs.href);
  if (!href) {
    return inner;
  }

  const title = mark.attrs.title?.replace(WHITESPACE, ' ').trim();
  const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : '';
  return `<a href="${escapeAttribute(href)}"${titleAttribute}>${inner}</a>`;
}

/**
 * A text or line break with its marks. A line break has null text.
 * @typedef {object} RichTextLeaf
 * @property {object[]} marks The ProseMirror marks.
 * @property {string|null} text The text, or null for a line break.
 */

/**
 * Drops trailing line breaks and the trailing space of the last text.
 * @param {RichTextLeaf[]} leaves The leaves.
 * @returns {RichTextLeaf[]} The trimmed leaves.
 */
function trimEnd(leaves) {
  const last = leaves.at(-1);
  if (last?.text === null) {
    return trimEnd(leaves.slice(0, -1));
  }
  if (!last?.text.endsWith(' ')) {
    return leaves;
  }

  const text = last.text.slice(0, -1);
  return text ? [...leaves.slice(0, -1), { ...last, text }] : trimEnd(leaves.slice(0, -1));
}

/**
 * Collapses whitespace the way HTML parsing does. It drops a space at the block edges,
 * after a line break and after another space.
 * @param {object[]} nodes The inline ProseMirror nodes of a block.
 * @returns {RichTextLeaf[]} The leaves.
 */
function normalizeLeaves(nodes) {
  const leaves = nodes.reduce((collected, { isText, text, marks }) => {
    const previous = collected.at(-1);
    if (!isText) {
      return previous ? [...collected, { marks, text: null }] : collected;
    }

    const dropsSpace = !previous || previous.text === null || previous.text.endsWith(' ');
    const collapsed = text.replace(WHITESPACE, ' ');
    const kept = dropsSpace ? collapsed.replace(/^ /, '') : collapsed;
    return kept ? [...collected, { marks, text: kept }] : collected;
  }, []);
  return trimEnd(leaves);
}

/**
 * Serializes a leaf without its marks.
 * @param {RichTextLeaf} leaf The leaf.
 * @returns {string} The HTML.
 */
const serializeLeaf = (leaf) => (leaf.text === null ? '<br>' : escapeText(leaf.text));

/**
 * Serializes leaves with their marks. Neighbours sharing the mark at `depth` form one run,
 * so the mark opens once around them.
 * @param {RichTextLeaf[]} leaves The leaves.
 * @param {number} [depth] The index of the marks this call groups by.
 * @returns {string} The HTML.
 */
function serializeInline(leaves, depth = 0) {
  const runs = leaves.reduce((collected, leaf) => {
    const mark = leaf.marks[depth];
    const last = collected.at(-1);
    if (mark && last?.mark?.eq(mark)) {
      return [...collected.slice(0, -1), { mark, leaves: [...last.leaves, leaf] }];
    }
    return [...collected, { mark, leaves: [leaf] }];
  }, []);
  const serializeRun = ({ mark, leaves: run }) => (mark
    ? wrapMark(mark, serializeInline(run, depth + 1))
    : run.map(serializeLeaf).join(''));
  return runs.map(serializeRun).join('');
}

/**
 * Serializes the inline content of a text block.
 * @param {object} node The ProseMirror text block.
 * @returns {string} The HTML, or an empty string when it shows no text.
 */
function serializeText(node) {
  const inner = trimEdges(serializeInline(normalizeLeaves(childrenOf(node))));
  return hasText(inner) ? inner : '';
}

/**
 * Serializes a list. Items without text are left out.
 * @param {object} list The ProseMirror list node.
 * @returns {string} The HTML, or an empty string when no item has text.
 */
function serializeList(list) {
  const tag = list.type.name === 'ordered_list' ? 'ol' : 'ul';
  const items = childrenOf(list).map((item) => {
    const [paragraph, ...lists] = childrenOf(item);
    const inner = serializeText(paragraph) + lists.map(serializeList).join('');
    return inner ? `<li>${inner}</li>` : '';
  }).join('');
  return items ? `<${tag}>${items}</${tag}>` : '';
}

/**
 * Serializes a block. Blocks without text are left out.
 * @param {object} node The ProseMirror block.
 * @returns {string} The HTML, or an empty string when it shows no text.
 */
function serializeBlock(node) {
  const { name } = node.type;
  if (LIST_NAMES.has(name)) {
    return serializeList(node);
  }

  if (name === 'blockquote') {
    // eslint-disable-next-line no-use-before-define
    const inner = serializeBlocks(node);
    return inner ? `<blockquote>${inner}</blockquote>` : '';
  }

  const tag = name === 'heading' ? `h${node.attrs.level}` : 'p';
  const inner = serializeText(node);
  return inner ? `<${tag}>${inner}</${tag}>` : '';
}

/**
 * Serializes the blocks of a parent.
 * @param {object} parent The ProseMirror node.
 * @returns {string} The HTML.
 */
const serializeBlocks = (parent) => childrenOf(parent).map(serializeBlock).join('');

/**
 * Serializes a document into the form the SDK stores.
 * @param {object} options The document.
 * @param {object} options.richTextDocument The ProseMirror document.
 * @returns {string} The HTML, or an empty string when the document shows no text.
 */
export function serializeRichText({ richTextDocument }) {
  return serializeBlocks(richTextDocument);
}

/**
 * Finds the smallest replacement that turns a document into what the SDK stores.
 * @param {object} options The document and the parser.
 * @param {object} options.proseMirror The da-y-wrapper namespace.
 * @param {object} options.richTextDocument The ProseMirror document.
 * @returns {{ from: number, to: number, slice: object }|null} The range to replace and its
 *   replacement, or null when the document is already in the stored form.
 */
export function getCanonicalChange({ proseMirror, richTextDocument }) {
  const value = serializeRichText({ richTextDocument });
  const canonical = parseRichText({ proseMirror, schema: richTextDocument.type.schema, value });
  const { content } = richTextDocument;
  const from = content.findDiffStart(canonical.content);
  if (from === null) {
    return null;
  }

  const { a: documentEnd, b: canonicalEnd } = content.findDiffEnd(canonical.content);
  const overlap = Math.max(0, from - Math.min(documentEnd, canonicalEnd));
  return { from, to: documentEnd + overlap, slice: canonical.slice(from, canonicalEnd + overlap) };
}
