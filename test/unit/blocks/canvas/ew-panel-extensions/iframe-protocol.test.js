import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { TextSelection } from 'da-y-wrapper';
import { setNx, getNx } from '../../../../../scripts/utils.js';
import { makeView } from '../test-helpers.js';

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
      site: 'mysite',
      ref: 'feature123',
      path: '/a/b',
      view: 'split',
      hash: '#/myorg/mysite/a/b',
    });
    expect(message.context).to.equal(message.project);
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
    const options = { iframe, hashState: HOST, getView: () => view, onClose: () => {} };
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
