import { expect } from '@esm-bundle/chai';
import '../../setup-nx.js';
import { createEngine } from '../../../../deps/da-sc-sdk/dist/index.js';
import '../../../../blocks/form/editor.js';

// nx-preview lazy-imports the (heavy) Prism bundle on its first paint. Stub it
// so the render smoke tests stay light and don't starve other test files that
// share the browser session. Safe to set at module load — preview only calls
// loadPrism() when it actually paints (on mount), not at import time.
window.Prism = window.Prism ?? { highlightElement() {} };

const demoSchema = {
  type: 'object',
  title: 'Demo',
  required: ['name'],
  properties: {
    name: { type: 'string', title: 'Name' },
    tags: { type: 'array', title: 'Tags', items: { type: 'string', title: 'Tag' } },
  },
};

const validDoc = (data = {}) => ({ metadata: { schemaName: 'demo' }, data });

// Track mounted elements so we can remove them after each test — leftover
// <nx-form>s carry live engines and re-rendering previews that would otherwise
// slow down (and flake) later test files in the shared wtr page.
const mounted = [];

function makeForm() {
  const el = document.createElement('nx-form');
  el._loadContext = async () => {};
  document.body.append(el);
  mounted.push(el);
  return el;
}

afterEach(() => {
  while (mounted.length) mounted.pop().remove();
});

// Build an <nx-form> in a "ready" render without touching the network.
// Setting `ctx` would trigger `_loadContext` (a real `source.*` fetch), so we
// stub it out and seed the reactive state the renderer reads directly.
async function mountReady() {
  const el = makeForm();

  const json = validDoc({ name: 'Ada' });
  const engine = createEngine({ schema: demoSchema, document: json });

  el._details = { owner: 'adobe', repo: 'demo', name: 'page', fullpath: '/adobe/demo/page.html' };
  el._editor = engine;
  el._state = engine.getState();
  el._context = { status: 'ready', schemaName: 'demo', schema: demoSchema, json };
  el._nav = { pointer: '/data', origin: null, seq: 0 };
  el.ctx = { org: 'adobe', repo: 'demo', path: 'adobe/demo/page' };

  await el.updateComplete;
  return el;
}

describe('nx-form', () => {
  it('renders nothing without a ctx', async () => {
    const el = makeForm();
    await el.updateComplete;
    expect(el.shadowRoot.childElementCount).to.equal(0);
  });

  it('renders the editor, preview, and sidebar when ready', async () => {
    const el = await mountReady();
    expect(el.shadowRoot.querySelector('nx-editor')).to.exist;
    expect(el.shadowRoot.querySelector('nx-preview')).to.exist;
    expect(el.shadowRoot.querySelector('nx-sidebar')).to.exist;
  });

  it('shows the preview by default', async () => {
    const el = await mountReady();
    expect(el.shadowRoot.querySelector('nx-preview')).to.exist;
    expect(el.shadowRoot.querySelector('.nx-editor-pane-with-preview')).to.exist;
  });

  it('removes the preview when the JSON preview is disabled', async () => {
    const el = await mountReady();
    el._previewEnabled = false;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('nx-preview')).to.not.exist;
    expect(el.shadowRoot.querySelector('.nx-editor-pane-with-preview')).to.not.exist;
  });

  it('passes the engine and state into the editor', async () => {
    const el = await mountReady();
    const editor = el.shadowRoot.querySelector('nx-editor');
    expect(editor.editor).to.equal(el._editor);
    expect(editor.state).to.equal(el._state);
  });

  it('renders a blocked message for a missing schema', async () => {
    const el = makeForm();
    el._context = {
      status: 'blocked',
      blocker: { type: 'missing-schema', schemaName: 'ghost' },
      displayPath: '/adobe/demo/page',
    };
    el.ctx = { org: 'adobe', repo: 'demo', path: 'adobe/demo/page' };
    await el.updateComplete;
    const heading = el.shadowRoot.querySelector('.nx-form-message h2');
    expect(heading.textContent).to.equal('Schema not found');
  });

  it('renders the schema selector when asked to choose', async () => {
    const el = makeForm();
    el._context = {
      status: 'select-schema',
      schemas: { demo: demoSchema },
    };
    el.ctx = { org: 'adobe', repo: 'demo', path: 'adobe/demo/page' };
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.nx-form-schema-heading')).to.exist;
    expect(el.shadowRoot.querySelector('form-picker')).to.exist;
    // The "open Schema Editor" guidance renders as a sibling of the picker (it
    // used to rely on form-picker's description slot, which no longer exists).
    const link = el.shadowRoot.querySelector('.nx-form-schema-hint .nx-form-schema-text-link');
    expect(link, 'schema editor link').to.exist;
    expect(link.textContent).to.equal('Schema Editor');
  });

  it('seeds empty rows for a required array up to minItems on load', async () => {
    const schema = {
      type: 'object',
      title: 'Demo',
      required: ['tags'],
      properties: { tags: { type: 'array', title: 'Tags', minItems: 3, items: { type: 'string', title: 'Tag' } } },
    };
    const el = makeForm();
    el._start({ schema, json: validDoc({}) });
    await el.updateComplete;
    expect(el._editor.getState().document.data.tags).to.have.lengthOf(3);
  });

  it('does not seed an optional array', async () => {
    const schema = {
      type: 'object',
      title: 'Demo',
      properties: { tags: { type: 'array', title: 'Tags', minItems: 3, items: { type: 'string', title: 'Tag' } } },
    };
    const el = makeForm();
    el._start({ schema, json: validDoc({}) });
    await el.updateComplete;
    const { tags } = el._editor.getState().document.data;
    expect(tags === undefined || tags.length === 0).to.equal(true);
  });
});
