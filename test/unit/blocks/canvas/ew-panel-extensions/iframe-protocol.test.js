import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { TextSelection } from 'da-y-wrapper';
import { setNx, getNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
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

describe('setupIframeChannel link selection', () => {
  const ORIGIN = 'https://plugin.example.com';
  const hashState = { org: 'myorg', site: 'mysite' };
  const link = (href, text) => ({ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] });
  const para = (...content) => ({ type: 'paragraph', content });
  const docJson = () => ({
    type: 'doc',
    content: [
      para(link('https://a.test/one', 'one')),
      para({ type: 'text', text: 'plain' }),
      para(link('https://a.test/two', 'two')),
    ],
  });

  const onClose = () => {};
  const connect = (iframe, view) => {
    const getView = () => view;
    return setupIframeChannel({ iframe, hashState, getView, onClose });
  };

  function select(view, pos) {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  }

  function selectionPosts(iframe) {
    return iframe.contentWindow.postMessage.getCalls()
      .map((call) => call.args)
      .filter(([message]) => message.action === 'selectionChange');
  }

  it('tells the plugin which link holds the cursor once it is ready', async () => {
    const view = makeView(docJson());
    select(view, 2);
    const iframe = makeIframe();
    const { destroy } = await connect(iframe, view);

    canvasBus.editorSelectState.emit({ source: 'doc' });
    expect(selectionPosts(iframe)).to.have.lengthOf(0);

    await wait(800);

    expect(selectionPosts(iframe)).to.deep.equal([[
      { action: 'selectionChange', details: { link: { href: 'https://a.test/one', text: 'one' } } },
      ORIGIN,
    ]]);
    destroy();
  });

  it('posts link changes only when the link under the cursor changes', async () => {
    const view = makeView(docJson());
    select(view, 2);
    const iframe = makeIframe();
    const { destroy } = await connect(iframe, view);
    await wait(800);
    iframe.contentWindow.postMessage.resetHistory();

    select(view, 3);
    canvasBus.editorSelectState.emit({ source: 'doc' });
    expect(selectionPosts(iframe)).to.have.lengthOf(0);

    select(view, 14);
    canvasBus.editorSelectState.emit({ source: 'doc' });
    select(view, 8);
    canvasBus.editorDocState.emit();

    expect(selectionPosts(iframe).map(([message]) => message.details)).to.deep.equal([
      { link: { href: 'https://a.test/two', text: 'two' } },
      { link: null },
    ]);
    destroy();
  });

  it('stops posting link changes after destroy', async () => {
    const view = makeView(docJson());
    const iframe = makeIframe();
    const { destroy } = await connect(iframe, view);
    await wait(800);
    destroy();
    iframe.contentWindow.postMessage.resetHistory();

    select(view, 14);
    canvasBus.editorSelectState.emit({ source: 'doc' });

    expect(selectionPosts(iframe)).to.have.lengthOf(0);
  });

  it('replaces the selected link, confirms it and reports the new link', async () => {
    const view = makeView(docJson());
    select(view, 2);
    const iframe = makeIframe();
    const { channel, destroy } = await connect(iframe, view);
    await wait(800);
    iframe.contentWindow.postMessage.resetHistory();

    channel.port2.postMessage({
      action: 'replaceLink',
      details: { html: '<p><a href="https://a.test/new">new</a></p>', href: 'https://a.test/one' },
    });
    await wait();

    expect(view.state.doc.firstChild.textContent).to.equal('new');
    expect(view.state.doc.childCount).to.equal(3);
    expect(iframe.contentWindow.postMessage.calledWith(
      { action: 'replaceLinkResult', details: { ok: true } },
      ORIGIN,
    )).to.be.true;
    expect(selectionPosts(iframe).map(([message]) => message.details)).to.deep.equal([
      { link: { href: 'https://a.test/new', text: 'new' } },
    ]);
    destroy();
  });

  it('reports an error when the selected link cannot be replaced', async () => {
    const view = makeView(docJson());
    select(view, 8);
    const iframe = makeIframe();
    const { channel, destroy } = await connect(iframe, view);

    channel.port2.postMessage({ action: 'replaceLink', details: { html: '<p><a href="https://a.test/new">new</a></p>' } });
    await wait();

    const [[message, origin]] = iframe.contentWindow.postMessage.getCalls()
      .map((call) => call.args)
      .filter(([data]) => data.action === 'replaceLinkResult');
    expect(origin).to.equal(ORIGIN);
    expect(message.details.ok).to.be.false;
    expect(message.details.error).to.be.a('string');
    destroy();
  });

  it('reports an error for replaceLink when there is no editor view', async () => {
    const iframe = makeIframe();
    const { channel, destroy } = await connect(iframe, null);

    channel.port2.postMessage({ action: 'replaceLink', details: { html: '<p>x</p>' } });
    await wait();

    expect(iframe.contentWindow.postMessage.calledWith(
      { action: 'replaceLinkResult', details: { ok: false, error: 'No editor view' } },
      ORIGIN,
    )).to.be.true;
    destroy();
  });
});
