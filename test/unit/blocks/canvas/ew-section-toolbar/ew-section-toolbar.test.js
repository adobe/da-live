/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { makeRealView } from '../test-helpers.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { processBlockOptions } = await import('../../../../../blocks/canvas/ew-editor-doc/slash-menu/block-options.js');

const p = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
const cell = (text, attrs) => ({ type: 'table_cell', ...(attrs ? { attrs } : {}), content: [p(text)] });

describe('ew-section-toolbar', () => {
  let toolbar;

  before(async () => {
    await import('../../../../../blocks/canvas/ew-section-toolbar/ew-section-toolbar.js');
  });

  afterEach(() => {
    toolbar?.remove();
    toolbar = undefined;
  });

  async function mount(view, sectionIndex, rows = []) {
    toolbar = document.createElement('ew-section-toolbar');
    toolbar._loadOptions = async () => {};
    document.body.append(toolbar);
    toolbar._options = processBlockOptions(rows).get('section-metadata') ?? null;
    toolbar.view = view;
    toolbar.show(sectionIndex);
    await toolbar.updateComplete;
    return toolbar;
  }

  const pickers = () => [...toolbar.shadowRoot.querySelectorAll('nx-picker')];

  it('renders a picker per configured section-metadata key', async () => {
    await mount(makeRealView({ type: 'doc', content: [p()] }), 0, [
      { blocks: 'section-metadata', key: 'Style', values: 'Highlight=highlight|Plain=plain' },
      { blocks: 'section-metadata', key: 'Background', values: 'Blue=#00f' },
    ]);

    const labels = [...toolbar.shadowRoot.querySelectorAll('.toolbar-field-label')]
      .map((el) => el.textContent);
    expect(labels).to.deep.equal(['style', 'background']);
    expect(toolbar.shadowRoot.querySelector('.section-name').textContent).to.equal('Section 1');
    const [style, background] = pickers();
    expect(style.items).to.deep.equal([
      { section: 'style' },
      { value: '', label: 'None' },
      { value: 'highlight', label: 'Highlight' },
      { value: 'plain', label: 'Plain' },
    ]);
    expect(background.items[2]).to.deep.equal({ value: '#00f', label: 'Blue', swatch: '#00f' });
  });

  it('writes the chosen value into the shown section only', async () => {
    const view = makeRealView({ type: 'doc', content: [p('Hello'), { type: 'horizontal_rule' }, p('World')] });
    await mount(view, 1, [{ blocks: 'section-metadata', key: 'Style', values: 'Highlight=highlight' }]);

    pickers()[0].dispatchEvent(new CustomEvent('change', { detail: { value: 'highlight' } }));

    const table = view.state.doc.lastChild;
    expect(table.type.name).to.equal('table');
    expect(table.child(1).child(0).textContent).to.equal('style');
    expect(table.child(1).child(1).textContent).to.equal('highlight');
    expect(view.state.doc.firstChild.textContent).to.equal('Hello');
  });

  it('reflects the section\'s current value', async () => {
    const view = makeRealView({
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          { type: 'table_row', content: [cell('section-metadata', { colspan: 2 })] },
          { type: 'table_row', content: [cell('Style'), cell('highlight')] },
        ],
      }],
    });
    await mount(view, 0, [{ blocks: 'section-metadata', key: 'Style', values: 'Highlight=highlight|Plain=plain' }]);

    expect(pickers()[0].value).to.equal('highlight');
  });

  it('re-reads values on doc changes and when switching sections', async () => {
    const view = makeRealView({ type: 'doc', content: [p(), { type: 'horizontal_rule' }, p()] });
    await mount(view, 0, [{ blocks: 'section-metadata', key: 'Style', values: 'Highlight=highlight|Plain=plain' }]);
    expect(pickers()[0].value).to.equal('');

    pickers()[0].dispatchEvent(new CustomEvent('change', { detail: { value: 'plain' } }));
    canvasBus.editorDocState.emit({});
    await toolbar.updateComplete;
    expect(pickers()[0].value).to.equal('plain');

    toolbar.show(1);
    await toolbar.updateComplete;
    expect(pickers()[0].value).to.equal('');
  });

  it('clears a value with the None option', async () => {
    const view = makeRealView({ type: 'doc', content: [p('Hello')] });
    await mount(view, 0, [{ blocks: 'section-metadata', key: 'Style', values: 'Highlight=highlight' }]);

    pickers()[0].dispatchEvent(new CustomEvent('change', { detail: { value: 'highlight' } }));
    expect(view.state.doc.lastChild.type.name).to.equal('table');
    pickers()[0].dispatchEvent(new CustomEvent('change', { detail: { value: '' } }));
    expect(view.state.doc.childCount).to.equal(1);
  });

  it('renders only the section name when no section-metadata options are configured', async () => {
    await mount(makeRealView({ type: 'doc', content: [p()] }), 2);

    expect(toolbar.shadowRoot.querySelector('nx-picker')).to.equal(null);
    expect(toolbar.shadowRoot.querySelector('.section-name').textContent).to.equal('Section 3');
  });

  it('show() opens and hide() closes', async () => {
    await mount(makeRealView({ type: 'doc', content: [p()] }), 3);
    expect(toolbar.open).to.equal(true);
    expect(toolbar.sectionIndex).to.equal(3);
    toolbar.hide();
    expect(toolbar.open).to.equal(false);
  });
});
