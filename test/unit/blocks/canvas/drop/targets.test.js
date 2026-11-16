import { expect } from '@esm-bundle/chai';
import { columnResizing } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { createTargetIndicator, resolveTarget } = await import('../../../../../blocks/canvas/drop/targets.js');

describe('doc drop targets beneath the drag overlay', () => {
  let editor;
  let host;
  let overlay;
  let indicator;
  let pos;
  let point;

  beforeEach(async () => {
    editor = await createTestEditor({ additionalPlugins: [columnResizing()] });
    const { view } = editor;
    const { schema } = view.state;
    const row = (text) => schema.nodes.table_row.create(
      null,
      schema.nodes.table_cell.create(
        null,
        schema.nodes.paragraph.create(null, schema.text(text)),
      ),
    );
    const table = schema.nodes.table.create(null, [row('Cards'), row('Drop image here')]);
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, table));
    host = document.createElement('div');
    document.body.append(host);
    host.attachShadow({ mode: 'open' }).append(view.dom.parentElement);
    view.updateRoot();
    view.state.doc.descendants((node, at) => {
      if (node.isText && node.text === 'Drop image here') pos = at + 5;
    });
    const rect = view.coordsAtPos(pos);
    point = { x: rect.left, y: (rect.top + rect.bottom) / 2 };
    overlay = document.createElement('div');
    Object.assign(overlay.style, { position: 'fixed', inset: '0', zIndex: '2147483646' });
    document.body.append(overlay);
    indicator = createTargetIndicator();
  });

  afterEach(() => {
    indicator.clear();
    overlay.remove();
    destroyEditor(editor);
    host.remove();
  });

  it('resolves a drop to the hovered body cell rather than the table header', async () => {
    const target = await resolveTarget({ point, kind: 'image', view: editor.view, overlay });
    expect(target?.editor).to.equal('doc');
    expect(target.pos).to.equal(pos);
    expect(overlay.style.pointerEvents).to.equal('');
  });

  it('shows the insertion caret at the hovered body text', () => {
    indicator.hover({ point, kind: 'image', view: editor.view, overlay });
    const caret = [...document.body.children].find((el) => el.style.borderLeft);
    expect(caret).to.exist;
    const rect = editor.view.coordsAtPos(pos);
    expect(caret.style.left).to.equal(`${rect.left}px`);
    expect(caret.style.top).to.equal(`${rect.top}px`);
    expect(overlay.style.pointerEvents).to.equal('');
  });

  it('restores the overlay when coordinate resolution fails', async () => {
    overlay.style.pointerEvents = 'auto';
    const { view } = editor;
    const original = view.posAtCoords;
    view.posAtCoords = () => { throw new Error('Cannot resolve coordinates'); };
    try {
      await resolveTarget({ point, kind: 'image', view, overlay }).catch(() => {});
      expect(overlay.style.pointerEvents).to.equal('auto');
    } finally {
      view.posAtCoords = original;
    }
  });
});
