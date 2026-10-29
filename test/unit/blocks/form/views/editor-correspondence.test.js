import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import { createEngine } from '../../../../../deps/da-sc-sdk/dist/index.js';
import '../../../../../blocks/form/views/editor.js';

// Component-level UI tests for nx-editor. The engine is the real bundled SDK
// (same one the form block ships); we feed its getState() into the component
// and assert on the rendered shadow DOM — the repo's standard UI-test idiom.

const tick = () => new Promise((r) => { setTimeout(r); });
const settle = async (el) => {
  await el.updateComplete;
  await tick();
  await el.updateComplete;
};

const CONTROL_TAGS = ['FORM-INPUT', 'FORM-TEXTAREA', 'FORM-NUMBER-FIELD', 'FORM-CHECKBOX', 'FORM-PICKER'];

const mounted = [];
afterEach(() => { while (mounted.length) mounted.pop().remove(); });

async function mountEditor(schema, doc) {
  const el = window.document.createElement('nx-editor');
  // Play the shell: push fresh state on every engine mutation.
  const engine = createEngine({
    schema,
    document: doc,
    onChange: () => { el.state = engine.getState(); },
  });
  el.editor = engine;
  el.onSelect = () => {};
  el.nav = {};
  el.state = engine.getState();
  window.document.body.append(el);
  mounted.push(el);
  await settle(el);
  return { el, engine };
}

const esc = (p) => (window.CSS && CSS.escape ? CSS.escape(p) : p.replace(/"/g, '\\"'));
const allAt = (el, ptr) => [...el.shadowRoot.querySelectorAll(`[data-pointer="${esc(ptr)}"]`)];
const controlAt = (el, ptr) => allAt(el, ptr).find((n) => CONTROL_TAGS.includes(n.tagName));
const groupAt = (el, ptr) => allAt(el, ptr)
  .find((n) => n.matches('fieldset.form-node, section.form-node, article.form-array-item'));

function expectedTag(node) {
  if (Array.isArray(node.enumValues)) return 'FORM-PICKER';
  if (node.kind === 'boolean') return 'FORM-CHECKBOX';
  if (node.kind === 'number' || node.kind === 'integer') return 'FORM-NUMBER-FIELD';
  if (node.kind === 'string' && node.semanticType === 'long-text') return 'FORM-TEXTAREA';
  return 'FORM-INPUT';
}

const FEATURE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Feature Test Model',
  type: 'object',
  required: ['title', 'status'],
  properties: {
    title: { type: 'string', title: 'Title', minLength: 3, maxLength: 255 },
    status: { type: 'string', title: 'Status', enum: ['draft', 'in-review', 'published', 'archived'], default: 'draft' },
    body: { type: 'string', title: 'Body', 'x-semantic-type': 'long-text' },
    priority: { type: 'integer', title: 'Priority', minimum: 1, maximum: 10 },
    featured: { type: 'boolean', title: 'Featured', default: false },
    tags: { type: 'array', title: 'Tags', minItems: 1, items: { type: 'string', title: 'Tag' } },
    authors: { type: 'array', title: 'Authors', items: { $ref: '#/$defs/Author' } },
    seo: {
      type: 'object',
      title: 'SEO',
      properties: {
        metaTitle: { type: 'string', title: 'Meta Title', maxLength: 60 },
        noIndex: { type: 'boolean', title: 'No Index' },
      },
    },
  },
  $defs: {
    Author: {
      type: 'object',
      title: 'Author',
      required: ['name'],
      properties: {
        name: { type: 'string', title: 'Name' },
        role: { type: 'string', title: 'Role', enum: ['writer', 'editor', 'reviewer'], default: 'writer' },
      },
    },
  },
};

const featureDoc = (data = {}) => ({
  metadata: { schemaName: 'feature-test' },
  data: {
    title: 'Launch Announcement',
    status: 'published',
    body: 'Body copy.',
    priority: 3,
    featured: true,
    tags: ['news', 'launch'],
    authors: [
      { name: 'Ada Lovelace', role: 'writer' },
      { name: 'Grace Hopper', role: 'editor' },
    ],
    seo: { metaTitle: 'Launch Announcement', noIndex: false },
    ...data,
  },
});

describe('nx-editor loads', () => {
  it('renders the root and one element per top-level model field', async () => {
    const { el } = await mountEditor(FEATURE_SCHEMA, featureDoc());
    expect(el.shadowRoot.querySelector('.editor-root')).to.exist;
    const { children } = el.state.model.root;
    expect(children.length).to.be.greaterThan(0);
    children.forEach((child) => {
      expect(allAt(el, child.pointer).length, child.pointer).to.be.greaterThan(0);
    });
  });
});

describe('nx-editor renders the model state', () => {
  function walk(el, node) {
    expect(allAt(el, node.pointer).length, `element for ${node.pointer}`).to.be.greaterThan(0);
    if (node.kind === 'object') {
      (node.children ?? []).forEach((child) => walk(el, child));
      return;
    }
    if (node.kind === 'array') {
      const section = groupAt(el, node.pointer);
      const rows = section.querySelectorAll(':scope > .form-array-item');
      expect(rows.length, `rows for ${node.pointer}`).to.equal((node.items ?? []).length);
      (node.items ?? []).forEach((item) => walk(el, item));
      return;
    }
    expect(controlAt(el, node.pointer)?.tagName, `control for ${node.pointer}`).to.equal(expectedTag(node));
  }

  it('renders a matching element and control for every node', async () => {
    const { el } = await mountEditor(FEATURE_SCHEMA, featureDoc());
    walk(el, el.state.model.root);
  });

  it('renders the enum picker with the schema options and default', async () => {
    const { el } = await mountEditor(FEATURE_SCHEMA, featureDoc({ status: undefined }));
    const picker = controlAt(el, '/data/status');
    expect(picker.tagName).to.equal('FORM-PICKER');
    // form-picker relocates slotted <option>s into its shadow <select> and
    // prepends a placeholder (empty value); filter that out.
    const options = [...picker.shadowRoot.querySelectorAll('select option')]
      .map((o) => o.value).filter(Boolean);
    expect(options).to.deep.equal(['draft', 'in-review', 'published', 'archived']);
  });
});

describe('nx-editor add-array-item action', () => {
  const rows = (el, ptr) => groupAt(el, ptr).querySelectorAll(':scope > .form-array-item').length;

  it('adds an item to the DOM and the document when the add button is clicked', async () => {
    const { el, engine } = await mountEditor(FEATURE_SCHEMA, featureDoc());
    const before = rows(el, '/data/authors');
    const addBtn = groupAt(el, '/data/authors').querySelector('.add-item-btn');
    expect(addBtn).to.exist;
    addBtn.click();
    await settle(el);
    expect(rows(el, '/data/authors')).to.equal(before + 1);
    expect(engine.getState().document.data.authors.length).to.equal(before + 1);
  });

  it('disables the add button when maxItems is reached', async () => {
    const schema = {
      type: 'object',
      title: 'Capped',
      properties: { xs: { type: 'array', title: 'Xs', maxItems: 1, items: { type: 'string', title: 'X' } } },
    };
    const doc = { metadata: { schemaName: 'capped' }, data: { xs: ['a'] } };
    const { el } = await mountEditor(schema, doc);
    const addBtn = groupAt(el, '/data/xs').querySelector('.add-item-btn');
    expect(addBtn.disabled).to.equal(true);
  });
});

// The Add action is covered above; these drive the per-row menu actions
// (remove / insert / reorder) end-to-end through the real buttons, and assert
// both the DOM and the engine document change.
describe('nx-editor array item menu actions', () => {
  const ACTION_SCHEMA = {
    type: 'object',
    title: 'T',
    properties: {
      authors: {
        type: 'array',
        title: 'Authors',
        items: {
          type: 'object',
          title: 'Author',
          properties: { name: { type: 'string', title: 'Name' } },
        },
      },
    },
  };
  const actionDoc = (authors) => ({ metadata: { schemaName: 't' }, data: { authors } });
  const rowCount = (el) => groupAt(el, '/data/authors').querySelectorAll(':scope > .form-array-item').length;
  const menuOf = (el, ptr) => el.shadowRoot.querySelector(`[data-pointer="${esc(ptr)}"] nx-array-menu`);
  const menuItem = (menu, re) => [...menu.shadowRoot.querySelectorAll('.menu-item')].find((b) => re.test(b.textContent));
  async function openMenu(el, ptr) {
    menuOf(el, ptr).shadowRoot.querySelector('.menu-trigger').click();
    await settle(el);
    return menuOf(el, ptr);
  }

  it('removes a row from the DOM and the document when Remove is confirmed', async () => {
    const { el, engine } = await mountEditor(ACTION_SCHEMA, actionDoc([{ name: 'Ada' }, { name: 'Grace' }]));
    expect(rowCount(el)).to.equal(2);
    const menu = await openMenu(el, '/data/authors/0');
    menuItem(menu, /remov/i).click(); // arms the confirm step
    await settle(el);
    menuItem(menu, /remov/i).click(); // confirms -> emits array-remove
    await settle(el);
    expect(rowCount(el)).to.equal(1);
    expect(engine.getState().document.data.authors).to.deep.equal([{ name: 'Grace' }]);
  });

  it('inserts a row before the item when Insert before is chosen', async () => {
    const { el, engine } = await mountEditor(ACTION_SCHEMA, actionDoc([{ name: 'Ada' }]));
    const menu = await openMenu(el, '/data/authors/0');
    menuItem(menu, /insert/i).click();
    await settle(el);
    expect(rowCount(el)).to.equal(2);
    const { authors } = engine.getState().document.data;
    // Inserted before -> the new (empty) row is index 0, Ada shifts to index 1.
    expect(authors).to.have.lengthOf(2);
    expect(authors[1]).to.deep.equal({ name: 'Ada' });
  });

  it('reorders rows when a move is applied in the reorder toolbar', async () => {
    const { el, engine } = await mountEditor(ACTION_SCHEMA, actionDoc([{ name: 'Ada' }, { name: 'Grace' }]));
    const menu = await openMenu(el, '/data/authors/0');
    menuItem(menu, /reorder/i).click();
    await settle(el);
    el.shadowRoot.querySelector(`[data-pointer="${esc('/data/authors/0')}"] nx-reorder`)
      .shadowRoot.querySelector('[aria-label^="Move down"]').click();
    await settle(el);
    el.shadowRoot.querySelector(`[data-pointer="${esc('/data/authors/0')}"] nx-reorder`)
      .shadowRoot.querySelector('.reorder-confirm').click();
    await settle(el);
    expect(engine.getState().document.data.authors.map((a) => a.name)).to.deep.equal(['Grace', 'Ada']);
  });
});

const DEBOUNCE_MS = 350; // mirrors editor.js text-input debounce
const aTimeout = (ms) => new Promise((r) => { setTimeout(r, ms); });

// Leaf errors live in the field's own shadow (.form-field-error); array/object
// group errors render as a .form-node-error child of the fieldset/section.
const fieldErrorText = (el, ptr) => controlAt(el, ptr)?.shadowRoot?.querySelector('.form-field-error')?.textContent ?? '';
const groupErrorText = (el, ptr) => groupAt(el, ptr)?.querySelector(':scope > .form-node-error')?.textContent ?? '';
const errorText = (el, ptr) => fieldErrorText(el, ptr) || groupErrorText(el, ptr);

const engineErrors = (engine) => Object.fromEntries(
  Object.entries(engine.getState().validation.errors).map(([p, e]) => [p, e.message]),
);

function renderedErrorPointers(el) {
  const ptrs = new Set();
  el.shadowRoot.querySelectorAll('.form-node-error').forEach((p) => {
    const group = p.closest('[data-pointer]');
    if (group) ptrs.add(group.getAttribute('data-pointer'));
  });
  el.shadowRoot.querySelectorAll('[data-pointer]').forEach((node) => {
    if (CONTROL_TAGS.includes(node.tagName) && node.shadowRoot?.querySelector('.form-field-error')) {
      ptrs.add(node.getAttribute('data-pointer'));
    }
  });
  return ptrs;
}

async function typeInto(el, ptr, value) {
  const input = controlAt(el, ptr).shadowRoot.querySelector('input, textarea');
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  await aTimeout(DEBOUNCE_MS + 80);
  await settle(el);
}

const REQUIRED = 'This field is required.';

const VALIDATION_FIXTURES = [
  {
    name: 'leaf errors',
    schema: {
      type: 'object',
      title: 'T',
      properties: {
        title: { type: 'string', title: 'Title', minLength: 3 },
        status: { type: 'string', title: 'Status', enum: ['a', 'b'] },
      },
    },
    data: { title: 'ab', status: 'x' },
    expected: {
      '/data/title': 'Must be at least 3 characters.',
      '/data/status': 'Must be one of the allowed options.',
    },
  },
  {
    name: 'required empty array (array-level)',
    schema: {
      type: 'object',
      title: 'T',
      required: ['tags'],
      properties: { tags: { type: 'array', title: 'Tags', minItems: 1, items: { type: 'string', title: 'Tag' } } },
    },
    data: { tags: [] },
    expected: { '/data/tags': 'Must contain at least one item with content.' },
  },
  {
    name: 'array under minItems (array-level)',
    schema: {
      type: 'object',
      title: 'T',
      properties: { tags: { type: 'array', title: 'Tags', minItems: 2, items: { type: 'string', title: 'Tag' } } },
    },
    data: { tags: ['a'] },
    expected: { '/data/tags': 'Must contain at least 2 items with content.' },
  },
  {
    name: 'required empty object (object-level)',
    schema: {
      type: 'object',
      title: 'T',
      required: ['seo'],
      properties: { seo: { type: 'object', title: 'SEO', properties: { mt: { type: 'string', title: 'MT' } } } },
    },
    data: { seo: {} },
    expected: { '/data/seo': 'This section is required.' },
  },
  {
    name: 'nested required child (leaf-level)',
    schema: {
      type: 'object',
      title: 'T',
      properties: { seo: { type: 'object', title: 'SEO', required: ['mt'], properties: { mt: { type: 'string', title: 'MT' } } } },
    },
    data: { seo: {} },
    expected: { '/data/seo/mt': REQUIRED },
  },
];

describe('nx-editor applies validation errors', () => {
  VALIDATION_FIXTURES.forEach((fx) => {
    it(`renders ${fx.name} on the right elements`, async () => {
      const { el, engine } = await mountEditor(fx.schema, { metadata: { schemaName: 't' }, data: fx.data });
      // guard: the SDK produced exactly the expected errors
      expect(engineErrors(engine)).to.deep.equal(fx.expected);
      // each error renders on its pointer with the right message
      Object.entries(fx.expected).forEach(([ptr, msg]) => {
        expect(errorText(el, ptr), ptr).to.equal(msg);
      });
      // no stray or missing rendered errors
      expect([...renderedErrorPointers(el)].sort()).to.deep.equal(Object.keys(fx.expected).sort());
    });
  });

  it('clears a field error on valid input without touching siblings', async () => {
    const schema = {
      type: 'object',
      title: 'T',
      properties: {
        a: { type: 'string', title: 'A', minLength: 3 },
        b: { type: 'string', title: 'B', minLength: 3 },
      },
    };
    const { el } = await mountEditor(schema, { metadata: { schemaName: 't' }, data: { a: 'x', b: 'y' } });
    expect(fieldErrorText(el, '/data/a')).to.contain('at least 3');
    expect(fieldErrorText(el, '/data/b')).to.contain('at least 3');
    await typeInto(el, '/data/a', 'valid');
    expect(fieldErrorText(el, '/data/a')).to.equal('');
    expect(fieldErrorText(el, '/data/b')).to.contain('at least 3');
  });
});

describe('nx-editor renders descriptions', () => {
  it('renders field help text from a schema description', async () => {
    const schema = {
      type: 'object',
      title: 'T',
      properties: { slug: { type: 'string', title: 'Slug', description: 'Lowercase and hyphens.' } },
    };
    const { el } = await mountEditor(schema, { metadata: { schemaName: 't' }, data: {} });
    const desc = controlAt(el, '/data/slug').shadowRoot.querySelector('.form-field-description');
    expect(desc.textContent).to.equal('Lowercase and hyphens.');
  });

  it('renders group help text from a schema description', async () => {
    const schema = {
      type: 'object',
      title: 'T',
      properties: {
        seo: {
          type: 'object',
          title: 'SEO',
          description: 'Search settings.',
          properties: { mt: { type: 'string', title: 'MT' } },
        },
      },
    };
    const { el } = await mountEditor(schema, { metadata: { schemaName: 't' }, data: {} });
    const desc = groupAt(el, '/data/seo').querySelector(':scope > .form-node-description');
    expect(desc.textContent).to.equal('Search settings.');
  });
});

describe('nx-editor marks required fields', () => {
  it('adds the required asterisk to a required field label, not an optional one', async () => {
    const schema = {
      type: 'object',
      title: 'T',
      required: ['title'],
      properties: {
        title: { type: 'string', title: 'Title' },
        subtitle: { type: 'string', title: 'Subtitle' },
      },
    };
    const { el } = await mountEditor(schema, { metadata: { schemaName: 't' }, data: {} });
    const req = controlAt(el, '/data/title').shadowRoot.querySelector('.form-required');
    expect(req, 'asterisk on required field').to.exist;
    expect(req.textContent).to.equal('*');
    expect(controlAt(el, '/data/subtitle').shadowRoot.querySelector('.form-required')).to.equal(null);
  });
});
