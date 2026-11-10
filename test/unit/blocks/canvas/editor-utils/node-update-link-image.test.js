import { expect } from '@esm-bundle/chai';
import { EditorState, EditorView, Y } from 'da-y-wrapper';
import { getSchema, prosemirrorToYXmlFragment, doc2aem } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const SRC = 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:img-001/as/photo.avif';

describe('host applying a mini-editor NODE_UPDATE for a link-image', () => {
  const schema = getSchema();
  let updateState;
  let view;

  before(async () => {
    ({ updateState } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js'));
  });

  beforeEach(() => {
    const link = schema.nodes.image.create({ src: SRC, alt: 'Alt', editAs: 'image' });
    const paragraph = schema.nodes.paragraph.create(null, [schema.text('Hi '), link]);
    view = new EditorView(document.createElement('div'), { state: EditorState.create({ doc: schema.nodes.doc.create(null, paragraph), schema }) });
  });

  afterEach(() => view.destroy());

  const iframePayload = () => ({
    node: {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello there ' },
        { type: 'image', attrs: { src: SRC, alt: 'Alt', editAs: 'image' } },
      ],
    },
    cursorOffset: 1,
  });

  it('keeps editAs on the image after a length-changing edit before it', () => {
    updateState(iframePayload(), { view });
    expect(view.state.doc.firstChild.lastChild.attrs.editAs).to.equal('image');
  });

  it('saves the updated paragraph with the link-image anchor', () => {
    updateState(iframePayload(), { view });
    const ydoc = new Y.Doc();
    prosemirrorToYXmlFragment(view.state.doc, ydoc.getXmlFragment('prosemirror'));
    const main = new DOMParser().parseFromString(doc2aem(ydoc), 'text/html').querySelector('main');
    const a = main.querySelector('a[data-edit-as="image"]');
    expect(a.getAttribute('href')).to.equal(SRC);
    expect(a.getAttribute('title')).to.equal('Alt');
    expect(main.querySelector('img') === null).to.equal(true);
    expect(main.textContent).to.include('Hello there');
  });

  it('turns the link-image into a regular image when the update drops editAs', () => {
    const payload = iframePayload();
    delete payload.node.content[1].attrs.editAs;
    updateState(payload, { view });
    expect(view.state.doc.firstChild.lastChild.attrs.editAs).to.equal(null);
  });
});
