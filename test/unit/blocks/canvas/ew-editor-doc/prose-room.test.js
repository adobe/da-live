import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let initProse;
let collabOrigin;
let previousCollab;

before(async () => {
  previousCollab = localStorage.getItem('da-collab');
  localStorage.setItem('da-collab', 'local');
  ({ default: initProse } = await import('../../../../../blocks/canvas/ew-editor-doc/prose.js'));
  ({ COLLAB_ORIGIN: collabOrigin } = await import('../../../../../blocks/shared/constants.js'));
});

after(() => {
  if (previousCollab === null) localStorage.removeItem('da-collab');
  else localStorage.setItem('da-collab', previousCollab);
});

async function connect(sourceUrl, reload) {
  const result = await initProse({
    path: sourceUrl,
    permissions: ['read', 'write'],
    setEditable: () => {},
    getToken: () => 'test-token',
    reload,
  });
  return result;
}

function teardown({ wsProvider, ydoc, view }) {
  wsProvider.disconnect({ data: 'Client navigation' });
  wsProvider.destroy?.();
  view?.destroy?.();
  ydoc.destroy();
}

describe('canvas collab room', () => {
  ['roomsite', 'roomsite~branch'].forEach((site) => {
    it(`disposes the fenced ${site} room before reloading`, async () => {
      const reload = sinon.spy();
      const result = await connect(`https://admin.da.live/source/roomorg/${site}/page.html`, reload);
      const destroyDoc = sinon.spy(result.ydoc, 'destroy');
      const destroyProvider = sinon.spy(result.wsProvider, 'destroy');
      result.wsProvider.emit('connection-close', [{ code: 4412 }, result.wsProvider]);
      expect(result.wsProvider.shouldConnect).to.equal(false);
      expect(destroyProvider.calledOnce).to.equal(true);
      expect(destroyDoc.calledOnce).to.equal(true);
      expect(reload.calledOnce).to.equal(true);
      expect(destroyDoc.calledBefore(reload)).to.equal(true);
    });
  });

  it('keeps a legacy document in its da-admin room', async () => {
    const result = await connect('https://admin.da.live/source/roomorg/roomsite/page.html');
    try {
      expect(result.wsProvider.roomname).to.equal('https://admin.da.live/source/roomorg/roomsite/page.html');
    } finally {
      teardown(result);
    }
  });

  it('puts a source-bus document in its api.aem.live room', async () => {
    // da-collab reads the store off the room name, so the room must name the document's real store
    const result = await connect('https://api.aem.live/roomorg/sites/roomsite/source/page.html');
    try {
      expect(result.wsProvider.roomname).to.equal('https://api.aem.live/roomorg/sites/roomsite/source/page.html');
    } finally {
      teardown(result);
    }
  });

  ['source/roomorg/roomsite/page.html', 'roomorg/sites/roomsite/source/page.html'].forEach((path) => {
    it(`uses configured collab for the bound ${path} alias`, async () => {
      const current = window.location.href;
      const url = new URL(current);
      url.searchParams.set('da-source', 'da-rs');
      window.history.replaceState(null, '', url);
      const result = await connect(`https://admin.da.live/${path}`);
      try {
        expect(result.wsProvider.serverUrl).to.equal(collabOrigin);
      } finally {
        teardown(result);
        window.history.replaceState(null, '', current);
      }
    });
  });
});
