import { expect } from '@esm-bundle/chai';
import { Y } from 'da-y-wrapper';
import { aem2doc, doc2aem, getSchema, prosemirrorToYXmlFragment, yDocToProsemirror } from 'da-parser';
import { getNx2, setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let handleImageReplace;
let getImageDocumentVersion;
let getInstrumentedHTML;

before(async () => {
  ({ getImageDocumentVersion } = await import(`${getNx2()}/public/utils/quick-edit-images.js`));
  ({ handleImageReplace } = await import('../../../../../blocks/canvas/ew-editor-wysiwyg/utils/image.js'));
  ({ getInstrumentedHTML } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js'));
});

const NEW_SRC = './media_new.png';
const LINK_A = { src: 'https://cdn.example.com/assets/a.jpg', alt: 'Link A', editAs: 'image' };
const REGULAR = { src: '/media_regular.png', alt: 'Regular' };
const LINK_C = { src: 'https://cdn.example.com/assets/c.jpg', alt: 'Link C', editAs: 'image' };

function stubStore(contentUrl = NEW_SRC) {
  const saved = window.fetch;
  window.fetch = async (url) => {
    const href = typeof url === 'string' ? url : url.url;
    if (href.includes('/ping/')) {
      return new Response('', { status: 200, headers: { 'x-api-upgrade-available': 'true' } });
    }
    return new Response(JSON.stringify({ source: { contentUrl } }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  };
  return () => { window.fetch = saved; };
}

const imageAttrs = (doc) => {
  const list = [];
  doc.descendants((node) => {
    if (node.type.name === 'image') {
      list.push({ src: node.attrs.src, alt: node.attrs.alt, editAs: node.attrs.editAs });
    }
  });
  return list;
};

function roundTrip(doc) {
  const ydoc = new Y.Doc();
  prosemirrorToYXmlFragment(doc, ydoc.getXmlFragment('prosemirror'));
  const html = doc2aem(ydoc);
  const reloaded = new Y.Doc();
  aem2doc(html, reloaded);
  return { html, doc: yDocToProsemirror(getSchema(), reloaded) };
}

describe('layout-mode upload on a document with link-images', () => {
  let editor;
  let positions;
  let restore;

  const requestFor = (index) => ({
    imageData: 'data:image/png;base64,iVBORw0KGgo=',
    fileName: 'pic.png',
    proseIndex: positions[index],
    requestId: 'upload-1',
    imageVersion: getImageDocumentVersion(editor.view.state.doc),
    originalSrc: '/ignored.png',
  });

  const replace = (index) => {
    const posted = [];
    return handleImageReplace(requestFor(index), {
      owner: 'repl',
      repo: 'repl',
      path: '/page',
      view: editor.view,
      port: { postMessage: (message) => posted.push(message) },
      getToken: () => 'test-token',
    }).then(() => posted);
  };

  beforeEach(async () => {
    editor = await createTestEditor();
    const { state } = editor.view;
    const { schema } = state;
    const images = [LINK_A, REGULAR, LINK_C].map((attrs) => schema.nodes.image.create(attrs));
    const para = schema.nodes.paragraph.create(null, images);
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, para));
    positions = [];
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') positions.push(pos);
    });
    restore = stubStore();
  });

  afterEach(() => {
    restore();
    destroyEditor(editor);
  });

  it('replaces only the dropped link-image and turns it into a regular image', async () => {
    await replace(0);
    expect(imageAttrs(editor.view.state.doc)).to.deep.equal([
      { src: NEW_SRC, alt: 'Link A', editAs: null },
      { src: REGULAR.src, alt: 'Regular', editAs: null },
      { src: LINK_C.src, alt: 'Link C', editAs: 'image' },
    ]);
  });

  it('replaces a regular image without touching neighboring link-images', async () => {
    await replace(1);
    expect(imageAttrs(editor.view.state.doc)).to.deep.equal([
      { src: LINK_A.src, alt: 'Link A', editAs: 'image' },
      { src: NEW_SRC, alt: 'Regular', editAs: null },
      { src: LINK_C.src, alt: 'Link C', editAs: 'image' },
    ]);
  });

  it('survives a switch to content mode and back: save and reload keeps the document', async () => {
    await replace(0);
    const before = imageAttrs(editor.view.state.doc);
    const { html, doc } = roundTrip(editor.view.state.doc);
    expect(imageAttrs(doc)).to.deep.equal(before);
    const main = new DOMParser().parseFromString(html, 'text/html').querySelector('main');
    expect(main.querySelectorAll('a[data-edit-as="image"]')).to.have.length(1);
    expect(main.querySelectorAll('picture')).to.have.length(2);
  });

  it('re-renders the layout preview with fresh indices and version after the upload', async () => {
    await replace(0);
    const html = getInstrumentedHTML(editor.view);
    const main = new DOMParser().parseFromString(html, 'text/html').querySelector('main');
    const version = getImageDocumentVersion(editor.view.state.doc);
    const anchors = [...main.querySelectorAll('a[data-edit-as="image"]')];
    const imgs = [...main.querySelectorAll('picture img')];
    expect(anchors).to.have.length(1);
    expect(imgs).to.have.length(2);
    expect(anchors[0].getAttribute('data-image-index')).to.equal(String(positions[2]));
    expect(imgs.map((img) => img.getAttribute('data-image-index')))
      .to.deep.equal([String(positions[0]), String(positions[1])]);
    [...anchors, ...imgs].forEach((el) => {
      expect(el.getAttribute('data-image-version')).to.equal(version);
    });
  });
});
