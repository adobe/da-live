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
  it('supports the everything block metadata, including a single field for the list', async () => {
    const content = `<h1>Hello World</h1><p>Foo bar baz</p>
      <picture><img src="/everything.png"></picture>
      <ul><li>List</li><li>Item 2</li><li>Item 3</li></ul>
      <blockquote><p>A quote?</p></blockquote>
      <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.
        Sed do eiusmod tempor incididunt ut <a href="https://google.com">veniam</a>.</p>
      <p><a href="https://google.com">A link</a></p>`;
    const table = dom(`<table><tr><td colspan="2">Hero (left)</td></tr>
      <tr><td colspan="2">${content}</td></tr>
      <tr><td><p>Color</p></td><td><p>Green</p></td></tr>
      <tr><td><p>Left side</p></td><td><p>Right side</p></td></tr></table>`);
    const metadataTable = dom(`<table><tr><td colspan="2">fields</td></tr>
      <tr><td colspan="2"><p>title</p><p>tagline</p><p>image</p>
        <p>list below image</p><p>quote</p><p>long paragraph</p><p>link</p></td></tr>
      <tr><td>IGNORE</td><td>Color</td></tr>
      <tr><td>Left Column</td><td>Right Column</td></tr></table>`);
    const definitions = await definitionsFor([{ dom: table, fields: metadataTable }]);
    const block = selectedBlock(table, 10);
    const fields = resolveBlockFields(block, definitions);
    expect(fields.map((field) => field.label)).to.deep.equal([
      'title', 'tagline', 'image', 'list below image', 'quote', 'long paragraph',
      'link', 'Color', 'Left Column', 'Right Column',
    ]);
    expect(fields.every((field) => !field.error)).to.equal(true);
    expect(fields[3].type).to.equal('list');
    expect(fields[3].items.map((item) => item.value)).to.deep.equal(['List', 'Item 2', 'Item 3']);
    fields[3].items.forEach((item) => {
      expect(block.node.nodeAt(item.pos - block.from - 1)).to.equal(item.node);
    });
    expect(fields[4].value).to.equal('A quote?');
    expect(fields[5].readOnly).to.equal(true);
    expect(fields[6].href).to.equal('https://google.com');
    expect(fields[6].readOnly).to.equal(false);
    expect(fields[7].value).to.equal('Green');
    expect(fields[7].optionKey).to.equal('Color');
    expect(fields[8].optionKey).to.equal('');
    expect(fields[9].optionKey).to.equal('Left side');
  });

  it('only identifies single-text key/value rows as block-option candidates', async () => {
    for (const [key, value, labels, expected] of [
      ['<p>Color</p>', '<p>Green</p>', '<p>Value</p>', 'Color'],
      ['<blockquote><p>Color</p></blockquote>', '<p>Green</p>', '<p>Value</p>', ''],
      ['<p><img src="/key.png"></p>', '<p>Green</p>', '<p>Value</p>', ''],
      ['<p>Color</p>', '<p>Green</p><p>Extra</p>', '<p>Value</p><p>Extra</p>', ''],
      ['<p>Color<br>Extra</p>', '<p>Green</p>', '<p>Value</p>', ''],
    ]) {
      const table = dom(`<table><tr><td colspan="2">Hero (left)</td></tr>
        <tr><td>${key}</td><td>${value}</td></tr></table>`);
      const fields = dom(`<table><tr><td colspan="2">fields</td></tr>
        <tr><td>IGNORE</td><td>${labels}</td></tr></table>`);
      const definitions = await definitionsFor([{ dom: table, fields }]);
      expect(resolveBlockFields(selectedBlock(table), definitions)[0].optionKey).to.equal(expected);
    }
  });

  it('uses the exact paragraph length threshold in the library, not the selected text', async () => {
    const table = template();
    table.querySelector('p').textContent = 'x'.repeat(50);
    let definitions = await definitionsFor([{ dom: table, fields: metadata() }]);
    const current = template();
    current.querySelector('p').textContent = 'x'.repeat(80);
    expect(resolveBlockFields(selectedBlock(current), definitions)[2].readOnly).to.equal(false);
    table.querySelector('p').textContent += 'x';
    definitions = await definitionsFor([{ dom: table, fields: metadata() }]);
    current.querySelector('p').textContent = 'Short now';
    expect(resolveBlockFields(selectedBlock(current), definitions)[2].readOnly).to.equal(true);
  });

  it('allows uniform marks and links but locks mixed formatting and inline non-text nodes', async () => {
    for (const [content, readOnly] of [
      ['<strong><a href="/link">All bold link</a></strong>', false],
      ['Plain <strong>bold</strong>', true],
      ['<a href="/one">One</a><a href="/two">Two</a>', true],
      ['One<br>Two', true],
    ]) {
      const table = template();
      table.querySelector('p').innerHTML = content;
      const definitions = await definitionsFor([{ dom: table, fields: metadata() }]);
      expect(resolveBlockFields(selectedBlock(table), definitions)[2].readOnly).to.equal(readOnly);
    }
    const definitions = await definitionsFor([{ dom: template(), fields: metadata() }]);
    const current = template();
    current.querySelector('p').innerHTML = 'New <em>mixed</em> formatting';
    expect(resolveBlockFields(selectedBlock(current), definitions)[2].readOnly).to.equal(true);
  });

  it('resolves ordered lists of different lengths without moving subsequent fields', async () => {
    const table = template();
    table.rows[2].cells[0].innerHTML = '<ol start="3"><li>First</li><li>Second</li></ol><p>After</p>';
    const definitions = await definitionsFor([{ dom: table, fields: metadata() }]);
    const current = template();
    current.rows[2].cells[0].innerHTML = '<ol start="3"><li>A</li><li>B</li><li>C</li></ol><p>Still after</p>';
    const fields = resolveBlockFields(selectedBlock(current), definitions);
    expect(fields[1].items.map((item) => item.value)).to.deep.equal(['A', 'B', 'C']);
    expect(fields[2].value).to.equal('Still after');
    expect(fields.every((field) => !field.error)).to.equal(true);
  });

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
