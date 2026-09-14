import { expect } from '@esm-bundle/chai';
import base64UploaderFactory, { uploadBase64Image } from '../../../../../../blocks/edit/prose/plugins/base64uploader.js';
import { createTestEditor, destroyEditor } from '../test-helpers.js';

const { setNx } = await import('../../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function extractFpoSrc(transformedHtml) {
  const match = transformedHtml.match(/src="([^"]*fpo\.svg#[^"]*)"/);
  return match?.[1];
}

describe('base64Uploader plugin', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor({ additionalPlugins: [base64UploaderFactory()] });
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

  it('returns html unchanged when there are no data: images', () => {
    const plugin = base64UploaderFactory();
    const html = '<p>hello</p>';
    expect(plugin.props.transformPastedHTML(html)).to.equal(html);
  });

  it('replaces data: image srcs with an FPO placeholder synchronously', () => {
    // transformPastedHTML fires the upload off fire-and-forget as a side
    // effect — mock fetch so that stray call can't reach the real network
    // and bleed into other tests.
    const savedFetch = window.fetch;
    window.fetch = () => new Promise(() => {});
    try {
      const plugin = base64UploaderFactory();
      const transformed = plugin.props.transformPastedHTML(`<img src="${dataUrl}">`);
      expect(transformed).to.include('/blocks/edit/img/fpo.svg#');
      expect(transformed).to.not.include('data:image');
    } finally {
      window.fetch = savedFetch;
    }
  });

  describe('uploadBase64Image', () => {
    it('uploads via source.uploadMedia (not source.save)', async () => {
      const savedFetch = window.fetch;
      let requestMethod = null;
      window.fetch = (url, opts) => {
        requestMethod = opts?.method;
        return Promise.resolve(new Response(
          JSON.stringify({ source: { contentUrl: './media_abc123.png' } }),
          { status: 200 },
        ));
      };
      try {
        const fpoSrc = '/blocks/edit/img/fpo.svg#123';
        const image = editor.view.state.schema.nodes.image.create({ src: fpoSrc });
        editor.view.dispatch(editor.view.state.tr.replaceSelectionWith(image));

        await uploadBase64Image(editor.view, { src: dataUrl, path: '/org/repo/.page/wp123.png', fpoSrc });

        expect(requestMethod).to.equal('POST');
      } finally {
        window.fetch = savedFetch;
      }
    });

    it('swaps the FPO placeholder for the uploaded content URL, including relative media_ paths', async () => {
      const savedFetch = window.fetch;
      const contentUrl = './media_abc123.png';
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify({ source: { contentUrl } }),
        { status: 200 },
      ));
      try {
        const fpoSrc = '/blocks/edit/img/fpo.svg#123';
        const image = editor.view.state.schema.nodes.image.create({ src: fpoSrc });
        editor.view.dispatch(editor.view.state.tr.replaceSelectionWith(image));

        await uploadBase64Image(editor.view, { src: dataUrl, path: '/org/repo/.page/wp123.png', fpoSrc });

        let finalSrc = null;
        editor.view.state.doc.descendants((node) => {
          if (node.type.name === 'image') finalSrc = node.attrs.src;
        });
        expect(finalSrc).to.equal(contentUrl);
      } finally {
        window.fetch = savedFetch;
      }
    });

    it('leaves the FPO placeholder in place and logs when the upload fails', async () => {
      const savedFetch = window.fetch;
      const savedConsoleError = console.error;
      let loggedArgs = null;
      console.error = (...args) => { loggedArgs = args; };
      window.fetch = () => Promise.resolve(new Response('boom', { status: 403, statusText: 'Forbidden' }));
      try {
        const fpoSrc = '/blocks/edit/img/fpo.svg#123';
        const image = editor.view.state.schema.nodes.image.create({ src: fpoSrc });
        editor.view.dispatch(editor.view.state.tr.replaceSelectionWith(image));

        await uploadBase64Image(editor.view, { src: dataUrl, path: '/org/repo/.page/wp123.png', fpoSrc });

        let finalSrc = null;
        editor.view.state.doc.descendants((node) => {
          if (node.type.name === 'image') finalSrc = node.attrs.src;
        });
        expect(finalSrc).to.equal(fpoSrc);
        expect(loggedArgs).to.not.be.null;
        expect(loggedArgs[0]).to.include('403');
      } finally {
        window.fetch = savedFetch;
        console.error = savedConsoleError;
      }
    });
  });

  it('end to end: transformPastedHTML placeholder eventually gets uploaded and swapped', async () => {
    const savedFetch = window.fetch;
    const contentUrl = './media_end2end.png';
    window.fetch = () => Promise.resolve(new Response(
      JSON.stringify({ source: { contentUrl } }),
      { status: 200 },
    ));
    try {
      const plugin = base64UploaderFactory();
      const transformed = plugin.props.transformPastedHTML(`<img src="${dataUrl}">`);
      const fpoSrc = extractFpoSrc(transformed);
      expect(fpoSrc).to.be.a('string');

      // Mirrors what ProseMirror's own paste handling would do with the
      // transformed HTML: insert an image node carrying the FPO placeholder.
      const image = editor.view.state.schema.nodes.image.create({ src: fpoSrc });
      editor.view.dispatch(editor.view.state.tr.replaceSelectionWith(image));

      function getImageSrc() {
        let src = null;
        editor.view.state.doc.descendants((node) => {
          if (node.type.name === 'image') src = node.attrs.src;
        });
        return src;
      }

      // transformPastedHTML kicks the upload off fire-and-forget — poll
      // briefly for the doc to settle rather than guessing a tick count.
      let finalSrc = getImageSrc();
      for (let i = 0; i < 20 && finalSrc !== contentUrl; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await nextFrame();
        finalSrc = getImageSrc();
      }
      expect(finalSrc).to.equal(contentUrl);
    } finally {
      window.fetch = savedFetch;
    }
  });
});
