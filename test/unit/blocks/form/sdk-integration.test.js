import { expect } from '@esm-bundle/chai';
import '../../setup-nx.js';
import {
  createEngine,
  convertJsonToHtml,
  convertHtmlToJson,
} from '../../../../deps/da-sc-sdk/dist/index.js';
import { attachPersistence } from '../../../../blocks/form/utils/persistence.js';

// Integration tests for the form block ↔ da-sc-sdk contract, exercising
// the REAL bundled SDK at `nx/deps/da-sc-sdk/dist/index.js`.
//
// Goal: detect SDK breaking changes before they reach production. Every
// SDK surface the form block depends on is exercised here:
//
//   imports          createEngine, convertJsonToHtml, convertHtmlToJson
//   engine methods   getState, setField, addItem, insertItem, removeItem, moveItem
//   state shape      document, model.root (kind / pointer / label / value /
//                    required / children / items / enumValues / semanticType /
//                    minItems / maxItems), validation.errors[p].message, schemaIssues
//                    (reason / message / schemaPath / pointer / details)
//   semantics        onChange fires once per real mutation; not at construction;
//                    not on no-ops; defaults materialize into empty data
//   error shapes     convertJsonToHtml / convertHtmlToJson return { error }
//                    on bad input (persistence.js depends on this branch)
//   end-to-end       attachPersistence saves after a real engine mutation
//
// These tests intentionally avoid stubbing the SDK. The stub-based tests in
// utils/persistence.test.js cover persistence's behavioral edge cases under
// deterministic timing; this file covers the SDK ↔ form-block boundary.

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

// Schema covering every node kind the form's renderer switches on:
// string / integer / boolean / enum / array / nested object — plus
// minItems/maxItems on the array and a default on a primitive (for the
// defaults-materialization assertion).
const richSchema = {
  type: 'object',
  title: 'Rich',
  required: ['name'],
  properties: {
    name: { type: 'string', title: 'Name' },
    age: { type: 'integer', title: 'Age', minimum: 0 },
    active: { type: 'boolean', title: 'Active', default: true },
    role: { type: 'string', title: 'Role', enum: ['admin', 'editor', 'viewer'] },
    tags: {
      type: 'array',
      title: 'Tags',
      items: { type: 'string', title: 'Tag' },
      minItems: 1,
      maxItems: 5,
    },
    profile: {
      type: 'object',
      title: 'Profile',
      properties: { bio: { type: 'string', title: 'Bio' } },
    },
  },
};

// editor.js + sidebar.js walk the model via `node.children` (objects) and
// `node.items` (arrays). Same walker so the smoke tests fail loudly if
// either field name changes.
function findByPointer(node, pointer) {
  if (!node) return null;
  if (node.pointer === pointer) return node;
  const subtrees = node.children ?? node.items ?? [];
  for (const child of subtrees) {
    const found = findByPointer(child, pointer);
    if (found) return found;
  }
  return null;
}

describe('SDK API surface', () => {
  it('every export the form block imports is a function', () => {
    expect(createEngine).to.be.a('function');
    expect(convertJsonToHtml).to.be.a('function');
    expect(convertHtmlToJson).to.be.a('function');
  });

  it('engine exposes every method the form block calls', () => {
    const engine = createEngine({ schema: demoSchema, document: validDoc() });
    expect(engine.getState).to.be.a('function');
    expect(engine.setField).to.be.a('function');
    expect(engine.addItem).to.be.a('function');
    expect(engine.insertItem).to.be.a('function');
    expect(engine.removeItem).to.be.a('function');
    expect(engine.moveItem).to.be.a('function');
  });
});

describe('SDK state shape', () => {
  it('getState() exposes the fields the form block reads', () => {
    const engine = createEngine({ schema: demoSchema, document: validDoc({ name: 'Alice' }) });
    const state = engine.getState();

    // persistence.js + preview.js
    expect(state.document).to.have.property('metadata');
    expect(state.document).to.have.property('data');
    expect(state.document.data.name).to.equal('Alice');

    // form.js + sidebar.js + editor.js
    expect(state.model).to.be.an('object');
    expect(state.model).to.have.property('root');

    // editor.js
    expect(state.validation).to.have.property('errors');
    expect(state.schemaIssues).to.be.an('array');
  });

  it('surfaces x-semantic-type onto the model node, dropping unknown values (read by editor.js)', () => {
    const schema = {
      type: 'object',
      title: 'Article',
      properties: {
        body: { type: 'string', title: 'Body', 'x-semantic-type': 'long-text' },
        swatch: { type: 'string', title: 'Swatch', 'x-semantic-type': 'color' },
      },
    };
    const engine = createEngine({ schema, document: validDoc({ body: 'hi', swatch: '#fff' }) });
    const { root } = engine.getState().model;

    expect(findByPointer(root, '/data/body').semanticType).to.equal('long-text');
    // Unrecognized value is not surfaced — the node carries no hint.
    expect(findByPointer(root, '/data/swatch').semanticType).to.equal(undefined);
  });

  it('validation.errors entries carry a .message field (read by editor.js)', () => {
    // Force a required-field error; the schema requires `name` and we omit it.
    const engine = createEngine({ schema: demoSchema, document: validDoc() });
    const entry = engine.getState().validation.errors['/data/name'];

    expect(entry).to.be.an('object');
    expect(entry.message).to.be.a('string');
  });
});

describe('SDK engine mutations', () => {
  it('setField updates the document and produces a new reference', () => {
    const engine = createEngine({ schema: demoSchema, document: validDoc() });
    const before = engine.getState().document;
    engine.setField('/data/name', 'Bob');
    const after = engine.getState().document;
    expect(after).to.not.equal(before);
    expect(after.data.name).to.equal('Bob');
  });

  it('setField with current value is a no-op (state reference preserved)', () => {
    const engine = createEngine({ schema: demoSchema, document: validDoc({ name: 'Bob' }) });
    const before = engine.getState().document;
    engine.setField('/data/name', 'Bob');
    const after = engine.getState().document;
    expect(after).to.equal(before);
  });

  it('addItem appends a slot to the array at the pointer', () => {
    const engine = createEngine({ schema: demoSchema, document: validDoc({ name: 'A', tags: [] }) });
    engine.addItem('/data/tags');
    expect(engine.getState().document.data.tags).to.have.lengthOf(1);
  });

  it('insertItem inserts before the pointer', () => {
    const engine = createEngine({
      schema: demoSchema,
      document: validDoc({ name: 'A', tags: ['existing'] }),
    });
    engine.insertItem('/data/tags/0');
    const { tags } = engine.getState().document.data;
    expect(tags).to.have.lengthOf(2);
    expect(tags[1]).to.equal('existing'); // existing moved right
  });

  it('removeItem removes the item at the pointer', () => {
    const engine = createEngine({
      schema: demoSchema,
      document: validDoc({ name: 'A', tags: ['a', 'b'] }),
    });
    engine.removeItem('/data/tags/0');
    expect(engine.getState().document.data.tags).to.deep.equal(['b']);
  });

  it('moveItem reorders items in the array at the pointer', () => {
    const engine = createEngine({
      schema: demoSchema,
      document: validDoc({ name: 'A', tags: ['a', 'b', 'c'] }),
    });
    engine.moveItem('/data/tags', 0, 2);
    expect(engine.getState().document.data.tags).to.deep.equal(['b', 'c', 'a']);
  });
});

describe('SDK onChange semantics', () => {
  it('does not fire during createEngine construction', () => {
    let calls = 0;
    createEngine({
      schema: demoSchema,
      document: validDoc(),
      onChange: () => { calls += 1; },
    });
    expect(calls).to.equal(0);
  });

  it('fires exactly once per real mutation', () => {
    let calls = 0;
    const engine = createEngine({
      schema: demoSchema,
      document: validDoc(),
      onChange: () => { calls += 1; },
    });
    engine.setField('/data/name', 'Alice');
    expect(calls).to.equal(1);
    engine.setField('/data/name', 'Bob');
    expect(calls).to.equal(2);
  });

  it('does not fire on a no-op mutation (same value)', () => {
    let calls = 0;
    const engine = createEngine({
      schema: demoSchema,
      document: validDoc({ name: 'Alice' }),
      onChange: () => { calls += 1; },
    });
    engine.setField('/data/name', 'Alice');
    expect(calls).to.equal(0);
  });
});

describe('SDK converters', () => {
  it('convertJsonToHtml round-trips with convertHtmlToJson', () => {
    const original = validDoc({ name: 'Alice', tags: ['x', 'y'] });

    const forward = convertJsonToHtml({ json: original });
    expect(forward.error).to.equal(undefined);
    expect(forward.html).to.be.a('string');

    const back = convertHtmlToJson({ html: forward.html });
    expect(back.error).to.equal(undefined);
    expect(back.json).to.deep.equal(original);
  });

  it('convertJsonToHtml returns { error } on input without schemaName', () => {
    // persistence.js relies on this branch: `if (error) return;`
    const result = convertJsonToHtml({ json: { metadata: {}, data: {} } });
    expect(result.html).to.equal(undefined);
    expect(result.error).to.be.a('string');
  });

  it('convertHtmlToJson returns { error } on empty input', () => {
    const result = convertHtmlToJson({ html: '' });
    expect(result.json).to.equal(undefined);
    expect(result.error).to.be.a('string');
  });
});

describe('SDK × attachPersistence (end-to-end)', () => {
  it('saves after a real mutation through createEngine', async () => {
    let p;
    const calls = [];
    const save = async ({ path, html }) => { calls.push({ path, html }); };

    const editor = createEngine({
      schema: demoSchema,
      document: validDoc({ name: 'init' }),
      onChange: () => p?.notify(),
    });
    p = attachPersistence(editor, { path: '/smoke', save });

    editor.setField('/data/name', 'Alice');
    await new Promise((r) => { setTimeout(r, 0); });

    expect(calls).to.have.lengthOf(1);
    expect(calls[0].path).to.equal('/smoke');
    expect(calls[0].html).to.include('Alice');
    p.detach();
  });

  it('does not save when no real mutation occurs', async () => {
    let p;
    const calls = [];
    const save = async ({ path, html }) => { calls.push({ path, html }); };

    const editor = createEngine({
      schema: demoSchema,
      document: validDoc({ name: 'Alice' }),
      onChange: () => p?.notify(),
    });
    p = attachPersistence(editor, { path: '/smoke', save });

    editor.setField('/data/name', 'Alice'); // no-op
    await new Promise((r) => { setTimeout(r, 0); });

    expect(calls).to.have.lengthOf(0);
    p.detach();
  });
});

// editor.js + sidebar.js render entirely off the shape of nodes inside
// `state.model.root`. The earlier tests only assert `root` exists; these
// walk into it so a rename of `kind` / `children` / `items` / `value` /
// `enumValues` / `itemLabel` / `minItems` / `maxItems` would fail loudly
// instead of producing a silently-blank editor.
describe('SDK model.root node shape', () => {
  it('root tree is navigable via node.children / node.items to every schema property', () => {
    const engine = createEngine({
      schema: richSchema,
      document: validDoc({ name: 'A', tags: ['x'] }),
    });
    const { root } = engine.getState().model;
    expect(root).to.be.an('object');
    expect(findByPointer(root, '/data/name'), '/data/name not reachable').to.exist;
    expect(findByPointer(root, '/data/age'), '/data/age not reachable').to.exist;
    expect(findByPointer(root, '/data/active'), '/data/active not reachable').to.exist;
    expect(findByPointer(root, '/data/role'), '/data/role not reachable').to.exist;
    expect(findByPointer(root, '/data/tags'), '/data/tags not reachable').to.exist;
    expect(findByPointer(root, '/data/profile'), '/data/profile not reachable').to.exist;
  });

  it('primitive string node carries every field _renderPrimitive reads', () => {
    // editor.js:132–172 — kind / pointer / label / value / required.
    const engine = createEngine({
      schema: richSchema,
      document: validDoc({ name: 'Alice' }),
    });
    const node = findByPointer(engine.getState().model.root, '/data/name');
    expect(node.kind).to.equal('string');
    expect(node.pointer).to.equal('/data/name');
    expect(node.label).to.be.a('string');
    expect(node.value).to.equal('Alice');
    expect(node.required).to.equal(true);
  });

  it('boolean / integer nodes use the kind discriminator the renderer switches on', () => {
    // editor.js:195 ('boolean'), 208 ('number' || 'integer').
    const engine = createEngine({
      schema: richSchema,
      document: validDoc({ name: 'A', active: true, age: 30 }),
    });
    const { root } = engine.getState().model;
    expect(findByPointer(root, '/data/active').kind).to.equal('boolean');
    expect(findByPointer(root, '/data/age').kind).to.equal('integer');
  });

  it('enum node exposes enumValues so _renderPrimitive can render <sl-select>', () => {
    // editor.js:174,188.
    const engine = createEngine({ schema: richSchema, document: validDoc({ name: 'A' }) });
    const node = findByPointer(engine.getState().model.root, '/data/role');
    expect(node.enumValues).to.deep.equal(['admin', 'editor', 'viewer']);
  });

  it('object node exposes a children array — _renderObject reads node.children', () => {
    // editor.js:310,323; sidebar.js:57.
    const engine = createEngine({ schema: richSchema, document: validDoc({ name: 'A' }) });
    const node = findByPointer(engine.getState().model.root, '/data/profile');
    expect(node.kind).to.equal('object');
    expect(node.children).to.be.an('array').that.is.not.empty;
  });

  it('array node exposes items + minItems + maxItems — _renderArray reads these', () => {
    // editor.js:330–337 reads items / minItems / maxItems for the add/disable logic.
    const engine = createEngine({
      schema: richSchema,
      document: validDoc({ name: 'A', tags: ['x', 'y'] }),
    });
    const node = findByPointer(engine.getState().model.root, '/data/tags');
    expect(node.kind).to.equal('array');
    expect(node.items).to.have.lengthOf(2);
    expect(node.minItems).to.equal(1);
    expect(node.maxItems).to.equal(5);
  });

  it('createEngine materializes schema defaults into an empty document.data at construction', () => {
    // form.js:113–119 — when the user picks a schema, the shell hands
    // createEngine an empty `data: {}` and relies on the SDK to fill in
    // defaults so the editor renders a usable starting state. editor.js:136–139
    // assumes those defaults are already present (the renderer never
    // synthesizes them).
    const engine = createEngine({
      schema: richSchema,
      document: validDoc(),
    });
    expect(engine.getState().document.data.active).to.equal(true);
  });
});

// editor.js — describeIssue switches on issue.reason and reads the offending
// value from issue.details (details.keyword / details.type / details.ref).
// If the SDK issue shape drifts, the dialog would silently render "unknown";
// these assertions catch that.
describe('SDK schemaIssues entry shape', () => {
  const issueSchema = {
    type: 'object',
    properties: {
      // oneOf at a property is known unsupported by the form's renderer —
      // editor.js maps `reason: 'unsupported-composition'` to a human-readable string.
      weird: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    },
  };

  it('schemaIssues is populated when the schema uses unsupported composition', () => {
    const engine = createEngine({ schema: issueSchema, document: validDoc() });
    const issues = engine.getState().schemaIssues;
    expect(issues).to.be.an('array').that.is.not.empty;
  });

  it('each entry carries reason + message + schemaPath + pointer + details', () => {
    const engine = createEngine({ schema: issueSchema, document: validDoc() });
    const [issue] = engine.getState().schemaIssues;
    expect(issue.reason).to.be.a('string');
    expect(issue.message).to.be.a('string');
    expect(issue.schemaPath).to.be.a('string');
    expect(issue.pointer).to.be.a('string');
    // Composition folds its keyword into details — describeIssue reads it there.
    expect(issue.details.keyword, 'issue.details.keyword').to.be.a('string');
  });
});

// editor.js:125 reads `state.validation.errors[pointer]?.message` for every
// rendered field's pointer. The earlier tests prove `errors['/data/name']`
// works for a single pointer the test itself wrote. This locks down that
// the form's flat-pointer lookup pattern works for *multiple* deep pointers
// in the same state.
describe('SDK validation.errors deep-pointer keying', () => {
  it('errors are keyed by RFC 6901 pointer strings, not nested objects', () => {
    const engine = createEngine({
      schema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          age: { type: 'integer', minimum: 18 },
        },
      },
      document: validDoc({ age: 5 }),
    });
    const { errors } = engine.getState().validation;
    // The form does `errors[node.pointer]` — a single flat lookup with a
    // pointer string. A nested layout (`errors.data.name`) would still pass
    // earlier tests that wrote and read the same key, but would silently
    // return undefined for the form.
    expect(errors['/data/name']).to.be.an('object');
    expect(errors['/data/name'].message).to.be.a('string');
    expect(errors['/data/age']).to.be.an('object');
    expect(errors['/data/age'].message).to.be.a('string');
  });
});
