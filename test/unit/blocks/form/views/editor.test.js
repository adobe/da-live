import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import '../../../../../blocks/form/views/editor.js';

const tick = () => new Promise((resolve) => { setTimeout(resolve); });

// The SDK still accepts the GitHub URLs of its types.
const IMAGE_URL = 'https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/image/v1.0.0.json';
const FILE_URL = 'https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/file/v1.0.0.json';

const mediaNode = (extra = {}) => ({
  kind: 'object',
  pointer: '/data/heroImage',
  label: 'Hero image',
  typeRef: IMAGE_URL,
  typeName: 'image',
  children: [
    { kind: 'string', key: 'src', pointer: '/data/heroImage/src', label: 'Source' },
    { kind: 'string', key: 'altText', pointer: '/data/heroImage/altText', label: 'Alt text' },
  ],
  ...extra,
});

function objectRoot(children) {
  return { kind: 'object', pointer: '/data', label: 'Data', children };
}

async function mountEditor(root) {
  const el = document.createElement('nx-editor');
  el.editor = {};
  el.onSelect = () => {};
  el.assetSources = [];
  el.state = { model: { root } };
  el.nav = {};
  document.body.append(el);
  await el.updateComplete;
  await tick();
  await el.updateComplete;
  return el;
}

describe('nx-editor primitive controls', () => {
  it('renders a textarea for a long-text string node', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/body', label: 'Body', semanticType: 'long-text', value: 'hi' },
    ]);
    const el = await mountEditor(root);
    expect(el.shadowRoot.querySelector('form-textarea')).to.exist;
    expect(el.shadowRoot.querySelector('form-input')).to.equal(null);
  });

  it('renders a single-line input for a plain string node', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/title', label: 'Title', value: 'x' },
    ]);
    const el = await mountEditor(root);
    expect(el.shadowRoot.querySelector('form-input')).to.exist;
    expect(el.shadowRoot.querySelector('form-textarea')).to.equal(null);
  });

  it('renders an asset object as one file field with its src and alt text', async () => {
    const root = objectRoot([
      mediaNode({ value: { src: './media_example.png', altText: 'A hero' } }),
    ]);
    const el = await mountEditor(root);
    const fields = el.shadowRoot.querySelectorAll('form-asset');
    expect(fields.length).to.equal(1);
    expect(fields[0].value).to.equal('./media_example.png');
    expect(fields[0].altText).to.equal('A hero');
    expect(el.shadowRoot.querySelector('form-input')).to.equal(null);
    expect(el.shadowRoot.querySelector('fieldset[data-pointer="/data/heroImage"]')).to.equal(null);
  });

  it('shows a missing-file error reported on the asset src', async () => {
    const el = await mountEditor(objectRoot([mediaNode({ value: { altText: 'A hero' } })]));
    el.state = {
      model: { root: objectRoot([mediaNode({ value: { altText: 'A hero' } })]) },
      validation: { errors: { '/data/heroImage/src': { message: 'Required' } } },
    };
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('form-asset').error).to.equal('Required');
  });

  it('passes the asset type, a required alt text and its error to the field', async () => {
    const node = mediaNode({ value: { src: './media_example.png' } });
    node.children[1] = { ...node.children[1], required: true };
    const el = await mountEditor(objectRoot([node]));
    el.state = {
      model: { root: objectRoot([node]) },
      validation: { errors: { '/data/heroImage/altText': { message: 'Required' } } },
    };
    await el.updateComplete;
    const field = el.shadowRoot.querySelector('form-asset');
    expect(field.assetType).to.equal('image');
    expect(field.showsPreview).to.equal(true);
    expect(field.acceptsAltText).to.equal(true);
    expect(field.altRequired).to.equal(true);
    expect(field.altError).to.equal('Required');
    expect(field.error ?? '').to.equal('');
  });

  it('passes a file type without a preview or an alt text', async () => {
    const node = mediaNode({
      typeRef: FILE_URL,
      typeName: 'file',
      value: { src: './spec.pdf' },
      children: [{ kind: 'string', key: 'src', pointer: '/data/heroImage/src', label: 'Source' }],
    });
    const el = await mountEditor(objectRoot([node]));
    const field = el.shadowRoot.querySelector('form-asset');
    expect(field.assetType).to.equal('file');
    expect(field.showsPreview).to.equal(false);
    expect(field.acceptsAltText).to.equal(false);
    expect(field.altRequired).to.equal(false);
  });

  it('saves the asset object when the file changes, keeping its alt text', async () => {
    const calls = [];
    const node = mediaNode({ value: { src: './old.png', altText: 'A hero' } });
    const el = await mountEditor(objectRoot([node]));
    el.editor = { setField: (pointer, value) => calls.push({ pointer, value }) };
    const field = el.shadowRoot.querySelector('form-asset');
    field.value = './new.png';
    field.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    expect(calls).to.deep.equal([
      { pointer: '/data/heroImage', value: { src: './new.png', altText: 'A hero' } },
    ]);
  });

  it('clears the asset when its file is removed', async () => {
    const calls = [];
    const node = mediaNode({ value: { src: './old.png', altText: 'A hero' } });
    const el = await mountEditor(objectRoot([node]));
    el.editor = { setField: (pointer, value) => calls.push({ pointer, value }) };
    const field = el.shadowRoot.querySelector('form-asset');
    field.value = '';
    field.altText = '';
    field.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    expect(calls).to.deep.equal([{ pointer: '/data/heroImage', value: undefined }]);
  });

  it('saves an alt text edit at once', async () => {
    const calls = [];
    const node = mediaNode({ value: { src: './a.png' } });
    const el = await mountEditor(objectRoot([node]));
    el.editor = { setField: (pointer, value) => calls.push({ pointer, value }) };
    const field = el.shadowRoot.querySelector('form-asset');
    field.altText = 'A hero';
    field.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    expect(calls).to.deep.equal([
      { pointer: '/data/heroImage', value: { src: './a.png', altText: 'A hero' } },
    ]);
  });

  it('renders an asset array item as a single file row', async () => {
    const item = mediaNode({ pointer: '/data/gallery/0', value: { src: './a.png' } });
    item.children = item.children.map((c) => ({ ...c, pointer: `/data/gallery/0/${c.key}` }));
    const root = objectRoot([{
      kind: 'array',
      pointer: '/data/gallery',
      label: 'Gallery',
      itemLabel: 'Image',
      items: [item],
    }]);
    const el = await mountEditor(root);
    const fields = el.shadowRoot.querySelectorAll('form-asset');
    expect(fields.length).to.equal(1);
    expect(fields[0].dataset.pointer ?? fields[0].getAttribute('data-pointer')).to.equal('/data/gallery/0');
    expect(fields[0].value).to.equal('./a.png');
  });

  it('passes the preview origin to the file field while keeping the stored value', async () => {
    const root = objectRoot([
      mediaNode({ value: { src: './media_example.png' } }),
    ]);
    const el = await mountEditor(root);
    el.previewOrigin = 'https://main--site--example.preview.da.live';
    await el.updateComplete;
    const field = el.shadowRoot.querySelector('form-asset');
    expect(field.value).to.equal('./media_example.png');
    expect(field.previewOrigin).to.equal('https://main--site--example.preview.da.live');
  });

  it('previews a newly selected Media Bus image once the model stores it', async () => {
    const previewOrigin = 'https://main--site--example.preview.da.live';
    const imageNode = mediaNode();
    const el = await mountEditor(objectRoot([imageNode]));
    el.editor = {
      setField: (pointer, value) => {
        el.state = { model: { root: objectRoot([{ ...imageNode, value }]) } };
        expect(value).to.deep.equal({ src: './media_new.png' });
      },
    };
    el.previewOrigin = previewOrigin;
    el.assetSources = [{
      id: 'test-source',
      label: 'Test source',
      select: async () => ({ href: './media_new.png', name: 'new.png', type: 'image/png' }),
    }];
    await el.updateComplete;
    const field = el.shadowRoot.querySelector('form-asset');
    field.shadowRoot.querySelector('.asset-source-trigger').click();
    await new Promise((done) => { setTimeout(done, 0); });
    await el.updateComplete;
    await field.updateComplete;
    expect(field.value).to.equal('./media_new.png');
    expect(field.shadowRoot.querySelector('.asset-preview img').getAttribute('src'))
      .to.equal(`${previewOrigin}/media_new.png`);
  });

  it('still renders the file field while sources load', async () => {
    const root = objectRoot([mediaNode()]);
    const el = await mountEditor(root);
    el.assetSources = undefined;
    await el.updateComplete;
    const field = el.shadowRoot.querySelector('form-asset');
    expect(field).to.exist;
    expect(el.shadowRoot.querySelector('form-input')).to.equal(null);
    await field.updateComplete;
    expect(field.shadowRoot.querySelector('.asset-source-trigger').disabled).to.be.true;
  });

  it('renders a date widget for a string node with format date', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/when', label: 'When', format: 'date', value: '2026-08-14' },
    ]);
    const el = await mountEditor(root);
    const field = el.shadowRoot.querySelector('[data-pointer="/data/when"]');
    expect(field.tagName).to.equal('FORM-DATE');
    expect(el.shadowRoot.querySelector('form-input')).to.equal(null);
    expect(field.value).to.equal('2026-08-14');
  });

  it('renders a time widget for a string node with format time', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/opens', label: 'Opens', format: 'time', value: '09:00' },
    ]);
    const el = await mountEditor(root);
    const field = el.shadowRoot.querySelector('[data-pointer="/data/opens"]');
    expect(field.tagName).to.equal('FORM-DATE');
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
    expect(field.tagName).to.equal('FORM-DATE');
    expect(field.type).to.equal('datetime');
    expect(field.value).to.equal(iso);
  });

  it('surfaces the SDK format error on the date widget', async () => {
    const root = objectRoot([
      { kind: 'string', pointer: '/data/when', label: 'When', format: 'date' },
    ]);
    const el = document.createElement('nx-editor');
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
    const textarea = el.shadowRoot.querySelector('.form-array-item-input-row > form-textarea');
    expect(textarea).to.exist;
    // flex:1 is what makes it take the row width beside the action menu.
    expect(getComputedStyle(textarea).flexGrow).to.equal('1');
  });
});

describe('nx-editor schema issues', () => {
  async function issuesText(schemaIssues) {
    const el = await mountEditor(objectRoot([]));
    el.state = { model: { root: objectRoot([]) }, schemaIssues };
    await el.updateComplete;
    await tick();
    await el.updateComplete;
    return [...el.shadowRoot.querySelectorAll('.schema-issues-list li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim());
  }

  it('describes an external $ref', async () => {
    const ref = 'https://example.com/asset.json';
    const text = await issuesText([
      { reason: 'external-ref', pointer: '/data/logo', details: { ref } },
    ]);
    expect(text).to.deep.equal([`/data/logo — uses external $ref "${ref}" (only same-document refs and the image and file definitions are supported)`]);
  });

  it('describes keywords next to the asset $ref', async () => {
    const text = await issuesText([{
      reason: 'type-ref-keywords',
      pointer: '/data/hero',
      details: { ref: 'https://example.com/asset.json', properties: ['required', 'properties'] },
    }]);
    expect(text).to.deep.equal(['/data/hero — sets "required", "properties" next to the asset $ref (only title, description, readOnly, default and, on an image, required: ["altText"] are allowed)']);
  });
});
