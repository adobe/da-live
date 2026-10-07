import { expect } from '@esm-bundle/chai';
import { DOMParser as PMDOMParser } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { getBlockVariantOptions } from '../../../../../blocks/canvas/editor-utils/block-variants.js';
import { createExtensionsBridgePlugin, getExtensionsBridge } from '../../../../../blocks/canvas/editor-utils/extensions-bridge.js';
import { getBlockFieldDefinitions, resolveBlockFields } from '../../../../../blocks/canvas/editor-utils/block-fields.js';

const schema = getSchema();
const dom = (html) => {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container.firstElementChild;
};
const template = () => dom(`
  <table><tr><td>Hero (left)</td></tr>
    <tr><td><picture><img src="/template.png"></picture></td></tr>
    <tr><td><h1>Template title</h1><p>Template subheading</p></td></tr>
  </table>`);
const metadata = () => dom(`
  <table><tr><td><p>fields</p></td></tr>
    <tr><td><p>image</p></td></tr>
    <tr><td><p>title</p><p>subheading</p></td></tr>
  </table>`);
const library = (items) => [{ loadVariants: Promise.resolve(items) }];
const definitionsFor = (items, variant = 'left') => getBlockFieldDefinitions(library(items), 'hero', variant, schema);
const selectedBlock = (table, from = 0) => {
  const container = document.createElement('div');
  container.append(table);
  return { node: PMDOMParser.fromSchema(schema).parse(container).firstChild, from };
};

describe('block fields', () => {
  it('maps labels by row, cell and element, inferring types from the template', async () => {
    const definitions = await definitionsFor([{ dom: template(), fields: metadata() }]);
    expect(definitions.map(({ label, type, path }) => ({ label, type, path }))).to.deep.equal([
      { label: 'image', type: 'image', path: [1, 0, 0, 0] },
      { label: 'title', type: 'text', path: [2, 0, 0] },
      { label: 'subheading', type: 'text', path: [2, 0, 1] },
    ]);
  });

  it('does not infer an image type from the field name', async () => {
    const fields = metadata();
    fields.rows[2].cells[0].children[0].textContent = 'image';
    const definitions = await definitionsFor([{ dom: template(), fields }]);
    expect(definitions[1].type).to.equal('text');
  });

  it('matches the actual block header, not the library display heading', async () => {
    const center = template();
    center.rows[0].cells[0].textContent = 'hero (center)';
    const fields = metadata();
    fields.rows[2].cells[0].children[0].textContent = 'Centered title';
    const definitions = await definitionsFor([
      { name: 'Hero (Text Start)', dom: template(), fields: metadata() },
      { name: 'Hero (Center)', dom: center, fields },
    ], 'CENTER');
    expect(definitions[1].label).to.equal('Centered title');
    const options = await getBlockVariantOptions(library([
      { name: 'Hero (Text Start)', dom: template(), fields: metadata() },
      { name: 'Hero (Center)', dom: center, fields },
    ]), 'hero');
    expect(options).to.deep.equal(['left', 'center']);
  });

  it('leaves blocks without fields or an exact variant match unchanged', async () => {
    expect(await definitionsFor([{ dom: template() }])).to.deep.equal([]);
    expect(await definitionsFor([{ dom: template(), fields: metadata() }], 'custom'))
      .to.deep.equal([]);
  });

  it('resolves current values and absolute positions rather than template values', async () => {
    const definitions = await definitionsFor([{ dom: template(), fields: metadata() }]);
    const current = template();
    current.querySelector('img').src = '/current.png';
    current.querySelector('h1').textContent = 'Current title';
    const block = selectedBlock(current, 10);
    const fields = resolveBlockFields(block, definitions);
    expect(fields.map((field) => field.value)).to.deep.equal([
      '/current.png', 'Current title', 'Template subheading',
    ]);
    fields.forEach((field) => {
      expect(field.error).to.equal('');
      const relative = field.pos - block.from - 1;
      expect(block.node.nodeAt(relative)).to.equal(field.node);
    });
  });

  it('maps multiple columns and keeps empty labels as skipped positions', async () => {
    const table = dom('<table><tr><td colspan="2">Hero (left)</td></tr><tr><td><p>Skip</p></td><td><p>Value</p></td></tr></table>');
    const fields = dom('<table><tr><td colspan="2">fields</td></tr><tr><td><p></p></td><td><p>label</p></td></tr></table>');
    const definitions = await definitionsFor([{ dom: table, fields }]);
    expect(definitions.map(({ label, path }) => ({ label, path }))).to.deep.equal([
      { label: 'label', path: [1, 1, 0] },
    ]);
  });

  it('matches paragraph labels to any text block, including different heading levels', async () => {
    const definitions = await definitionsFor([{ dom: template(), fields: metadata() }]);
    const current = template();
    current.rows[2].cells[0].innerHTML = '<p>Plain title</p><h3>Heading subheading</h3>';
    const fields = resolveBlockFields(selectedBlock(current), definitions);
    expect(fields.map(({ value, error }) => ({ value, error }))).to.deep.equal([
      { value: '/template.png', error: '' },
      { value: 'Plain title', error: '' },
      { value: 'Heading subheading', error: '' },
    ]);
  });

  it('resolves text and image fields by content order rather than wrapper paths', async () => {
    const definitions = await definitionsFor([{ dom: template(), fields: metadata() }]);
    const current = template();
    current.rows[1].cells[0].innerHTML = '<blockquote><p><img src="/wrapped.png"></p></blockquote>';
    current.rows[2].cells[0].innerHTML = '<blockquote><h2>Wrapped title</h2></blockquote><p>Subtitle</p>';
    const block = selectedBlock(current, 10);
    const fields = resolveBlockFields(block, definitions);
    expect(fields.every((field) => !field.error)).to.equal(true);
    expect(fields.map((field) => field.value)).to.deep.equal([
      '/wrapped.png', 'Wrapped title', 'Subtitle',
    ]);
    fields.forEach((field) => {
      expect(block.node.nodeAt(field.pos - block.from - 1)).to.equal(field.node);
    });
  });

  it('ignores empty image-cell spacer paragraphs in templates and selected blocks', async () => {
    const table = template();
    table.rows[1].cells[0].innerHTML = '<p></p><p><img src="/template.png"></p><p></p>';
    const definitions = await definitionsFor([{ dom: table, fields: metadata() }]);
    const current = template();
    current.rows[1].cells[0].innerHTML = '<p><img src="/current.png"></p><p></p>';
    const block = selectedBlock(current);
    const fields = resolveBlockFields(block, definitions);
    expect(fields.every((field) => !field.error)).to.equal(true);
    expect(fields[0].value).to.equal('/current.png');
    expect(block.node.nodeAt(fields[0].pos - 1)).to.equal(fields[0].node);
  });

  it('keeps declared empty text fields instead of skipping them', async () => {
    const definitions = await definitionsFor([{ dom: template(), fields: metadata() }]);
    const current = template();
    current.querySelector('h1').textContent = '';
    const fields = resolveBlockFields(selectedBlock(current), definitions);
    expect(fields[1].value).to.equal('');
    expect(fields[1].node.type.name).to.equal('heading');
    expect(fields[1].error).to.equal('');
    expect(fields[2].value).to.equal('Template subheading');
  });

  it('preserves empty declared fields when the selected cell has extra trailing text', async () => {
    const definitions = await definitionsFor([{ dom: template(), fields: metadata() }]);
    const current = template();
    current.rows[2].cells[0].innerHTML = '<h1></h1><p>Subtitle</p><p>Extra text</p>';
    const fields = resolveBlockFields(selectedBlock(current), definitions);
    expect(fields[1].value).to.equal('');
    expect(fields[1].node.type.name).to.equal('heading');
    expect(fields[2].value).to.equal('Subtitle');
    expect(fields.every((field) => !field.error)).to.equal(true);
  });

  it('disables mismatched selected content instead of treating it as another type', async () => {
    const definitions = await definitionsFor([{ dom: template(), fields: metadata() }]);
    const current = template();
    current.rows[1].cells[0].innerHTML = '<p>No image here</p>';
    const fields = resolveBlockFields(selectedBlock(current), definitions);
    expect(fields[0].node).to.equal(null);
    expect(fields[0].error).to.include('structure');
    expect(fields[1].value).to.equal('Template title');
  });

  it('disables fields when rows or elements no longer match the template', async () => {
    const definitions = await definitionsFor([{ dom: template(), fields: metadata() }]);
    const current = template();
    current.querySelector('h1').remove();
    const fields = resolveBlockFields(selectedBlock(current), definitions);
    expect(fields[1].node).to.equal(null);
    expect(fields[2].node).to.equal(null);
    current.deleteRow(1);
    expect(resolveBlockFields(selectedBlock(current), definitions).every((field) => field.error))
      .to.equal(true);
  });

  it('exposes the editor source URL for field uploads and clears it on teardown', () => {
    const view = { state: { doc: schema.topNodeType.createAndFill() } };
    const sourceUrl = 'https://admin.da.live/source/org/site/page.html';
    const pluginView = createExtensionsBridgePlugin(sourceUrl).spec.view(view);
    expect(getExtensionsBridge().view).to.equal(view);
    expect(getExtensionsBridge().sourceUrl).to.equal(sourceUrl);
    pluginView.destroy();
    expect(getExtensionsBridge().view).to.equal(null);
    expect(getExtensionsBridge().sourceUrl).to.equal(null);
  });

  it('reports malformed metadata explicitly', async () => {
    for (const fields of ['', 'image title', dom('<table><tr><td>fields</td></tr></table>')]) {
      let error;
      try {
        await definitionsFor([{ dom: template(), fields }]);
      } catch (caught) {
        error = caught;
      }
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.include('metadata');
    }
  });
});
