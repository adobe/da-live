import { expect } from '@esm-bundle/chai';
import { getDiffClass } from '../../../../../blocks/edit/prose/diff/diff-utils.js';
import getSheet from '../../../../../blocks/shared/sheet.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

const waitFor = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function waitForSelector(root, selector) {
  for (let i = 0; i < 100; i += 1) {
    const el = root.querySelector(selector);
    if (el) return el;
    // eslint-disable-next-line no-await-in-loop
    await waitFor(20);
  }
  throw new Error(`${selector} did not appear`);
}

// Lays out a lone diff node view the way the canvas editor does: inside the
// shadow root of ew-editor-doc, with the canvas diff styles and diff-utils.css.
async function renderLoneNode(editor, type, text) {
  const { schema } = editor.view.state;
  const para = schema.nodes.paragraph.create(null, schema.text(text));
  editor.view.dispatch(editor.view.state.tr.insert(
    editor.view.state.doc.content.size,
    schema.nodes[type].create({}, para),
  ));
  let pos = -1;
  editor.view.state.doc.descendants((node, p) => {
    if (node.type.name === type) pos = p;
  });

  const host = document.createElement('div');
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.adoptedStyleSheets = [
    await getSheet('/blocks/canvas/ew-editor-doc/ew-editor-doc-diff.css'),
    await getSheet('/blocks/edit/prose/diff/diff-utils.css'),
  ];
  const mount = document.createElement('div');
  mount.className = 'ew-editor-doc-mount';
  mount.style.width = '700px';
  shadow.append(mount);

  const NodeView = getDiffClass(type, () => schema, () => {}, { isUpstream: type === 'diff_deleted' });
  const view = new NodeView(editor.view.state.doc.nodeAt(pos), editor.view, () => pos);
  const next = document.createElement('p');
  next.textContent = 'Next line';
  mount.append(view.dom, next);

  const buttons = await waitForSelector(view.dom, '.loc-sticky-buttons');
  await waitFor(50); // let the short-container observer run
  return { host, view, buttons, next };
}

describe('canvas merge conflicts: lone block layout', () => {
  let editor;
  let host;

  beforeEach(async () => {
    editor = await createTestEditor();
    window.view = editor.view;
  });

  afterEach(() => {
    host?.remove();
    destroyEditor(editor);
    delete window.view;
  });

  ['diff_deleted', 'diff_added'].forEach((type) => {
    it(`keeps the buttons of a one-line ${type} block off the next line`, async () => {
      const rendered = await renderLoneNode(editor, type, 'One line of text');
      ({ host } = rendered);
      const container = rendered.view.dom.getBoundingClientRect();
      const buttons = rendered.buttons.getBoundingClientRect();
      const next = rendered.next.getBoundingClientRect();

      expect(buttons.height).to.be.greaterThan(0);
      expect(buttons.bottom).to.be.at.most(container.bottom);
      expect(buttons.bottom).to.be.at.most(next.top);
    });
  });
});
