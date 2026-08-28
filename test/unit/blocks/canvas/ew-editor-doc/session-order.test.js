import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let resolveEditorDocSession;

before(async () => {
  ({ resolveEditorDocSession } = await import('../../../../../blocks/canvas/ew-editor-doc/utils/load-editor-doc.js'));
});

function stubFetch(respond) {
  const saved = window.fetch;
  const calls = [];
  window.fetch = async (url, opts) => {
    const href = typeof url === 'string' ? url : url.url;
    calls.push({ url: href, opts });
    return respond(href, opts);
  };
  return { calls, restore: () => { window.fetch = saved; } };
}

const ok = () => new Response('', { status: 200 });

afterEach(() => {
  window.localStorage.removeItem('hlx6-upgrade');
  window.localStorage.removeItem('nx-ims');
  delete window.adobeIMS;
});

describe('resolveEditorDocSession', () => {
  // the nx fixture's loadIms answers nothing, so every session in this file is anonymous
  it('refuses an anonymous session before it looks the store up', async () => {
    const { calls, restore } = stubFetch(ok);
    try {
      const session = await resolveEditorDocSession({ org: 'anonorg', repo: 'anonsite', path: '/anonorg/anonsite/page' });

      expect(session).to.deep.equal({ ok: false, error: 'Sign in required' });
      expect(calls, 'the store was asked before the sign-in check').to.have.length(0);
    } finally {
      restore();
    }
  });

  it('answers the same for a ctx it cannot use', async () => {
    const { calls, restore } = stubFetch(ok);
    try {
      const session = await resolveEditorDocSession({ org: 'anonorg', repo: 'anonsite', path: '' });

      expect(session.ok).to.equal(false);
      expect(calls).to.have.length(0);
    } finally {
      restore();
    }
  });
});
