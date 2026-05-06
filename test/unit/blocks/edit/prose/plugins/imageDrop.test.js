/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import imageDropPluginFactory, {
  uploadImageFile,
  SUPPORTED_IMAGE_TYPES,
} from '../../../../../../blocks/edit/prose/plugins/imageDrop.js';
import { createTestEditor, destroyEditor } from '../test-helpers.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('imageDrop plugin', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor({ additionalPlugins: [imageDropPluginFactory()] });
    window.view = editor.view;
    // The plugin uses getPathDetails() — set a hash so it returns valid details.
    window.history.replaceState(null, '', '/edit#/org/repo/page');
    await nextFrame();
  });

  afterEach(() => {
    destroyEditor(editor);
    delete window.view;
    window.history.replaceState(null, '', '/');
  });

  it('Exposes the supported image MIME types', () => {
    expect(SUPPORTED_IMAGE_TYPES).to.include.members([
      'image/svg+xml', 'image/png', 'image/jpeg', 'image/gif',
    ]);
  });

  it('uploadImageFile no-ops on unsupported types', async () => {
    const file = new File(['x'], 'bad.exe', { type: 'application/x-msdownload' });
    const before = editor.view.state.doc.content.size;
    await uploadImageFile(editor.view, file);
    expect(editor.view.state.doc.content.size).to.equal(before);
  });

  it('uploadImageFile inserts an FPO image immediately for supported types', async () => {
    const savedFetch = window.fetch;
    window.fetch = () => Promise.resolve(new Response(
      JSON.stringify({ source: { contentUrl: '/path/uploaded.png' } }),
      { status: 200 },
    ));
    try {
      const file = new File(['x'], 'pic.png', { type: 'image/png' });
      await uploadImageFile(editor.view, file);
      let foundImg = false;
      editor.view.state.doc.descendants((node) => {
        if (node.type.name === 'image') foundImg = true;
      });
      expect(foundImg).to.be.true;
    } finally {
      window.fetch = savedFetch;
    }
  });

  it('uploadImageFile bails when daFetch is not ok', async () => {
    const savedFetch = window.fetch;
    window.fetch = () => Promise.resolve(new Response('boom', { status: 500 }));
    try {
      const file = new File(['x'], 'pic.png', { type: 'image/png' });
      await uploadImageFile(editor.view, file);
      // FPO is still inserted; we just verify no throw.
    } finally {
      window.fetch = savedFetch;
    }
  });

  it('drop handleDOMEvents preventDefaults and triggers uploadImageFile per file', async () => {
    const savedFetch = window.fetch;
    let calls = 0;
    window.fetch = () => {
      calls += 1;
      return Promise.resolve(new Response(
        JSON.stringify({ source: { contentUrl: '/x.png' } }),
        { status: 200 },
      ));
    };
    try {
      const plugin = imageDropPluginFactory();
      const dropHandler = plugin.props.handleDOMEvents.drop;
      let prevented = false;
      const file = new File(['x'], 'pic.png', { type: 'image/png' });
      await dropHandler(editor.view, {
        preventDefault: () => { prevented = true; },
        dataTransfer: { files: [file, file] },
      });
      expect(prevented).to.be.true;
      // Wait microtasks
      await nextFrame();
      expect(calls).to.be.greaterThan(0);
    } finally {
      window.fetch = savedFetch;
    }
  });

  it('drop handleDOMEvents bails when files list is empty', () => {
    const plugin = imageDropPluginFactory();
    const dropHandler = plugin.props.handleDOMEvents.drop;
    let prevented = false;
    dropHandler(editor.view, {
      preventDefault: () => { prevented = true; },
      dataTransfer: { files: [] },
    });
    expect(prevented).to.be.true;
  });

  it('uploadImageFile gives FPO a unique src containing the upload URL', async () => {
    const savedFetch = window.fetch;
    window.fetch = () => new Promise(() => {}); // never resolves — FPO stays in doc
    try {
      const file = new File(['x'], 'my-photo.png', { type: 'image/png' });
      uploadImageFile(editor.view, file); // intentionally not awaited
      await nextFrame();
      let fpoSrc = null;
      editor.view.state.doc.descendants((node) => {
        if (node.type.name === 'image') fpoSrc = node.attrs.src;
      });
      expect(fpoSrc).to.be.a('string');
      expect(fpoSrc).to.include('/blocks/edit/img/fpo.svg#');
      expect(fpoSrc).to.include('my-photo.png');
    } finally {
      window.fetch = savedFetch;
    }
  });

  it('concurrent uploads use distinct FPO srcs so they can be replaced independently', async () => {
    const savedFetch = window.fetch;
    window.fetch = () => new Promise(() => {}); // never resolves — both FPOs stay
    try {
      const file1 = new File(['a'], 'alpha.png', { type: 'image/png' });
      const file2 = new File(['b'], 'beta.gif', { type: 'image/gif' });
      uploadImageFile(editor.view, file1);
      uploadImageFile(editor.view, file2);
      await nextFrame();
      const fpoSrcs = [];
      editor.view.state.doc.descendants((node) => {
        if (node.type.name === 'image') fpoSrcs.push(node.attrs.src);
      });
      expect(fpoSrcs).to.have.length(2);
      expect(fpoSrcs[0]).to.not.equal(fpoSrcs[1]);
      expect(fpoSrcs[0]).to.include('alpha.png');
      expect(fpoSrcs[1]).to.include('beta.gif');
    } finally {
      window.fetch = savedFetch;
    }
  });

  it('uploadImageFile replaces FPO with the real image URL after upload completes', async () => {
    // Use a data URL so the browser fires the img load event in the test environment.
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const savedFetch = window.fetch;
    window.fetch = () => Promise.resolve(new Response(
      JSON.stringify({ source: { contentUrl: dataUrl } }),
      { status: 200 },
    ));
    try {
      const file = new File(['x'], 'pic.png', { type: 'image/png' });
      await uploadImageFile(editor.view, file);
      // Give the img load event time to fire and dispatch the replacement transaction.
      await new Promise((resolve) => { setTimeout(resolve, 200); });
      let finalSrc = null;
      editor.view.state.doc.descendants((node) => {
        if (node.type.name === 'image') finalSrc = node.attrs.src;
      });
      expect(finalSrc).to.equal(dataUrl);
    } finally {
      window.fetch = savedFetch;
    }
  });
});
