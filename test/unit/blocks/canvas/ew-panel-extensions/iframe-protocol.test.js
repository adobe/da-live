import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx, getNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { setupIframeChannel } = await import('../../../../../blocks/canvas/ew-panel-extensions/iframe-protocol.js');
const { CHAT_EVENT } = await import(`${getNx()}/utils/chat.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);

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
  });

  it('is a no-op when org is missing from hashState', async () => {
    const iframe = makeIframe();
    const result = await setupIframeChannel({
      iframe,
      hashState: { site: 'mysite' },
      getView: () => null,
      onClose: () => {},
    });

    expect(result.channel).to.equal(null);
    expect(iframe.contentWindow.postMessage.called).to.be.false;
  });

  it('is a no-op when the iframe has no contentWindow', async () => {
    const result = await setupIframeChannel({
      iframe: { contentWindow: null },
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => {},
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
      onClose: () => {},
    });

    await wait(800);

    expect(iframe.contentWindow.postMessage.calledOnce).to.be.true;
    const [message, targetOrigin, transfer] = iframe.contentWindow.postMessage.firstCall.args;

    expect(message.ready).to.be.true;
    expect(message.project).to.deep.equal({
      org: 'myorg',
      repo: 'mysite',
      ref: 'feature123',
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
      onClose: () => {},
    });

    await wait(800);

    const [message] = iframe.contentWindow.postMessage.firstCall.args;
    expect(message.project.ref).to.equal('main');
    expect(message.project.path).to.equal('/');
    expect(message.project.view).to.equal('edit');

    destroy();
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
      onClose: () => {},
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
      onClose: () => {},
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
      emit(window, 'https://plugin.example.com', 'ew-asset-picker-select');
      expect(postMessage.secondCall.args[0]).to.deep.equal({
        type: 'ew-asset-picker-selection-error',
        error: 'The asset picker is not ready.',
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
        onClose: () => {},
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

  it('lists only host-fetched assets and refuses selections not returned by the listing', async () => {
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
      return new Response('', { status: 404 });
    };
    const iframe = makeIframe();
    iframe.contentWindow = window;
    const postMessage = sinon.stub(window, 'postMessage');
    let destroy;
    try {
      ({ destroy } = await setupIframeChannel({
        iframe,
        hashState: { org: 'asset-list-bridge-org', site: 'asset-list-bridge-site' },
        getView: () => null,
        onClose: () => {},
      }));
      const emit = (data) => window.dispatchEvent(new MessageEvent('message', { source: window, origin: 'https://plugin.example.com', data }));
      emit({ type: 'ew-asset-list-request' });
      await wait(150);
      const result = postMessage.getCalls().find(({ args }) => args[0].type === 'ew-asset-list-result')?.args[0];
      expect(result, JSON.stringify(postMessage.getCalls().map(({ args }) => args[0]))).to.exist;
      expect(result.assets[0].name).to.equal('listed.jpg');
      expect(result.assets[0].html).to.include('publish-p1-e1.adobeaemcloud.com');
      expect(result).not.to.have.property('token');
      expect(requests).to.have.lengthOf(1);
      expect(requests[0].options.headers.Authorization).to.equal('Bearer live-token');
      emit({ type: 'ew-asset-list-request', more: true, url: 'https://evil.org/steal' });
      await wait();
      expect(requests).to.have.lengthOf(1);
      expect(postMessage.getCalls().filter(({ args }) => args[0].type === 'ew-asset-list-result')[1].args[0]).to.include({ hasMore: false });
      emit({ type: 'ew-asset-picker-select', asset: { 'repo:id': 'urn:aaid:aem:unlisted' } });
      const error = postMessage.getCalls().find(({ args }) => args[0].type === 'ew-asset-picker-selection-error')?.args[0];
      expect(error.error).to.equal('The asset picker is not ready.');
    } finally {
      destroy?.();
      postMessage.restore();
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
      onClose: () => {},
    });
    const markup = '<table><tr><td>Hero</td></tr></table>';
    const heading = '<h2>Heading</h2>';
    const handles = [
      { x: 0, y: 0, width: 0, height: 20, html: markup },
      { x: 30, y: 50, width: 100, height: 40, html: heading },
    ];
    window.dispatchEvent(new MessageEvent('message', {
      source: iframe.contentWindow,
      origin: 'https://plugin.example.com',
      data: { type: 'ew-table-drag-handles', handles },
    }));
    const handle = document.querySelector('.ew-table-drag-handle');
    expect(document.querySelectorAll('.ew-table-drag-handle')).to.have.length(1);
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
      onClose: () => {},
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

  it('opens the chat panel with autoSend for an object-form setPrompt action', async () => {
    const iframe = makeIframe();
    const { channel, destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => {},
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
      onClose: () => {},
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
      onClose: () => {},
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
      onClose: () => {},
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
      onClose: () => {},
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
      onClose: () => {},
    });

    destroy();
    await wait(800);

    expect(iframe.contentWindow.postMessage.called).to.be.false;
  });
});
