import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let initProse;

before(async () => {
  ({ default: initProse } = await import('../../../../../blocks/canvas/ew-editor-doc/prose.js'));
});

async function connect(sourceUrl) {
  const result = await initProse({
    path: sourceUrl,
    permissions: ['read', 'write'],
    setEditable: () => {},
    getToken: () => 'test-token',
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
});
