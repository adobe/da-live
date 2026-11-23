import { expect } from '@esm-bundle/chai';

describe('configured da-rs selection', () => {
  it('uses the deployment default unless the URL explicitly overrides it', async () => {
    const originalFetch = window.fetch;
    window.fetch = async () => new Response(JSON.stringify({ apiVersion: 1, provider: 'da-rs', org: 'demo', adminEnv: 'local', collabEnv: 'local' }));
    try {
      // A fresh module instance exercises bootstrap with a stub, not a deployed config.
      const url = new URL('../../../../blocks/shared/da-rs-bootstrap.js?binding-closure', import.meta.url);
      const { daRsDemoState, isDaRsSelected } = await import(url.href);
      expect(daRsDemoState.status).to.equal('ready');
      expect(isDaRsSelected('http://localhost:3001/canvas#/demo/site~draft/page')).to.equal(true);
      expect(isDaRsSelected('https://da.example/canvas#/demo/site/page')).to.equal(false);
      expect(isDaRsSelected('https://da.example/canvas?da-source=hosted#/demo/site/page')).to.equal(false);
      expect(isDaRsSelected('https://da.example/canvas?da-source=da-rs#/demo/site/page')).to.equal(true);
    } finally {
      window.fetch = originalFetch;
    }
  });
});
