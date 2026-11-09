import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
await import('../../../../blocks/edit/da-preview/da-preview.js');

describe('DaPreview legacy section metadata', () => {
  let preview;
  let savedFetch;
  let savedView;
  let savedUrl;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedView = window.view;
    savedUrl = window.location.href;
    const dom = document.createElement('div');
    dom.innerHTML = `<p>Content</p><div class="tableWrapper"><table>
      <tr><td>Section Metadata</td></tr>
      <tr><td>Grid</td><td>4</td></tr>
    </table></div>`;
    window.view = {
      dom,
      state: { selection: { from: 1 } },
      domAtPos: () => ({ node: dom.querySelector('p').firstChild, offset: 0 }),
    };
  });

  afterEach(() => {
    preview?.remove();
    window.fetch = savedFetch;
    window.view = savedView;
    window.history.replaceState(null, '', savedUrl);
  });

  it('waits for config before the initial body and preserves metadata in later updates', async () => {
    window.history.replaceState(null, '', '/edit#/preview-legacy/site/page');
    let releaseSiteConfig;
    const requestedSiteConfig = new Promise((resolve) => {
      window.fetch = async (url) => {
        if (String(url).includes('/config/preview-legacy/site/')) {
          resolve();
          return new Promise((release) => { releaseSiteConfig = release; });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      };
    });
    preview = document.createElement('da-preview');
    preview.path = 'https://example.com/page';
    const sent = [];
    let firstBody;
    const received = new Promise((resolve) => { firstBody = resolve; });
    preview.port1 = {
      postMessage: (message) => {
        sent.push(message);
        firstBody();
      },
    };
    preview.initialized = true;
    document.body.append(preview);
    await requestedSiteConfig;
    preview.setBody();
    preview.sendPreview();
    expect(sent).to.have.lengthOf(0);

    const config = {
      ':type': 'multi-sheet',
      ':names': ['data', 'flags'],
      data: { data: [] },
      flags: { data: [{ key: 'ew.legacy-section-metadata', value: 'true' }] },
    };
    releaseSiteConfig(new Response(JSON.stringify(config), { status: 200 }));
    await received;
    expect(sent[0].body).to.include('class="section-metadata"');
    window.view.dom.querySelector('p').textContent = 'Updated content';
    preview.setBody();
    expect(sent).to.have.lengthOf(2);
    expect(sent[1].body).to.include('Updated content');
    expect(sent[1].body).to.include('class="section-metadata"');
  });
});
