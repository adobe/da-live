import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import '../../../../../blocks/form/views/editor.js';
import { NAV_ORIGIN } from '../../../../../blocks/form/events.js';

const tick = () => new Promise((resolve) => { setTimeout(resolve); });

const richTextNode = (extra = {}) => ({
  kind: 'string',
  pointer: '/data/body',
  label: 'Body',
  semanticType: 'rich-text',
  value: '<p>hi</p>',
  ...extra,
});

function objectRoot(children) {
  return { kind: 'object', pointer: '/data', label: 'Data', children };
}

async function mountEditor(root) {
  const el = document.createElement('ew-form-fields');
  el.editor = {};
  el.onSelect = () => {};
  el.state = { model: { root } };
  el.nav = {};
  document.body.append(el);
  await el.updateComplete;
  await tick();
  await el.updateComplete;
  return el;
}

describe('ew-form-fields primitive controls', () => {
  it('renders a textarea for a long-text string node', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/body', label: 'Body', semanticType: 'long-text', value: 'hi' },
    ]);
    const el = await mountEditor(root);
    expect(el.shadowRoot.querySelector('ew-form-textarea')).to.exist;
    expect(el.shadowRoot.querySelector('ew-form-input')).to.equal(null);
  });

  it('renders a rich-text editor for a rich-text string node', async () => {
    const formEditor = await mountEditor(objectRoot([richTextNode()]));
    const field = formEditor.shadowRoot.querySelector('[data-pointer="/data/body"]');
    expect(field.tagName).to.equal('FORM-RICH-TEXT');
    expect(field.value).to.equal('<p>hi</p>');
    expect(formEditor.shadowRoot.querySelector('form-textarea')).to.equal(null);
  });

  it('commits a rich-text value immediately on change', async () => {
    const formEditor = await mountEditor(objectRoot([richTextNode()]));
    const calls = [];
    formEditor.editor = { setField: (pointer, value) => calls.push([pointer, value]) };
    const field = formEditor.shadowRoot.querySelector('form-rich-text');
    field.value = '<p>bye</p>';
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    expect(formEditor._inputTimers.has('/data/body')).to.equal(true);
    field.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    expect(formEditor._inputTimers.has('/data/body')).to.equal(false);
    expect(calls).to.deep.equal([['/data/body', '<p>bye</p>']]);
  });

  it('clears an emptied rich-text value on change', async () => {
    const formEditor = await mountEditor(objectRoot([richTextNode()]));
    const calls = [];
    formEditor.editor = { setField: (pointer, value) => calls.push([pointer, value]) };
    const field = formEditor.shadowRoot.querySelector('form-rich-text');
    field.value = '';
    field.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    expect(calls).to.deep.equal([['/data/body', undefined]]);
  });

  it('stretches a rich-text item to fill an array row', async () => {
    const root = objectRoot([
      {
        kind: 'array',
        pointer: '/data/notes',
        label: 'Notes',
        itemLabel: 'Note',
        items: [richTextNode({ pointer: '/data/notes/0', label: 'Note', value: '<p>a</p>' })],
      },
    ]);
    const formEditor = await mountEditor(root);
    const field = formEditor.shadowRoot.querySelector('.form-array-item-input-row > form-rich-text');
    expect(field).to.exist;
    expect(getComputedStyle(field).flexGrow).to.equal('1');
  });

  it('renders a single-line input for a plain string node', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/title', label: 'Title', value: 'x' },
    ]);
    const el = await mountEditor(root);
    expect(el.shadowRoot.querySelector('ew-form-input')).to.exist;
    expect(el.shadowRoot.querySelector('ew-form-textarea')).to.equal(null);
  });

  it('renders a date widget for a string node with format date', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/when', label: 'When', format: 'date', value: '2026-08-14' },
    ]);
    const el = await mountEditor(root);
    const field = el.shadowRoot.querySelector('[data-pointer="/data/when"]');
    expect(field.tagName).to.equal('EW-FORM-DATE');
    expect(el.shadowRoot.querySelector('ew-form-input')).to.equal(null);
    expect(field.value).to.equal('2026-08-14');
  });

  it('renders a time widget for a string node with format time', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/opens', label: 'Opens', format: 'time', value: '09:00' },
    ]);
    const el = await mountEditor(root);
    const field = el.shadowRoot.querySelector('[data-pointer="/data/opens"]');
    expect(field.tagName).to.equal('EW-FORM-DATE');
    expect(field.type).to.equal('time');
    expect(field.value).to.equal('09:00');
  });

  it('renders a datetime widget for a string node with format date-time', async () => {
    const iso = '2026-08-14T09:30:00.000Z';
    const root = objectRoot([
      { kind: 'string', pointer: '/data/start', label: 'Start', format: 'date-time', value: iso },
    ]);
    const el = await mountEditor(root);
    const field = el.shadowRoot.querySelector('[data-pointer="/data/start"]');
    expect(field.tagName).to.equal('EW-FORM-DATE');
    expect(field.type).to.equal('datetime');
    expect(field.value).to.equal(iso);
  });

  it('surfaces the SDK format error on the date widget', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/when', label: 'When', format: 'date' },
    ]);
    const el = document.createElement('ew-form-fields');
    el.editor = {};
    el.onSelect = () => {};
    el.nav = {};
    el.state = {
      model: { root },
      validation: { errors: { '/data/when': { message: 'Must be a valid date (YYYY-MM-DD).' } } },
    };
    document.body.append(el);
    await el.updateComplete;
    const field = el.shadowRoot.querySelector('[data-pointer="/data/when"]');
    expect(field.error).to.equal('Must be a valid date (YYYY-MM-DD).');
  });

  it('stretches a long-text item to fill an array row', async () => {
    const root = objectRoot([
      {
        kind: 'array',
        pointer: '/data/figures',
        label: 'Key Figures',
        itemLabel: 'Figure',
        items: [
          { kind: 'string', pointer: '/data/figures/0', label: 'Figure', semanticType: 'long-text', value: 'Alan Turing' },
        ],
      },
    ]);
    const el = await mountEditor(root);
    const textarea = el.shadowRoot.querySelector('.form-array-item-input-row > ew-form-textarea');
    expect(textarea).to.exist;
    // flex:1 is what makes it take the row width beside the action menu.
    expect(getComputedStyle(textarea).flexGrow).to.equal('1');
  });
});

describe('ew-form-fields outline jumps', () => {
  const groupRoot = () => objectRoot([
    { kind: 'string', pointer: '/data/title', label: 'Title', value: '' },
    {
      kind: 'object',
      pointer: '/data/hero',
      label: 'Hero',
      children: [{ kind: 'string', pointer: '/data/hero/heading', label: 'Heading', value: '' }],
    },
  ]);

  async function scrolledBy(origin) {
    const editor = await mountEditor(groupRoot());
    const group = editor.shadowRoot.querySelector('.form-node[data-pointer="/data/hero"]');
    let scrolled = false;
    group.scrollIntoView = () => { scrolled = true; };
    editor.nav = { pointer: '/data/hero', origin, seq: 1 };
    await editor.updateComplete;
    editor.remove();
    return scrolled;
  }

  it('scrolls a group the outline jumps to into view', async () => {
    expect(await scrolledBy(NAV_ORIGIN.OUTLINE)).to.equal(true);
  });

  it('leaves the scroll alone for selections made in the editor', async () => {
    expect(await scrolledBy(NAV_ORIGIN.EDITOR)).to.equal(false);
  });
});
