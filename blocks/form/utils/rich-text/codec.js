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

/**
 * Converts between stored values and editor documents. The field only uses this interface,
 * so the parser and serializer behind it can change without touching the field.
 * @typedef {object} RichTextCodec
 * @property {(value: unknown) => object} parse Reads a stored HTML or plain-text value into a
 *   ProseMirror document. Plain text from before the field was rich text becomes paragraphs.
 * @property {(richTextDocument: object) => string} serialize Writes a document as HTML, or an
 *   empty string when it shows no text. The SDK brings the value into its stored form on save.
 */

/**
 * Creates the codec of a rich-text editor, backed by the ProseMirror DOM parser and serializer.
 * @param {object} options The editor.
 * @param {object} options.proseMirror The da-y-wrapper namespace.
 * @param {object} options.schema The schema.
 * @returns {RichTextCodec} The codec.
 */
export function createRichTextCodec({ proseMirror, schema }) {
  const parser = proseMirror.DOMParser.fromSchema(schema);
  const serializer = proseMirror.DOMSerializer.fromSchema(schema);

  const parse = (value) => {
    const text = typeof value === 'string' ? value : '';
    const parsed = parseHtml(text);
    return parser.parse(parsed.firstElementChild ? parsed : parseHtml(plainTextToHtml(text)));
  };

  const serialize = (richTextDocument) => {
    if (!richTextDocument.textContent.trim()) {
      return '';
    }

    const container = document.createElement('div');
    container.append(serializer.serializeFragment(richTextDocument.content));
    return container.innerHTML;
  };

  return { parse, serialize };
}
