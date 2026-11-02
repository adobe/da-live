import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { NodeSelection, TextSelection } from 'da-y-wrapper';
import { setNx, getNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import { makeRealView, makeView } from '../test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { setupIframeChannel } = await import('../../../../../blocks/canvas/ew-panel-extensions/iframe-protocol.js');
const { CHAT_EVENT } = await import(`${getNx()}/utils/chat.js`);
const { PANEL_EVENT } = await import(`${getNx()}/utils/panel.js`);
const { getInstrumentedHTML, getInstrumentedHTMLForSDK } = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');

const wait = (ms = 50) => new Promise((resolve) => { setTimeout(resolve, ms); });

function makeIframe(src = 'https://plugin.example.com/app') {
  return { src, contentWindow: { postMessage: sinon.spy() } };
}

function setUrl(url) {
  window.history.replaceState(null, '', url);
}

describe('acknowledged live HTML replacement', () => {
  let view;
  let connection;
  const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  beforeEach(async () => {
    view = makeRealView({
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          { type: 'table_row', content: [{ type: 'table_cell', content: [paragraph('hero')] }] },
          { type: 'table_row', content: [{ type: 'table_cell', content: [paragraph('Original')] }] },
        ],
      }, paragraph('Keep')],
    });
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)));
    connection = await setupIframeChannel({
      iframe: makeIframe(),
      hashState: { org: 'org', site: 'site', path: 'page' },
      getView: () => view,
      onClose: () => {},
    });
  });
  afterEach(() => {
    sinon.restore();
    connection.destroy();
    const mount = view.dom.parentElement;
    view.destroy();
    mount?.remove();
  });
  const replace = (details) => new Promise((resolve) => {
    connection.channel.port2.onmessage = ({ data }) => {
      if (data.action === 'sdkResponse') resolve(data.result);
    };
    connection.channel.port2.postMessage({ action: 'sendHTML', requestId: 'replace-1', details });
  });
  it('acknowledges a guarded block replacement with the updated live document', async () => {
    const expected = { html: getInstrumentedHTMLForSDK(view), blockIndex: 0 };
    const result = await replace({
      html: '<div class="hero"><div><div><p>Updated</p></div></div></div>',
      replace: true,
      expected,
    });
    expect(result.ok).to.equal(true);
    expect(result.html).to.include('Updated').and.include('Keep');
    expect(result.selection).to.deep.equal({ blockIndex: 0 });
    expect(result.editable).to.equal(true);
    expect(view.state.doc.childCount).to.equal(2);
  });
  it('acknowledges an applied replacement even when its HTML cannot be serialized', async () => {
    const error = new Error('Serialization failed');
    sinon.stub(view.dom, 'cloneNode').throws(error);
    const warn = sinon.stub(console, 'warn');
    const result = await replace({
      html: '<div class="hero"><div><div><p>Updated</p></div></div></div>',
      replace: true,
    });
    expect(result.ok).to.equal(true);
    expect(result.html).to.equal(null);
    expect(result.selection).to.deep.equal({ blockIndex: 0 });
    expect(result.editable).to.equal(true);
    expect(view.state.doc.textContent).to.equal('heroUpdatedKeep');
    expect(warn.calledOnce).to.equal(true);
    expect(warn.firstCall.args).to.deep.equal([
      'Could not serialize or broadcast the live document after replacement:', error,
    ]);
  });
  it('reuses the post-replacement HTML for the broadcast and cancels pending snapshots', async () => {
    const initial = new Promise((resolve) => {
      connection.channel.port2.onmessage = ({ data }) => {
        if (data.action === 'liveDocument') resolve(data);
      };
    });
    connection.channel.port2.postMessage({ action: 'subscribeLiveDocument' });
    const snapshot = await initial;
    const clone = sinon.spy(view.dom, 'cloneNode');
    const broadcasts = [];
    connection.channel.port2.addEventListener('message', ({ data }) => {
      if (data.action === 'liveDocument') broadcasts.push(data);
    });
    canvasBus.editorDocState.emit({ doc: view.state.doc });
    const result = await replace({
      html: '<div class="hero"><div><div><p>Updated</p></div></div></div>',
      replace: true,
      expected: { html: snapshot.html, blockIndex: 0 },
    });
    await wait(200);
    expect(result.ok).to.equal(true);
    expect(clone.callCount).to.equal(2);
    expect(broadcasts).to.deep.equal([{
      action: 'liveDocument',
      html: result.html,
      selection: result.selection,
      editable: result.editable,
    }]);
  });
  it('acknowledges an applied replacement even when its broadcast fails', async () => {
    const initial = new Promise((resolve) => {
      connection.channel.port2.onmessage = ({ data }) => {
        if (data.action === 'liveDocument') resolve(data);
      };
    });
    connection.channel.port2.postMessage({ action: 'subscribeLiveDocument' });
    await initial;
    const error = new Error('Broadcast failed');
    sinon.stub(connection.channel.port1, 'postMessage').callThrough()
      .withArgs(sinon.match.has('action', 'liveDocument')).throws(error);
    const warn = sinon.stub(console, 'warn');
    const result = await replace({
      html: '<div class="hero"><div><div><p>Updated</p></div></div></div>',
      replace: true,
    });
    expect(result.ok).to.equal(true);
    expect(result.html).to.include('Updated');
    expect(view.state.doc.textContent).to.equal('heroUpdatedKeep');
    expect(warn.calledOnce).to.equal(true);
    expect(warn.firstCall.args[1]).to.equal(error);
  });
  it('round-trips image URLs through subscription and guarded edits', async () => {
    const src = 'https://stage-content.da.live/other/site/.demo/bg.jpg';
    let pos;
    view.state.doc.descendants((node, start) => {
      if (node.isText && node.text === 'Original') pos = start;
    });
    const image = view.state.schema.nodes.paragraph.create(
      null,
      view.state.schema.nodes.image.create({ src }),
    );
    const tr = view.state.tr.insert(pos - 1, image);
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, 0)));
    const initial = new Promise((resolve) => {
      connection.channel.port2.onmessage = ({ data }) => {
        if (data.action === 'liveDocument') resolve(data);
      };
    });
    connection.channel.port2.postMessage({ action: 'subscribeLiveDocument' });
    let snapshot = await initial;
    for (const title of ['Updated', 'Updated again']) {
      const doc = new DOMParser().parseFromString(snapshot.html, 'text/html');
      const block = doc.querySelector('table');
      expect(block.querySelector('img').getAttribute('src')).to.equal(src);
      expect([...block.querySelectorAll('source')].map((source) => source.getAttribute('srcset')))
        .to.deep.equal([src, src]);
      const text = [...block.querySelectorAll('tr')[1].querySelectorAll('p')]
        .find((paragraphNode) => paragraphNode.textContent.trim());
      text.textContent = title;
      snapshot = await replace({
        html: block.outerHTML,
        replace: true,
        expected: { html: snapshot.html, blockIndex: 0 },
      });
      expect(snapshot.ok).to.equal(true);
      expect(snapshot.html).to.equal(getInstrumentedHTMLForSDK(view));
      const response = new DOMParser().parseFromString(snapshot.html, 'text/html');
      expect(response.querySelector('img').getAttribute('src')).to.equal(src);
      expect(view.state.doc.textContent).to.include(title);
      view.state.doc.descendants((node) => {
        if (node.type.name === 'image') expect(node.attrs.src).to.equal(src);
      });
    }
  });
  it('accepts a guarded replacement after remote cursor metadata moves without a document update', async () => {
    const [first, second] = view.dom.querySelectorAll('p');
    first.setAttribute('data-cursor-remote', 'Collaborator');
    first.setAttribute('data-cursor-remote-color', 'red');
    const initial = new Promise((resolve) => {
      connection.channel.port2.onmessage = ({ data }) => {
        if (data.action === 'liveDocument') resolve(data);
      };
    });
    connection.channel.port2.postMessage({ action: 'subscribeLiveDocument' });
    const snapshot = await initial;
    expect(snapshot.html).not.to.include('data-cursor-remote');
    const before = view.state.doc;
    const preview = getInstrumentedHTML(view);
    first.removeAttribute('data-cursor-remote');
    first.removeAttribute('data-cursor-remote-color');
    second.setAttribute('data-cursor-remote', 'Collaborator');
    second.setAttribute('data-cursor-remote-color', 'blue');
    expect(getInstrumentedHTML(view)).not.to.equal(preview);
    expect(view.state.doc).to.equal(before);
    const result = await replace({
      html: '<div class="hero"><div><div><p>Updated</p></div></div></div>',
      replace: true,
      expected: { html: snapshot.html, blockIndex: 0 },
    });
    expect(result.ok).to.equal(true);
    expect(result.html).not.to.include('data-cursor-remote');
    expect(view.state.doc.textContent).to.equal('heroUpdatedKeep');
  });
  it('rejects stale content and a changed selection atomically', async () => {
    const expected = { html: getInstrumentedHTMLForSDK(view), blockIndex: 0 };
    const tr = view.state.tr.insertText('Other', view.state.doc.content.size - 1);
    view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, 0)));
    const before = view.state.doc;
    const details = { html: '<p>Wrong</p>', replace: true, expected };
    expect((await replace(details)).error).to.equal('STALE_LIVE');
    expect(view.state.doc).to.equal(before);
    view.dispatch(view.state.tr.setSelection(
      TextSelection.create(view.state.doc, view.state.doc.content.size - 1),
    ));
    expect((await replace(details)).error).to.equal('WRONG_SELECTION');
    expect(view.state.doc).to.equal(before);
  });
  it('reports read-only and invalid replacement errors without modifying the document', async () => {
    const before = view.state.doc;
    view.setProps({ editable: () => false });
    expect((await replace({ html: '<p>No</p>', replace: true })).error).to.equal('READ_ONLY');
    view.setProps({ editable: () => true });
    expect((await replace({ html: '', replace: true })).error).to.equal('INVALID_HTML');
    expect((await replace({ html: '<p>No</p>', replace: true, expected: {} })).error)
      .to.equal('INVALID_EXPECTED');
    expect(view.state.doc).to.equal(before);
  });
});

describe('setupIframeChannel', () => {
  let originalUrl;

  beforeEach(() => {
    originalUrl = window.location.href;
  });

  afterEach(() => {
    setUrl(originalUrl);
    canvasBus.branchState.emit({ path: null, status: 'pending' });
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
      branch: 'feature123',
      path: '/a/b',
      view: 'split',
      hash: '#/myorg/mysite/a/b',
    });
    expect(message.context).to.equal(message.project);
    expect(message.capabilities).to.deep.equal({ liveDocument: 1, sendHTMLReplace: 1 });
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
      onClose: () => {},
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

describe('setupIframeChannel live document subscription', () => {
  const table = (text) => ({
    type: 'table',
    content: [
      { type: 'table_row', content: [{ type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cards' }] }] }] },
      { type: 'table_row', content: [{ type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }] },
    ],
  });
  const makeDocument = (second) => makeRealView({ type: 'doc', content: [table('First'), table(second)] });
  const disposeView = (view) => {
    const mount = view.dom.parentElement;
    view.destroy();
    mount?.remove();
  };
  let currentView;
  let destroyChannel;

  afterEach(() => {
    destroyChannel?.();
    if (currentView) disposeView(currentView);
    currentView = undefined;
    destroyChannel = undefined;
  });

  it('pairs live block selection with the latest debounced HTML rather than stale HTML', async () => {
    currentView = makeDocument('Second');
    const { channel, destroy } = await setupIframeChannel({
      iframe: makeIframe(),
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => currentView,
      onClose: () => {},
    });
    destroyChannel = destroy;
    const messages = [];
    channel.port2.onmessage = ({ data }) => messages.push(data);
    channel.port2.postMessage({ action: 'subscribeLiveDocument' });
    await wait(30);
    expect(messages).to.have.length(1);
    expect(messages[0].action).to.equal('liveDocument');
    expect(messages[0].selection).to.deep.equal({ blockIndex: 0 });
    expect(new DOMParser().parseFromString(messages[0].html, 'text/html').querySelectorAll('table'))
      .to.have.length(2);

    const secondPos = currentView.state.doc.child(0).nodeSize;
    currentView.dispatch(currentView.state.tr.setSelection(
      NodeSelection.create(currentView.state.doc, secondPos),
    ));
    canvasBus.editorSelectState.emit({ source: 'doc', blockIndex: 1 });
    await wait(20);
    expect(messages[1]).to.deep.equal({ action: 'liveSelection', selection: { blockIndex: 1 } });

    const previous = currentView;
    currentView = makeDocument('Updated second');
    disposeView(previous);
    canvasBus.editorDocState.emit();
    canvasBus.editorSelectState.emit({ source: 'doc', blockIndex: 0 });
    await wait(20);
    expect(messages).to.have.length(2);
    await wait(170);
    expect(messages).to.have.length(3);
    expect(messages[2].action).to.equal('liveDocument');
    expect(messages[2].html).to.include('Updated second');
    expect(messages[2].selection).to.deep.equal({ blockIndex: 0 });
  });

  it('stops updates on unsubscribe and sends a fresh snapshot on resubscribe', async () => {
    currentView = makeDocument('Before');
    const { channel, destroy } = await setupIframeChannel({
      iframe: makeIframe(),
      hashState: { org: 'myorg', site: 'mysite' },
      getView: () => currentView,
      onClose: () => {},
    });
    destroyChannel = destroy;
    const messages = [];
    channel.port2.onmessage = ({ data }) => messages.push(data);
    channel.port2.postMessage({ action: 'subscribeLiveDocument' });
    await wait(30);
    channel.port2.postMessage({ action: 'unsubscribeLiveDocument' });
    await wait(20);
    const previous = currentView;
    currentView = makeDocument('After');
    disposeView(previous);
    canvasBus.editorDocState.emit();
    canvasBus.editorSelectState.emit({ source: 'doc', blockIndex: 1 });
    await wait(180);
    expect(messages).to.have.length(1);

    channel.port2.postMessage({ action: 'subscribeLiveDocument' });
    await wait(30);
    expect(messages).to.have.length(2);
    expect(messages[1].html).to.include('After');
    expect(messages[1].selection).to.deep.equal({ blockIndex: 0 });
  });
});
