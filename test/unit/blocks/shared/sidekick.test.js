import { expect } from '@esm-bundle/chai';
import { SK_EXT_ID, sidekickCacheBust } from '../../../../blocks/shared/sidekick.js';

describe('sidekickCacheBust', () => {
  afterEach(() => {
    try { delete window.chrome; } catch { /* */ }
    window.localStorage.removeItem('aem-sidekick-id');
  });

  it('Returns immediately when window.chrome is missing', async () => {
    try { delete window.chrome; } catch { /* */ }
    // Should not throw
    await sidekickCacheBust('https://main--site--org.aem.live/page');
  });

  it('Sends a cache-bust message to the configured extension id', async () => {
    let captured;
    window.chrome = {
      runtime: {
        sendMessage: (extId, opts) => {
          captured = { extId, opts };
          return Promise.resolve();
        },
      },
    };
    await sidekickCacheBust('https://main--site--org.aem.live/page');
    expect(captured.extId).to.equal(SK_EXT_ID);
    expect(captured.opts.action).to.equal('bustCache');
    expect(captured.opts.host).to.equal('main--site--org.aem.live');
  });

  it('Reads the override extension id from localStorage when present', async () => {
    window.localStorage.setItem('aem-sidekick-id', 'custom-id');
    let captured;
    window.chrome = {
      runtime: {
        sendMessage: (extId) => {
          captured = extId;
          return Promise.resolve();
        },
      },
    };
    await sidekickCacheBust('https://main--site--org.aem.live/page');
    expect(captured).to.equal('custom-id');
  });

  it('Swallows errors from sendMessage', async () => {
    window.chrome = { runtime: { sendMessage: () => Promise.reject(new Error('boom')) } };
    await sidekickCacheBust('https://main--site--org.aem.live/page');
  });
});
