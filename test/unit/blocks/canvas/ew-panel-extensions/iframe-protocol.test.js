import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { TextSelection } from 'da-y-wrapper';
import { setNx, getNx, getNx2 } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import { makeView } from '../test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { setupIframeChannel } = await import('../../../../../blocks/canvas/ew-panel-extensions/iframe-protocol.js');
const { CHAT_EVENT } = await import(`${getNx()}/utils/chat.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);
const { setRepositoryConfig } = await import(`${getNx2()}/utils/aem-assets/repository-config.js`);

const wait = (ms = 50) => new Promise((resolve) => { setTimeout(resolve, ms); });

function makeIframe(src = 'https://plugin.example.com/app') {
  return { src, contentWindow: { postMessage: sinon.spy() } };
}

function setUrl(url) {
  window.history.replaceState(null, '', url);
}

describe('setupIframeChannel', () => {
  let originalUrl;

  beforeEach(() => {
    originalUrl = window.location.href;
  });

  afterEach(() => {
    setUrl(originalUrl);
    setRepositoryConfig(null);
    canvasBus.branchState.emit({ path: null, status: 'pending' });
  });

  it('is a no-op when org is missing from hashState', async () => {
    const iframe = makeIframe();
    const result = await setupIframeChannel({
      iframe,
      hashState: { site: 'mysite' },
      getView: () => null,
      onClose: () => { },
    });

    expect(result.channel).to.equal(null);
    expect(iframe.contentWindow.postMessage.called).to.be.false;
  });

  it('is a no-op when the iframe has no contentWindow', async () => {
    const result = await setupIframeChannel({
      iframe: { contentWindow: null },
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => { },
    });

    expect(result.channel).to.equal(null);
  });

  it('posts a ready message with project details derived from hashState and the URL', async () => {
    setUrl('/some/page?ref=feature123#/myorg/mysite/a/b');

    const iframe = makeIframe();
    const { destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite', path: 'a/b', view: 'split' },
      getView: () => null,
      onClose: () => { },
    });

    await wait(800);

    expect(iframe.contentWindow.postMessage.calledOnce).to.be.true;
    const [message, targetOrigin, transfer] = iframe.contentWindow.postMessage.firstCall.args;

    expect(message.ready).to.be.true;
    expect(message.project).to.deep.equal({
      org: 'myorg',
      repo: 'mysite',
      site: 'mysite',
      ref: 'feature123',
      branch: 'feature123',
      path: '/a/b',
      view: 'split',
      hash: '#/myorg/mysite/a/b',
      daAdmin: 'https://admin.da.live',
      editorOrigin: window.location.origin,
    });
    expect(message.context).to.equal(message.project);
    expect(message).to.have.property('token');
    expect(targetOrigin).to.equal('https://plugin.example.com');
    expect(transfer).to.have.lengthOf(1);

    destroy();
  });

  it('defaults ref to main, path to / and view to edit when not provided', async () => {
    setUrl('/some/page');

    const iframe = makeIframe();
    const { destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => { },
    });

    await wait(800);

    const [message] = iframe.contentWindow.postMessage.firstCall.args;
    expect(message.project.ref).to.equal('main');
    expect(message.project.path).to.equal('/');
    expect(message.project.view).to.equal('edit');

    destroy();
  });

  it('reports the configured site branch separately from the local plugin ref', async () => {
    setUrl('/some/page?ref=local');
    canvasBus.branchState.emit({
      org: 'myorg',
      site: 'mysite',
      path: '/myorg/mysite/page',
      status: 'ready',
      branch: 'configured',
    });
    const iframe = makeIframe();
    const { destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite', path: 'page' },
      getView: () => null,
      onClose: () => { },
    });
    try {
      await wait(800);
      const [message] = iframe.contentWindow.postMessage.firstCall.args;
      expect(message.context.ref).to.equal('local');
      expect(message.context.branch).to.equal('configured');
    } finally {
      destroy();
    }
  });

  it('calls onClose for a closeLibrary action', async () => {
    const iframe = makeIframe();
    const onClose = sinon.spy();
    const { channel, destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose,
    });

    channel.port2.postMessage({ action: 'closeLibrary' });
    await wait();

    expect(onClose.calledOnce).to.be.true;
    destroy();
  });

  it('relays HTML drags only from the connected plugin frame and origin', async () => {
    const iframe = makeIframe();
    iframe.contentWindow = window;
    const { destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => { },
    });
    const starts = [];
    let ends = 0;
    const onStart = (event) => starts.push(event.detail.html);
    const onEnd = () => { ends += 1; };
    window.addEventListener('ew-table-drag-start', onStart);
    window.addEventListener('ew-table-drag-end', onEnd);
    const data = { type: 'ew-table-drag-start', html: '<table><tr><td>Hero</td></tr></table>' };
    const wrongSource = new MessageChannel();
    const emit = (source, origin, payload) => window.dispatchEvent(
      new MessageEvent('message', { source, origin, data: payload }),
    );
    emit(wrongSource.port1, 'https://plugin.example.com', data);
    emit(window, 'https://other.example.com', data);
    emit(window, 'https://plugin.example.com', { ...data, html: '' });
    expect(starts).to.have.length(0);
    emit(iframe.contentWindow, 'https://plugin.example.com', data);
    emit(iframe.contentWindow, 'https://plugin.example.com', { ...data, html: '<h2>Heading</h2>' });
    expect(starts).to.deep.equal([data.html, '<h2>Heading</h2>']);
    emit(iframe.contentWindow, 'https://plugin.example.com', { type: 'ew-table-drag-end' });
    expect(ends).to.equal(1);
    destroy();
    emit(iframe.contentWindow, 'https://plugin.example.com', data);
    expect(starts).to.have.length(2);
    wrongSource.port1.close();
    wrongSource.port2.close();
    window.removeEventListener('ew-table-drag-start', onStart);
    window.removeEventListener('ew-table-drag-end', onEnd);
  });

  it('rejects asset listing requests without host authentication', async () => {
    const iframe = makeIframe();
    iframe.contentWindow = window;
    const postMessage = sinon.stub(window, 'postMessage');
    const { destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => { },
    });
    const emit = (source, origin, type) => window.dispatchEvent(new MessageEvent('message', { source, origin, data: { type } }));
    const wrongSource = new MessageChannel();
    try {
      emit(wrongSource.port1, 'https://plugin.example.com', 'ew-asset-list-request');
      emit(window, 'https://other.example.com', 'ew-asset-list-request');
      expect(postMessage.called).to.be.false;
      emit(window, 'https://plugin.example.com', 'ew-asset-list-request');
      await wait();
      expect(postMessage.firstCall.args[0]).to.deep.equal({
        type: 'ew-asset-list-error',
        error: 'Sign in to Experience Workspace to browse assets.',
      });
    } finally {
      destroy();
      wrongSource.port1.close();
      wrongSource.port2.close();
      postMessage.restore();
    }
  });

  it('uses live IMS authentication without forwarding it in asset list responses', async () => {
    const previousIms = window.adobeIMS;
    const previousImsFlag = localStorage.getItem('nx-ims');
    const previousFetch = window.fetch;
    localStorage.setItem('nx-ims', 'true');
    const getAccessToken = sinon.stub().returns({ token: 'initial-token' });
    window.adobeIMS = { getAccessToken };
    window.fetch = async () => new Response('', { status: 404 });
    const iframe = makeIframe();
    iframe.contentWindow = window;
    const postMessage = sinon.stub(window, 'postMessage');
    let destroy;
    try {
      ({ destroy } = await setupIframeChannel({
        iframe,
        hashState: { org: 'myorg', site: 'mysite' },
        getView: () => null,
        onClose: () => { },
      }));
      await wait(800);
      expect(postMessage.firstCall.args[0].token).to.equal('initial-token');
      getAccessToken.returns({ token: 'refreshed-token' });
      window.dispatchEvent(new MessageEvent('message', {
        source: window,
        origin: 'https://plugin.example.com',
        data: { type: 'ew-asset-list-request' },
      }));
      await wait(150);
      const listReply = postMessage.getCalls().find((call) => (
        call.args[0].type === 'ew-asset-list-error'
      ))?.args[0];
      expect(listReply).to.deep.equal({
        type: 'ew-asset-list-error',
        error: 'No AEM Assets repository is configured for this site.',
      });
    } finally {
      destroy?.();
      postMessage.restore();
      window.adobeIMS = previousIms;
      window.fetch = previousFetch;
      if (previousImsFlag === null) localStorage.removeItem('nx-ims');
      else localStorage.setItem('nx-ims', previousImsFlag);
    }
  });

  it('lists only host-fetched assets without forwarding authentication', async () => {
    setRepositoryConfig({
      repositoryId: 'author-p1-e1.adobeaemcloud.com',
      tierType: 'author',
      isDmEnabled: false,
    });
    const previousIms = window.adobeIMS;
    const previousImsFlag = localStorage.getItem('nx-ims');
    const previousFetch = window.fetch;
    localStorage.setItem('nx-ims', 'true');
    window.adobeIMS = { getAccessToken: () => ({ token: 'live-token' }) };
    const requests = [];
    window.fetch = async (url, options) => {
      if (url.includes('/ping/')) return new Response('', { status: 200 });
      if (url.includes('/config/asset-list-bridge-org/asset-list-bridge-site/')) {
        return new Response(JSON.stringify({
          data: [
            { key: 'aem.repositoryId', value: 'author-p1-e1.adobeaemcloud.com' },
          ],
        }), { status: 200 });
      }
      if (url.startsWith('https://author-p1-e1.adobeaemcloud.com/adobe/repository/;api=search')) {
        requests.push({ url, options });
        return new Response(JSON.stringify({
          children: [{
            'repo:path': '/content/dam/listed.jpg',
            'repo:name': 'listed.jpg',
            'repo:id': 'urn:aaid:aem:listed',
            'dc:format': 'image/jpeg',
            'aem:formatName': 'jpeg',
          }],
        }), { status: 200 });
      }
      if (url === 'https://author-p1-e1.adobeaemcloud.com/content/dam/listed.jpg') {
        requests.push({ url, options });
        return new Response(new Blob(['jpeg bytes'], { type: 'image/jpeg' }));
      }
      return new Response('', { status: 404 });
    };
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    Object.defineProperty(iframe, 'src', { value: 'https://plugin.example.com/app' });
    iframe.getBoundingClientRect = () => ({ left: 100, top: 40, right: 400, bottom: 340 });
    const postMessage = sinon.stub(iframe.contentWindow, 'postMessage');
    let destroy;
    try {
      ({ destroy } = await setupIframeChannel({
        iframe,
        hashState: { org: 'asset-list-bridge-org', site: 'asset-list-bridge-site' },
        getView: () => null,
        onClose: () => { },
      }));
      const emit = (data) => window.dispatchEvent(new MessageEvent('message', { source: iframe.contentWindow, origin: 'https://plugin.example.com', data }));
      emit({ type: 'ew-asset-list-request' });
      await wait(150);
      const result = postMessage.getCalls().find(({ args }) => args[0].type === 'ew-asset-list-result')?.args[0];
      expect(result, JSON.stringify(postMessage.getCalls().map(({ args }) => args[0]))).to.exist;
      expect(result.assets[0].name).to.equal('listed.jpg');
      expect(result.assets[0]).not.to.have.property('html');
      expect(result).not.to.have.property('token');
      expect(requests).to.have.lengthOf(1);
      expect(requests[0].options.headers.Authorization).to.equal('Bearer live-token');
      emit({ type: 'ew-asset-list-request', more: true, url: 'https://evil.org/steal' });
      await wait();
      expect(requests).to.have.lengthOf(1);
      expect(postMessage.getCalls().filter(({ args }) => args[0].type === 'ew-asset-list-result')[1].args[0]).to.include({ hasMore: false });
      emit({
        type: 'ew-table-drag-handles',
        handles: [{
          x: 10,
          y: 10,
          width: 100,
          height: 40,
          assetId: 'urn:aaid:aem:listed',
          clickable: false,
        }],
      });
      const handle = document.querySelector('.ew-table-drag-handle');
      expect(handle).to.exist;
      const pending = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
      expect(handle.dispatchEvent(pending)).to.be.false;
      expect(pending.dataTransfer.files).to.have.lengthOf(0);
      handle.dispatchEvent(new PointerEvent('pointerenter'));
      await wait();
      expect(requests).to.have.lengthOf(2);
      const authorization = requests[0].options.headers.Authorization;
      expect(requests[1].options.headers.Authorization).to.equal(authorization);
      const transfer = new DataTransfer();
      const starts = [];
      const files = [];
      const onStart = () => starts.push('html');
      const onAssetStart = (event) => files.push(event.detail.file);
      window.addEventListener('ew-table-drag-start', onStart);
      window.addEventListener('ew-asset-drag-start', onAssetStart);
      try {
        handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
        expect(transfer.files).to.have.lengthOf(0);
        expect(transfer.getData('application/x-ew-image')).to.equal('image');
        expect(files).to.have.lengthOf(1);
        expect(files[0].name).to.equal('listed.jpg');
        expect(await files[0].text()).to.equal('jpeg bytes');
        expect(transfer.getData('text/html')).to.equal('');
        expect(starts).to.have.lengthOf(0);
        handle.click();
        expect(postMessage.getCalls().some(({ args }) => args[0].type === 'ew-table-drag-handle-click')).to.be.false;
      } finally {
        window.removeEventListener('ew-table-drag-start', onStart);
        window.removeEventListener('ew-asset-drag-start', onAssetStart);
      }
    } finally {
      destroy?.();
      postMessage.restore();
      iframe.remove();
      window.adobeIMS = previousIms;
      window.fetch = previousFetch;
      if (previousImsFlag === null) localStorage.removeItem('nx-ims');
      else localStorage.setItem('nx-ims', previousImsFlag);
    }
  });

  it('creates host-document drag sources over variants and removes them on teardown', async () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    Object.defineProperty(iframe, 'src', { value: 'https://plugin.example.com/app' });
    iframe.getBoundingClientRect = () => ({ left: 100, top: 40, right: 400, bottom: 340 });
    const { destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => { },
    });
    const markup = '<table><tr><td>Hero</td></tr></table>';
    const heading = '<h2>Heading</h2>';
    const handles = [
      { x: 0, y: 0, width: 0, height: 20, html: markup },
      { x: 30, y: 50, width: 100, height: 40, html: heading },
      {
        x: 150, y: 50, width: 100, height: 40, html: '<img src="/asset.jpg">', clickable: false,
      },
    ];
    window.dispatchEvent(new MessageEvent('message', {
      source: iframe.contentWindow,
      origin: 'https://plugin.example.com',
      data: { type: 'ew-table-drag-handles', handles },
    }));
    const handle = document.querySelector('.ew-table-drag-handle');
    expect(document.querySelectorAll('.ew-table-drag-handle')).to.have.length(2);
    expect(handle.getBoundingClientRect().left).to.equal(130);
    expect(handle.getBoundingClientRect().top).to.equal(90);
    const transfer = new DataTransfer();
    const starts = [];
    const onStart = (event) => starts.push(event.detail.html);
    window.addEventListener('ew-table-drag-start', onStart);
    handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    expect(transfer.getData('text/html')).to.equal(heading);
    expect(starts).to.deep.equal([heading]);
    const postMessage = sinon.stub(iframe.contentWindow, 'postMessage');
    handle.click();
    expect(postMessage.calledWith({ type: 'ew-table-drag-handle-click', index: 1 })).to.be.true;
    postMessage.resetHistory();
    document.querySelectorAll('.ew-table-drag-handle')[1].click();
    expect(postMessage.called).to.be.false;
    destroy();
    expect(document.querySelector('.ew-table-drag-handles')).to.equal(null);
    window.removeEventListener('ew-table-drag-start', onStart);
    iframe.remove();
  });

  it('opens the tools panel for a showPanel action', async () => {
    const iframe = makeIframe();
    const { channel, destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => { },
    });

    let received;
    const onPanelOpen = (e) => { received = e.detail; };
    document.addEventListener(PANEL_EVENT.OPEN, onPanelOpen);

    channel.port2.postMessage({ action: 'showPanel', details: 'my-tool' });
    await wait();

    document.removeEventListener(PANEL_EVENT.OPEN, onPanelOpen);
    expect(received).to.deep.equal({ section: 'tools', id: 'my-tool' });
    destroy();
  });

  it('forwards navigation options through the existing panel event', async () => {
    const { channel, destroy } = await setupIframeChannel({
      iframe: makeIframe(),
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => {},
    });
    const received = [];
    const onOpen = ({ detail }) => received.push(detail);
    document.addEventListener(PANEL_EVENT.OPEN, onOpen);
    try {
      const options = { blockPath: 'https://example.com/library/cards' };
      channel.port2.postMessage({ action: 'showPanel', details: { id: 'blocks', options } });
      channel.port2.postMessage({ action: 'showPanel', details: { options } });
      channel.port2.postMessage({ action: 'showPanel', details: null });
      await wait();
      expect(received).to.deep.equal([{ section: 'tools', id: 'blocks', options }]);
    } finally {
      document.removeEventListener(PANEL_EVENT.OPEN, onOpen);
      destroy();
    }
  });

  it('reads the latest options for initial readiness and sends subsequent options on the port', async () => {
    const iframe = makeIframe();
    let options = { tab: 'blocks' };
    const { channel, destroy, updateOptions } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      getPanelOptions: () => options,
      onClose: () => {},
    });
    try {
      options = { tab: 'assets' };
      await wait(800);
      expect(iframe.contentWindow.postMessage.firstCall.args[0].panelOptions)
        .to.deep.equal({ tab: 'assets' });
      const received = new Promise((resolve) => {
        channel.port2.onmessage = ({ data }) => resolve(data);
      });
      updateOptions({ tab: 'blocks' });
      expect(await received).to.deep.equal({ action: 'panelOptions', details: { tab: 'blocks' } });
    } finally {
      destroy();
    }
    expect(() => updateOptions({ tab: 'assets' })).not.to.throw();
  });

  it('opens the chat panel with autoSend for an object-form setPrompt action', async () => {
    const iframe = makeIframe();
    const { channel, destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => { },
    });

    let received;
    const onPanelOpen = (e) => { received = e.detail; };
    document.addEventListener(PANEL_EVENT.OPEN, onPanelOpen);

    channel.port2.postMessage({ action: 'setPrompt', details: { text: 'hello', autoSend: true } });
    await wait();

    document.removeEventListener(PANEL_EVENT.OPEN, onPanelOpen);
    expect(received).to.deep.equal({ section: 'chat', options: { text: 'hello', autoSend: true } });
    destroy();
  });

  it('opens the chat panel without autoSend for a string-form setPrompt action', async () => {
    const iframe = makeIframe();
    const { channel, destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => { },
    });

    let received;
    const onPanelOpen = (e) => { received = e.detail; };
    document.addEventListener(PANEL_EVENT.OPEN, onPanelOpen);

    channel.port2.postMessage({ action: 'setPrompt', details: 'hello' });
    await wait();

    document.removeEventListener(PANEL_EVENT.OPEN, onPanelOpen);
    expect(received).to.deep.equal({ section: 'chat', options: { text: 'hello', autoSend: false } });
    destroy();
  });

  it('replies with an error over the channel when getSelection has no editor view', async () => {
    const iframe = makeIframe();
    const { channel, destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => { },
    });

    const reply = new Promise((resolve) => {
      channel.port2.onmessage = (e) => resolve(e.data);
    });

    channel.port2.postMessage({ action: 'getSelection' });
    const data = await reply;

    expect(data).to.deep.equal({ action: 'error', details: 'No editor view' });
    destroy();
  });

  it('forwards agentChange events from the document to the iframe', async () => {
    const iframe = makeIframe();
    const { destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => { },
    });

    document.dispatchEvent(new CustomEvent(CHAT_EVENT.AGENT_CHANGE, { detail: { agent: 'writer' } }));

    expect(iframe.contentWindow.postMessage.calledWith(
      { action: 'agentChange', detail: { agent: 'writer' } },
      'https://plugin.example.com',
    )).to.be.true;

    destroy();
  });

  it('stops forwarding agentChange events after destroy', async () => {
    const iframe = makeIframe();
    const { destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => { },
    });

    destroy();
    iframe.contentWindow.postMessage.resetHistory();

    document.dispatchEvent(new CustomEvent(CHAT_EVENT.AGENT_CHANGE, { detail: { agent: 'writer' } }));

    expect(iframe.contentWindow.postMessage.called).to.be.false;
  });

  it('does not post a delayed ready message after destroy', async () => {
    const iframe = makeIframe();
    const { destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => { },
    });

    destroy();
    await wait(800);

    expect(iframe.contentWindow.postMessage.called).to.be.false;
  });
});

describe('setupIframeChannel getSelection', () => {
  const HOST = { org: 'myorg', site: 'mysite' };
  let destroyChannel;

  // "Hello world" with positions 1..6 selected ("Hello"); from === to means no selection.
  function viewWithSelection(from, to) {
    const view = makeView({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
    return view;
  }

  async function connect(view) {
    const iframe = makeIframe();
    const options = { iframe, hashState: HOST, getView: () => view, onClose: () => { } };
    const { channel, destroy } = await setupIframeChannel(options);
    destroyChannel = destroy;
    return { iframe, channel };
  }

  function request(channel, message) {
    const reply = new Promise((resolve) => {
      channel.port2.onmessage = (e) => resolve(e.data);
    });
    channel.port2.postMessage(message);
    return reply;
  }

  afterEach(() => {
    destroyChannel?.();
    destroyChannel = undefined;
  });

  it('answers a request with a requestId on the port with the selected HTML', async () => {
    const { iframe, channel } = await connect(viewWithSelection(1, 6));
    const data = await request(channel, { action: 'getSelection', requestId: 'sel-1' });
    expect(data).to.deep.equal({ action: 'sdkResponse', requestId: 'sel-1', result: { ok: true, html: '<p>Hello</p>' } });
    expect(iframe.contentWindow.postMessage.called).to.be.false;
  });

  it('answers a request with a requestId with "No selection found" for an empty selection', async () => {
    const { channel } = await connect(viewWithSelection(3, 3));
    const data = await request(channel, { action: 'getSelection', requestId: 'sel-2' });
    expect(data).to.deep.equal({ action: 'sdkResponse', requestId: 'sel-2', result: { ok: false, error: 'No selection found' } });
  });

  it('answers a request with a requestId with "No editor view" without an editor', async () => {
    const { channel } = await connect(null);
    const data = await request(channel, { action: 'getSelection', requestId: 'sel-3' });
    expect(data).to.deep.equal({ action: 'sdkResponse', requestId: 'sel-3', result: { ok: false, error: 'No editor view' } });
  });

  it('keeps the sendSelection window reply for requests without a requestId', async () => {
    const { iframe, channel } = await connect(viewWithSelection(1, 6));
    channel.port2.postMessage({ action: 'getSelection' });
    await wait(20);
    expect(iframe.contentWindow.postMessage.calledOnceWith(
      { action: 'sendSelection', details: '<p>Hello</p>' },
      'https://plugin.example.com',
    )).to.be.true;
  });

  it('keeps the port error reply for an empty selection without a requestId', async () => {
    const { channel } = await connect(viewWithSelection(3, 3));
    const data = await request(channel, { action: 'getSelection' });
    expect(data).to.deep.equal({ action: 'error', details: 'No selection found' });
  });

  ['', 42, 'x'.repeat(101)].forEach((requestId) => {
    it(`treats requestId ${JSON.stringify(requestId).slice(0, 12)} as a request without one`, async () => {
      const { channel } = await connect(viewWithSelection(3, 3));
      const data = await request(channel, { action: 'getSelection', requestId });
      expect(data).to.deep.equal({ action: 'error', details: 'No selection found' });
    });
  });
});

describe('setupIframeChannel block selection', () => {
  const HOST = { org: 'myorg', site: 'mysite' };
  let destroyChannel;
  let visible;
  const DOC_SURFACE = { surface: 'doc', showable: false };

  const cell = (text) => ({
    type: 'table_cell',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  const tableJSON = (name) => ({
    type: 'table',
    content: [
      { type: 'table_row', content: [cell(name)] },
      { type: 'table_row', content: [cell('content')] },
    ],
  });

  function makeDocView() {
    return makeView({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
        tableJSON('cards'),
        tableJSON('hero'),
      ],
    });
  }

  // Position of the first character of `text` inside the doc.
  function posOfText(view, text) {
    let found;
    view.state.doc.descendants((node, pos) => {
      if (found === undefined && node.isText && node.text === text) found = pos;
    });
    return found + 1;
  }

  function select(view, text) {
    const pos = posOfText(view, text);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
    canvasBus.toolbarSelectionState.emit(DOC_SURFACE);
  }

  function selections(iframe) {
    return iframe.contentWindow.postMessage.getCalls()
      .filter((call) => call.args[0]?.type === 'ew-block-selection');
  }

  async function connect(view) {
    const iframe = { ...makeIframe(), checkVisibility: () => visible };
    const options = { iframe, hashState: HOST, getView: () => view, onClose: () => { } };
    const { destroy } = await setupIframeChannel(options);
    destroyChannel = destroy;
    return iframe;
  }

  beforeEach(() => { visible = true; });

  afterEach(() => {
    destroyChannel?.();
    destroyChannel = undefined;
  });

  it('posts the block name when the cursor moves into a block', async () => {
    const view = makeDocView();
    const iframe = await connect(view);
    select(view, 'Intro');
    expect(selections(iframe)).to.have.length(0);
    select(view, 'cards');
    const calls = selections(iframe);
    expect(calls).to.have.length(1);
    expect(calls[0].args).to.deep.equal([
      { type: 'ew-block-selection', name: 'cards' },
      'https://plugin.example.com',
    ]);
  });

  it('posts again when a different block is selected', async () => {
    const view = makeDocView();
    const iframe = await connect(view);
    select(view, 'cards');
    select(view, 'hero');
    const calls = selections(iframe);
    expect(calls).to.have.length(2);
    expect(calls[1].args[0]).to.deep.equal({ type: 'ew-block-selection', name: 'hero' });
  });

  it('does not repeat for the same block on selection or doc changes', async () => {
    const view = makeDocView();
    const iframe = await connect(view);
    select(view, 'cards');
    canvasBus.toolbarSelectionState.emit(DOC_SURFACE);
    canvasBus.editorDocState.emit();
    expect(selections(iframe)).to.have.length(1);
  });

  it('does not post while hidden and stays quiet when shown with the same block', async () => {
    const view = makeDocView();
    const iframe = await connect(view);
    visible = false;
    select(view, 'cards');
    expect(selections(iframe)).to.have.length(0);
    visible = true;
    canvasBus.toolbarSelectionState.emit(DOC_SURFACE);
    expect(selections(iframe)).to.have.length(0);
  });

  it('posts after leaving and re-entering the same block', async () => {
    const view = makeDocView();
    const iframe = await connect(view);
    select(view, 'cards');
    select(view, 'Intro');
    select(view, 'cards');
    expect(selections(iframe)).to.have.length(2);
  });

  it('stops after destroy', async () => {
    const view = makeDocView();
    const iframe = await connect(view);
    destroyChannel();
    destroyChannel = undefined;
    select(view, 'cards');
    expect(selections(iframe)).to.have.length(0);
  });

  it('does not post when an edit above the selected block shifts its position', async () => {
    const view = makeDocView();
    const iframe = await connect(view);
    select(view, 'cards');
    view.dispatch(view.state.tr.insertText('More ', 1));
    canvasBus.toolbarSelectionState.emit(DOC_SURFACE);
    expect(selections(iframe)).to.have.length(1);
  });

  ['ew-table-drag', 'ew-asset-drag'].forEach((event) => {
    it(`ignores selections caused by an ${event} drop`, async () => {
      const view = makeDocView();
      const iframe = await connect(view);
      window.dispatchEvent(new CustomEvent(`${event}-start`, { detail: {} }));
      select(view, 'cards');
      window.dispatchEvent(new Event(`${event}-end`));
      select(view, 'hero');
      expect(selections(iframe)).to.have.length(0);
      await wait(550);
      select(view, 'cards');
      expect(selections(iframe)).to.have.length(1);
    });
  });
});
