import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import '../../../../../blocks/form/views/sidebar.js';

const asset = (pointer) => ({
  kind: 'object',
  typeRef: 'https://raw.githubusercontent.com/adobe/da-sc-sdk/main/schemas/image/v1.0.0.json',
  typeName: 'image',
  pointer,
  label: 'Image',
  children: [
    { kind: 'string', key: 'src', pointer: `${pointer}/src` },
    { kind: 'string', key: 'altText', pointer: `${pointer}/altText` },
  ],
});

describe('nx-sidebar', () => {
  it('lists groups but not asset fields, which are single fields', async () => {
    const root = {
      kind: 'object',
      pointer: '/data',
      label: 'Data',
      children: [
        asset('/data/heroImage'),
        {
          kind: 'object',
          pointer: '/data/seo',
          label: 'SEO',
          children: [{ kind: 'string', pointer: '/data/seo/title' }],
        },
        {
          kind: 'array',
          pointer: '/data/gallery',
          label: 'Gallery',
          items: [asset('/data/gallery/0')],
        },
      ],
    };
    const el = document.createElement('nx-sidebar');
    el.state = { model: { root } };
    document.body.append(el);
    await el.updateComplete;
    const pointers = [...el.shadowRoot.querySelectorAll('button.item')]
      .map((button) => button.dataset.pointer);
    expect(pointers).to.deep.equal(['/data', '/data/seo', '/data/gallery']);
    el.remove();
  });
});
