import { expect } from '@esm-bundle/chai';

describe('configured single-author Source connection', () => {
  let originalFetch;
  let originalWebSocket;
  let originalHref;
  let createConnection;
  let Y;
  let requests;
  let connection;
  let initLegacy;
  let initCanvas;
  let profile = 'native-da';

  before(async () => {
    originalFetch = window.fetch;
    originalWebSocket = window.WebSocket;
    originalHref = window.location.href;
    window.history.replaceState(null, '', `${window.location.pathname}#/demo/site~draft/page`);
    requests = [];
    window.WebSocket = class {
      constructor() { throw new Error('Single-author mode opened a WebSocket'); }
    };
    window.fetch = async (input, options = {}) => {
      const url = new URL(input, window.location.href);
      requests.push({ path: url.pathname, method: options.method || 'GET', options });
      if (url.pathname === '/da-rs-demo.json') {
        return Response.json({ apiVersion: 1, provider: 'da-rs', org: 'demo', adminEnv: 'local', collabEnv: 'local' });
      }
      if (url.pathname === '/ping/demo/site') {
        return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
      }
      if (url.pathname === '/branches/demo/site/capabilities') {
        return Response.json({
          supported: true,
          apiVersion: 1,
          defaultBranchId: 'main',
          addressing: 'site-suffix',
          separator: '~',
          branchScopedSource: true,
          branchScopedCollaboration: false,
          helix6BranchSource: true,
          operations: ['create', 'changes', 'sync', 'publish', 'revert', 'restore'],
          itemKinds: ['html', 'json', 'media', 'config'],
        });
      }
      if (url.pathname === '/branches/demo/site/draft') return Response.json({ id: 'draft' });
      if (url.pathname === '/demo/sites/site~draft/source/page.html') {
        const headers = {
          ETag: options.method === 'PUT' ? '"v2"' : '"v1"',
          'Content-Branch': 'draft',
          'X-DA-Branch-Instance': '12345678-1234-1234-1234-123456789abc',
          'X-DA-Content-Profile': profile,
          'X-da-actions': '/page.html=read,write',
        };
        return new Response('<body><header></header><main><div><p>original</p></div></main><footer></footer></body>', { headers });
      }
      if (url.pathname === '/demo/sites/site/source/page.html') {
        return new Response('<body><header></header><main><div><p>original</p></div></main><footer></footer></body>', { headers: { ETag: options.method === 'PUT' ? '"v2"' : '"v1"', 'X-da-actions': '/page.html=read,write', 'X-DA-Content-Profile': profile } });
      }
      if (url.origin === window.location.origin && (!options.method || options.method === 'GET')) {
        return originalFetch(input, options);
      }
      throw new Error(`Unexpected request: ${url.href}`);
    };
    ({ createSingleAuthorConnection: createConnection } = await import('../../../../blocks/shared/single-author-session.js'));
    ({ Y } = await import('da-y-wrapper'));
    const { setNx } = await import('../../../../scripts/utils.js');
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    ({ default: initLegacy } = await import('../../../../blocks/edit/prose/index.js'));
    ({ default: initCanvas } = await import('../../../../blocks/canvas/ew-editor-doc/prose.js'));
  });

  after(() => {
    connection?.wsProvider.disconnect();
    connection?.wsProvider.destroy();
    connection?.ydoc.destroy();
    window.fetch = originalFetch;
    window.WebSocket = originalWebSocket;
    window.history.replaceState(null, '', originalHref);
  });

  it('loads and saves a branch without opening a WebSocket', async () => {
    connection = await createConnection('http://localhost:8787/source/demo/site~draft/page.html');
    connection.wsProvider.connect();
    connection.wsProvider.singleAuthor.setWritable(true);
    const fragment = connection.ydoc.getXmlFragment('prosemirror');
    const paragraph = new Y.XmlElement('paragraph');
    const text = new Y.XmlText();
    paragraph.insert(0, [text]);
    fragment.insert(fragment.length, [paragraph]);
    text.insert(0, 'single author edit');
    expect((await connection.wsProvider.singleAuthor.save()).ok).to.equal(true);
    const write = requests.find(({ method }) => method === 'PUT');
    expect(write.path).to.equal('/demo/sites/site~draft/source/page.html');
    expect(write.options.headers['If-Match']).to.equal('"v1"');
    expect(write.options.body).to.include('single author edit');
  });

  it('mounts the legacy editor with a direct save barrier', async () => {
    connection.wsProvider.disconnect();
    connection.wsProvider.destroy();
    connection.ydoc.destroy();
    connection = await createConnection('http://localhost:8787/source/demo/site~draft/page.html');
    const content = {};
    await initLegacy({
      path: 'http://localhost:8787/source/demo/site~draft/page.html',
      permissions: ['read', 'write'],
      daContent: content,
      wsPromise: Promise.resolve(connection),
    });
    expect(content.wsProvider.singleAuthor).to.exist;
    expect((await content.forceSave()).ok).to.equal(true);
    window.view.destroy();
    delete window.view;
  });

  it('mounts the new authoring editor without opening a WebSocket', async () => {
    connection.wsProvider.disconnect();
    connection.wsProvider.destroy();
    connection.ydoc.destroy();
    let editable = false;
    const result = await initCanvas({
      path: 'http://localhost:8787/demo/sites/site~draft/source/page.html',
      permissions: ['read', 'write'],
      setEditable: (value) => { editable = value; },
    });
    connection = result;
    expect(editable).to.equal(true);
    expect(result.wsProvider.singleAuthor).to.exist;
    expect(result.view).to.exist;
    result.view.destroy();
  });

  it('also saves the default branch without collab', async () => {
    connection.wsProvider.disconnect();
    connection.wsProvider.destroy();
    connection.ydoc.destroy();
    window.history.replaceState(null, '', `${window.location.pathname}#/demo/site/page`);
    connection = await createConnection('http://localhost:8787/source/demo/site/page.html');
    connection.wsProvider.singleAuthor.setWritable(true);
    const fragment = connection.ydoc.getXmlFragment('prosemirror');
    const paragraph = new Y.XmlElement('paragraph');
    const text = new Y.XmlText();
    paragraph.insert(0, [text]);
    fragment.insert(fragment.length, [paragraph]);
    text.insert(0, 'default edit');
    expect((await connection.wsProvider.singleAuthor.save()).ok).to.equal(true);
    const write = requests.filter(({ method }) => method === 'PUT').at(-1);
    expect(write.path).to.equal('/demo/sites/site/source/page.html');
    expect(write.options.headers['If-Match']).to.equal('"v1"');
  });

  it('refuses to open imported content as an editable native page', async () => {
    profile = 'aem-import';
    try {
      await createConnection('http://localhost:8787/source/demo/site/page.html');
      throw new Error('Expected imported Source to be rejected');
    } catch (error) {
      expect(error.message).to.include('Unable to verify');
    } finally {
      profile = 'native-da';
    }
  });
});
