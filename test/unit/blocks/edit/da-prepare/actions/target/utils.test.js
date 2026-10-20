import { expect } from '@esm-bundle/chai';
import { setNx, getNx2Api } from '../../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { savePreview, sendToTarget, removeOfferId } = await import('../../../../../../../blocks/edit/da-prepare/actions/target/utils.js');
const { getExtensionsBridge } = await import('../../../../../../../blocks/canvas/editor-utils/extensions-bridge.js');
const { makeView } = await import('../../../../canvas/test-helpers.js');

describe('target/utils savePreview', () => {
  it('Strips the .html extension before previewing', async () => {
    const { aem } = await getNx2Api();
    const origPreview = aem.preview;
    const previewed = [];
    aem.preview = (path) => {
      previewed.push(path);
      return { ok: true, json: () => ({ preview: { url: 'https://main--site--org.aem.page/testpage' } }) };
    };

    try {
      const result = await savePreview('org', 'site', '/testpage.html');

      expect(previewed).to.deep.equal(['/org/site/testpage']);
      expect(result.preview.url).to.equal('https://main--site--org.aem.page/testpage');
    } finally {
      aem.preview = origPreview;
    }
  });

  it('Leaves extensionless paths untouched', async () => {
    const { aem } = await getNx2Api();
    const origPreview = aem.preview;
    const previewed = [];
    aem.preview = (path) => {
      previewed.push(path);
      return { ok: true, json: () => ({ preview: { url: 'https://main--site--org.aem.page/folder' } }) };
    };

    try {
      await savePreview('org', 'site', '/folder');

      expect(previewed).to.deep.equal(['/org/site/folder']);
    } finally {
      aem.preview = origPreview;
    }
  });

  it('Returns an error when the preview fails', async () => {
    const { aem } = await getNx2Api();
    const origPreview = aem.preview;
    aem.preview = () => ({ ok: false });

    try {
      const result = await savePreview('org', 'site', '/testpage.html');
      expect(result).to.deep.equal({ error: 'Couldn\'t preview.' });
    } finally {
      aem.preview = origPreview;
    }
  });
});

describe('target/utils sendToTarget', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('Fetches the previewed content through the da-etc cors proxy with a cache-buster', async () => {
    let captured;
    window.fetch = (url, opts) => {
      captured = { url, opts };
      // A locked-down preview host returns 401; the proxy relays it through.
      return Promise.resolve(new Response('access-not-allowed', { status: 401 }));
    };

    const aemPath = 'https://main--site--org.aem.page/demo';
    const result = await sendToTarget('org', 'send1', 'name', aemPath, 'Joe');

    expect(captured.url).to.contain('/cors?url=');
    expect(captured.url).to.contain(encodeURIComponent(aemPath));
    expect(captured.url).to.contain(encodeURIComponent('nocache='));
    // A 401 from the delivery host surfaces as a clean error, not a hang/throw.
    expect(result).to.deep.equal({ error: 'Could not fetch from AEM.' });
  });

  it('Falls back to an unauthenticated fetch when the site-token exchange fails', async () => {
    // In this test env initIms() resolves to undefined, so getAemSiteToken
    // rejects. sendToTarget must swallow that and still attempt the fetch
    // rather than throwing (which would leave the dialog hung).
    let captured;
    window.fetch = (url, opts) => {
      captured = { url, opts };
      return Promise.resolve(new Response('nope', { status: 401 }));
    };

    const result = await sendToTarget('org', 'send2', 'name', 'https://main--site--org.aem.page/p', 'Joe');

    // No Authorization header was attached (token exchange failed → fallback).
    expect(captured.opts?.headers?.Authorization).to.equal(undefined);
    expect(result).to.deep.equal({ error: 'Could not fetch from AEM.' });
  });
});

const docWithOfferId = {
  type: 'doc',
  content: [
    {
      type: 'table',
      content: [
        {
          type: 'table_row',
          content: [
            { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'metadata' }] }] },
          ],
        },
        {
          type: 'table_row',
          content: [
            { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'adobe.target.offerId' }] }] },
            { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'existing-offer-123' }] }] },
          ],
        },
        {
          type: 'table_row',
          content: [
            { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'description' }] }] },
            { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A test page' }] }] },
          ],
        },
      ],
    },
  ],
};

function hasOfferIdRow(view) {
  let found = false;
  view.state.doc.descendants((node) => {
    if (node.isText && node.text === 'adobe.target.offerId') found = true;
  });
  return found;
}

describe('removeOfferId in the /canvas experience (no window.view)', () => {
  afterEach(() => {
    delete window.view;
    getExtensionsBridge().view = null;
  });

  it('removes the offer id from the canvas ProseMirror doc instead of throwing', () => {
    // /canvas never assigns window.view — the doc's live EditorView is only
    // reachable via the canvas extensions bridge.
    delete window.view;
    const view = makeView(docWithOfferId);
    getExtensionsBridge().view = view;

    expect(() => removeOfferId()).to.not.throw();
    expect(hasOfferIdRow(view)).to.equal(false);
  });
});
