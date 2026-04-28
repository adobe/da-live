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
});
