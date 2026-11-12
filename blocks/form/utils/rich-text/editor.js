import { createSchema } from './schema.js';
import { createRichTextCodec } from './codec.js';
import { applyLink } from './commands.js';
import { buildKeymap, createToolset } from './tools.js';

/**
 * Sets up a rich-text editor, so the field does not need to know how ProseMirror fits together.
 * @typedef {object} RichTextEditor
 * @property {import('../../fields/rich-text-toolbar.js').Toolset} toolset The toolbar tools.
 * @property {(value: unknown) => object} createState Creates an editor state for a stored
 *   value, with fresh history.
 * @property {(element: HTMLElement, props: object) => object} mount Mounts an editor view.
 * @property {(state: object) => string} serialize Writes the document of a state as HTML.
 * @property {(link: { href: string, text?: string, title?: string }) =>
 *   import('./commands.js').RichTextCommand} linkCommand Creates a command that applies a link.
 */

/**
 * Creates a rich-text editor backed by ProseMirror.
 * @param {object} options The dependencies.
 * @param {object} options.proseMirror The da-y-wrapper namespace.
 * @param {() => void} options.onLink Opens the link dialog.
 * @returns {RichTextEditor} The editor.
 */
export function createRichTextEditor({ proseMirror, onLink }) {
  const schema = createSchema(proseMirror);
  const codec = createRichTextCodec({ proseMirror, schema });
  const toolset = createToolset({ proseMirror, schema, onLink });
  const plugins = [
    proseMirror.history(),
    proseMirror.keymap(buildKeymap({ proseMirror, schema, toolset })),
    proseMirror.keymap(proseMirror.baseKeymap),
  ];

  return {
    toolset,
    createState: (value) => proseMirror.EditorState.create({ doc: codec.parse(value), plugins }),
    mount: (element, props) => new proseMirror.EditorView(element, props),
    serialize: (state) => codec.serialize(state.doc),
    linkCommand: (link) => applyLink({ proseMirror, ...link }),
  };
}

/**
 * Loads ProseMirror on demand and creates a rich-text editor, so forms without rich text
 * do not download it.
 * @param {object} options The dependencies.
 * @param {() => void} options.onLink Opens the link dialog.
 * @returns {Promise<RichTextEditor>} The editor.
 */
export async function loadRichTextEditor({ onLink }) {
  const proseMirror = await import('da-y-wrapper');
  return createRichTextEditor({ proseMirror, onLink });
}
