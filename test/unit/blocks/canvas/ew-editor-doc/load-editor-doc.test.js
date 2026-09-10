import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

// Minimal module stubs are applied via import maps in web-test-runner config;
// here we assert the docId is read off the response headers.
describe('resolveEditorDocSession docId', () => {
  it('returns docId from the x-da-id header on success', async () => {
    const resp = new Response('<html></html>', {
      status: 200,
      headers: { 'x-da-id': 'abc-123' },
    });
    resp.permissions = ['read', 'write'];
    // sessionFromResponse is the pure extraction helper under test.
    const { sessionFromResponse } = await import('../../../../../blocks/canvas/ew-editor-doc/utils/load-editor-doc.js');
    const session = sessionFromResponse(resp, 'token-xyz');
    expect(session).to.deep.equal({
      ok: true,
      token: 'token-xyz',
      permissions: ['read', 'write'],
      docId: 'abc-123',
    });
  });

  it('returns docId null when header is absent', async () => {
    const resp = new Response('<html></html>', { status: 200 });
    const { sessionFromResponse } = await import('../../../../../blocks/canvas/ew-editor-doc/utils/load-editor-doc.js');
    const session = sessionFromResponse(resp, 't');
    expect(session.docId).to.equal(null);
    expect(session.permissions).to.deep.equal(['read']);
  });
});
