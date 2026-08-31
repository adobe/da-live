import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx, getNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { setupIframeChannel } = await import('../../../../../blocks/canvas/ew-panel-extensions/iframe-protocol.js');
const { CHAT_EVENT } = await import(`${getNx()}/utils/chat.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);
const { canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js');

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

  it('emits editorSelectState for a block scrollTo action', async () => {
    const iframe = makeIframe();
    const { channel, destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => {},
    });

    let received;
    const unsubscribe = canvasBus.editorSelectState.subscribe((detail) => { received = detail; });

    channel.port2.postMessage({ action: 'scrollTo', details: { type: 'block', blockIndex: 3 } });
    await wait();

    unsubscribe();
    expect(received).to.deep.include({ blockIndex: 3, source: 'extension' });
    destroy();
  });

  it('emits editorProseSelectState for a content scrollTo action', async () => {
    const iframe = makeIframe();
    const { channel, destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => {},
    });

    let received;
    const unsubscribe = canvasBus.editorProseSelectState.subscribe((detail) => {
      received = detail;
    });

    channel.port2.postMessage({
      action: 'scrollTo',
      details: { type: 'content', proseIndex: 7, kind: 'heading' },
    });
    await wait();

    unsubscribe();
    expect(received).to.deep.equal({ proseIndex: 7, kind: 'heading' });
    destroy();
  });

  it('resolves a section scrollTo action to its first block', async () => {
    canvasBus.editorHtmlState.emit(
      '<main><div><div class="hero" data-block-index="0">Hero</div></div></main>',
    );

    const iframe = makeIframe();
    const { channel, destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => {},
    });

    let received;
    const unsubscribe = canvasBus.editorSelectState.subscribe((detail) => { received = detail; });

    channel.port2.postMessage({ action: 'scrollTo', details: { type: 'section', sectionIndex: 0 } });
    await wait();

    unsubscribe();
    expect(received).to.deep.include({ blockIndex: 0, source: 'extension' });
    destroy();
  });

  it('is a no-op for an out-of-range section scrollTo action', async () => {
    canvasBus.editorHtmlState.emit('<main><div></div></main>');

    const iframe = makeIframe();
    const { channel, destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => {},
    });

    let calls = 0;
    const unsubscribe = canvasBus.editorSelectState.subscribe(() => { calls += 1; });

    channel.port2.postMessage({ action: 'scrollTo', details: { type: 'section', sectionIndex: 9 } });
    await wait();

    unsubscribe();
    expect(calls).to.equal(0);
    destroy();
  });

  it('is a no-op for an unrecognized scrollTo target type', async () => {
    const iframe = makeIframe();
    const { channel, destroy } = await setupIframeChannel({
      iframe,
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => null,
      onClose: () => {},
    });

    let selectCalls = 0;
    let proseCalls = 0;
    const unsubSelect = canvasBus.editorSelectState.subscribe(() => { selectCalls += 1; });
    const unsubProse = canvasBus.editorProseSelectState.subscribe(() => { proseCalls += 1; });

    channel.port2.postMessage({ action: 'scrollTo', details: { type: 'bogus' } });
    await wait();

    unsubSelect();
    unsubProse();
    expect(selectCalls).to.equal(0);
    expect(proseCalls).to.equal(0);
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
});
