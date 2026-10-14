import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createFindingsController } = await import('../../../../../blocks/canvas/ew-findings/findings-controller.js');

const text = (t) => ({ type: 'text', text: t });
// an image that exists in the repo, so the editor DOM does not trigger a 404
const HERO = 'favicon.png';

const findings = [
  {
    id: 'a',
    title: 'Header copy',
    suggested: 'S-a',
    issue: 'I-a',
    evidence: [{ anchorType: 'text', anchorText: 'passion for', replacement: 'love of' }],
  },
  { id: 'b', title: 'Tone', suggested: 'S-b', issue: 'I-b', evidence: [{ anchorType: 'text', anchorText: 'exceptional coffee' }] },
  { id: 'c', title: 'Hero image', suggested: 'S-c', evidence: [{ anchorType: 'image', src: `https://x.aem.live/${HERO}` }] },
  { id: 'd', title: 'Ghost', suggested: 'S-d', evidence: [{ anchorType: 'text', anchorText: 'not on the page' }] },
];

const IFRAME_RECT = {
  top: 50,
  left: 20,
  right: 700,
  bottom: 550,
  width: 680,
  height: 500,
};

const tick = (ms = 0) => new Promise((r) => { setTimeout(r, ms); });
const until = async (fn, ms = 1000) => {
  const start = Date.now();
  // eslint-disable-next-line no-await-in-loop
  while (!fn() && Date.now() - start < ms) { await tick(5); }
  return fn();
};

async function setup({ withPort = true, withIframe = true, layoutTimeoutMs } = {}) {
  let view;
  const sent = [];
  const port = { postMessage: (m) => sent.push(m) };
  const iframe = {
    isConnected: true,
    getBoundingClientRect: () => IFRAME_RECT,
    getRootNode: () => document,
  };
  const controller = createFindingsController({
    getView: () => view,
    getPort: () => (withPort ? port : undefined),
    getIframe: () => (withIframe ? iframe : undefined),
    getCtx: () => ({ org: 'acme', repo: 'site', path: 'acme/site/drafts/me/index' }),
    layoutTimeoutMs,
  });
  const editor = await createTestEditor({ additionalPlugins: [controller.plugin] });
  view = editor.view;
  const doc = view.state.schema.nodeFromJSON({
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [text('Born from a passion for exceptional coffee.')],
      },
      { type: 'paragraph', content: [{ type: 'image', attrs: { src: `/img/favicons/${HERO}` } }] },
      { type: 'paragraph', content: [text('Closing paragraph')] },
    ],
  });
  view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content));

  await controller.start();
  return { editor, view, sent, controller, iframe };
}

function focus(findingId, list = findings) {
  const event = new CustomEvent('nx-eval-focus-finding', {
    cancelable: true,
    detail: { findingId, findings: list },
  });
  document.dispatchEvent(event);
  return event;
}

const card = () => document.querySelector('ew-finding-card');
const markerMsgs = (sent) => sent.filter((m) => m.type === 'set-finding-markers');

describe('findings controller', () => {
  let ctx;
  afterEach(() => {
    ctx?.controller.stop();
    destroyEditor(ctx?.editor);
    ctx = undefined;
    document.querySelectorAll('ew-finding-card').forEach((el) => el.remove());
  });

  it('claims the event and posts one marker for the selected finding', async () => {
    ctx = await setup();
    const event = focus('b');
    expect(event.defaultPrevented).to.be.true;
    await until(() => markerMsgs(ctx.sent).length > 0);
    const [msg] = markerMsgs(ctx.sent);
    const { doc } = ctx.view.state;
    expect(msg.payload.markers).to.have.lengthOf(1);
    const [marker] = msg.payload.markers;
    expect(marker.id).to.match(/^text:\d+$/);
    expect(marker.anchorType).to.equal('text');
    expect(doc.textBetween(marker.from, marker.to)).to.equal('exceptional coffee');
    expect(msg.payload.selectedId).to.equal(marker.id);
    expect(msg.payload.scrollIntoView).to.be.true;
  });

  it('does not claim without a view, with a bad payload or an unknown finding id', async () => {
    ctx = await setup();
    expect(focus('zzz').defaultPrevented).to.be.false;
    const bad = new CustomEvent('nx-eval-focus-finding', { cancelable: true, detail: {} });
    document.dispatchEvent(bad);
    expect(bad.defaultPrevented).to.be.false;

    const noView = createFindingsController({ getView: () => undefined });
    await noView.start();
    expect(focus('a').defaultPrevented).to.be.true; // the first controller still claims it
    ctx.controller.stop();
    expect(focus('a').defaultPrevented).to.be.false; // only the view-less one is left
    noView.stop();
  });

  it('does not claim a finding without resolvable evidence', async () => {
    ctx = await setup();
    const event = focus('no-evidence', [{ id: 'no-evidence', title: 'Preflight suggestion', evidence: [] }]);
    expect(event.defaultPrevented).to.be.false;
    await tick(20);
    expect(ctx.controller.isOpen).to.be.false;
  });

  it('does not claim an event that is already claimed', async () => {
    ctx = await setup();
    const early = (e) => e.preventDefault();
    document.addEventListener('nx-eval-focus-finding', early, { capture: true });
    focus('a');
    document.removeEventListener('nx-eval-focus-finding', early, { capture: true });
    await tick(20);
    expect(ctx.controller.isOpen).to.be.false;
  });

  it('is idempotent to start and stops listening on stop', async () => {
    ctx = await setup();
    await ctx.controller.start();
    await ctx.controller.start();
    focus('a');
    await until(() => card()?.finding);
    expect(document.querySelectorAll('ew-finding-card')).to.have.lengthOf(1);
    ctx.controller.stop();
    expect(ctx.controller.isOpen).to.be.false;
    expect(focus('a').defaultPrevented).to.be.false;
  });

  it('groups findings on the same element and steps through them', async () => {
    ctx = await setup();
    focus('a');
    await until(() => card()?.total === 2);
    expect(card().index).to.equal(0);
    expect(card().finding.id).to.equal('a');
    expect(card().quote).to.equal('passion for');
    expect(card().replacement).to.equal('love of');

    card().dispatchEvent(new CustomEvent('finding-step', { bubbles: true, detail: { delta: 1 } }));
    expect(card().finding.id).to.equal('b');
    expect(card().index).to.equal(1);
    const msgs = markerMsgs(ctx.sent);
    const last = msgs[msgs.length - 1].payload.markers[0];
    expect(ctx.view.state.doc.textBetween(last.from, last.to)).to.equal('exceptional coffee');
    expect(last.id).to.equal(msgs[0].payload.markers[0].id);

    card().dispatchEvent(new CustomEvent('finding-step', { bubbles: true, detail: { delta: 1 } }));
    expect(card().finding.id).to.equal('b');
  });

  it('posts an image marker with the image src', async () => {
    ctx = await setup();
    focus('c');
    await until(() => markerMsgs(ctx.sent).length > 0);
    const [marker] = markerMsgs(ctx.sent)[0].payload.markers;
    expect(marker.anchorType).to.equal('image');
    expect(marker.id).to.match(/^image:\d+$/);
    expect(marker.imageSrc).to.include(HERO);
    expect(marker.to - marker.from).to.equal(1);
  });

  it('keeps the card hidden until the iframe reports the layout, then anchors it', async () => {
    ctx = await setup();
    focus('b');
    await until(() => card()?.finding);
    expect(card().pending).to.be.true;
    const id = markerMsgs(ctx.sent)[0].payload.selectedId;

    ctx.controller.onMarkerLayout({ id: 'other', rect: { top: 1, left: 1, width: 1, height: 1 } });
    expect(card().pending).to.be.true;

    ctx.controller.onMarkerLayout({ id, rect: { top: 50, left: 30, width: 400, height: 60 } });
    expect(card().pending).to.be.false;
    expect(card().placement).to.equal('anchored');
    // iframe viewport coords + iframe offset (left 20, top 50)
    expect(card().anchorRect).to.deep.equal({ top: 100, left: 50, width: 400, height: 60 });
    expect(card().unresolved).to.be.false;
    expect(card().bounds).to.deep.include({ top: 50, left: 20, width: 680, height: 500 });

    ctx.controller.onMarkerLayout({ id, rect: null });
    expect(card().placement).to.equal('center');
    expect(card().unresolved).to.be.true;
  });

  it('falls back to a centered card when the iframe never reports a layout', async () => {
    ctx = await setup({ layoutTimeoutMs: 30 });
    focus('b');
    await until(() => card()?.finding);
    expect(card().pending).to.be.true;
    await until(() => card().pending === false);
    expect(card().placement).to.equal('center');
  });

  it('opens a centered dialog without marker when the evidence is not on the page', async () => {
    ctx = await setup();
    focus('d');
    await until(() => card()?.finding);
    expect(card().placement).to.equal('center');
    expect(card().unresolved).to.be.true;
    expect(card().pending).to.be.false;
    expect(card().total).to.equal(1);
    expect(markerMsgs(ctx.sent)).to.have.lengthOf(0);
  });

  it('opens a centered dialog without marker when there is no port or iframe', async () => {
    ctx = await setup({ withPort: false });
    focus('b');
    await until(() => card()?.finding);
    expect(card().placement).to.equal('center');
    expect(card().unresolved).to.be.true;
    expect(ctx.sent).to.have.lengthOf(0);
    ctx.controller.close();

    ctx.controller.stop();
    destroyEditor(ctx.editor);
    ctx = await setup({ withIframe: false });
    focus('b');
    await until(() => card()?.finding);
    expect(card().placement).to.equal('center');
    expect(ctx.sent).to.have.lengthOf(0);
  });

  it('clears the marker on close via the card, Escape and outside click', async () => {
    ctx = await setup();
    const cleared = () => {
      const m = markerMsgs(ctx.sent);
      const last = m[m.length - 1];
      return last.payload.markers.length === 0 && last.payload.selectedId === null;
    };

    focus('a');
    await until(() => card()?.finding);
    card().dispatchEvent(new CustomEvent('finding-close', { bubbles: true }));
    expect(card()).to.be.null;
    expect(ctx.controller.isOpen).to.be.false;
    expect(cleared()).to.be.true;

    focus('a');
    await until(() => card()?.finding);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(card()).to.be.null;
    expect(cleared()).to.be.true;

    focus('a');
    await until(() => card()?.finding);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(card()).to.be.null;
    expect(cleared()).to.be.true;
  });

  it('keeps the card open for clicks inside it and Escape typed in an outside input', async () => {
    ctx = await setup();
    focus('a');
    await until(() => card()?.finding);
    card().shadowRoot.querySelector('.card').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(ctx.controller.isOpen).to.be.true;

    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    input.remove();
    expect(ctx.controller.isOpen).to.be.true;
  });

  it('closes when the preview iframe takes focus, unless a marker click follows', async () => {
    ctx = await setup();
    ctx.iframe.getRootNode = () => ({ activeElement: ctx.iframe });
    focus('a');
    await until(() => card()?.finding);
    const id = markerMsgs(ctx.sent)[0].payload.selectedId;

    window.dispatchEvent(new Event('blur'));
    ctx.controller.onMarkerClick({ id });
    await tick(400);
    expect(ctx.controller.isOpen).to.be.true;

    window.dispatchEvent(new Event('blur'));
    await tick(400);
    expect(ctx.controller.isOpen).to.be.false;
    expect(card()).to.be.null;
  });

  it('ignores a window blur that did not move focus into the iframe', async () => {
    ctx = await setup();
    focus('a');
    await until(() => card()?.finding);
    window.dispatchEvent(new Event('blur'));
    await tick(400);
    expect(ctx.controller.isOpen).to.be.true;
  });

  it('does not clear a marker that was never posted', async () => {
    ctx = await setup({ withPort: false });
    focus('b');
    await until(() => card()?.finding);
    ctx.controller.close();
    expect(ctx.sent).to.have.lengthOf(0);
  });

  it('Apply change sends the instruction with auto-send and closes everything', async () => {
    ctx = await setup();
    const events = [];
    const rec = (e) => events.push(e);
    document.addEventListener('nx-panel-open', rec);
    focus('a');
    await until(() => card()?.finding);
    card().dispatchEvent(new CustomEvent('finding-apply', { bubbles: true }));
    document.removeEventListener('nx-panel-open', rec);

    expect(events).to.have.lengthOf(1);
    const { section, options } = events[0].detail;
    expect(section).to.equal('chat');
    expect(options.autoSend).to.be.true;
    expect(options.text).to.include('(acme/site/drafts/me/index)');
    expect(options.text).to.include('Check: Header copy');
    expect(options.text).to.include('Element: Heading 1');
    expect(options.text).to.include('Current text: "passion for"');
    expect(options.text).to.include('Change it to: "love of"');
    expect(card()).to.be.null;
    const m = markerMsgs(ctx.sent);
    expect(m[m.length - 1].payload.markers).to.deep.equal([]);
  });

  it('Add to chat adds the pill and keeps the card open', async () => {
    ctx = await setup();
    const pills = [];
    const rec = (e) => pills.push(e.detail);
    document.addEventListener('nx-add-to-chat', rec);
    focus('a');
    await until(() => card()?.finding);
    card().dispatchEvent(new CustomEvent('finding-add-to-chat', { bubbles: true }));
    document.removeEventListener('nx-add-to-chat', rec);

    expect(pills).to.have.lengthOf(1);
    expect(pills[0]).to.include({ key: 'eval-finding', id: 'eval-a', type: 'evaluation-finding', name: 'Header copy' });
    expect(pills[0].description).to.include('Element: Heading 1');
    expect(ctx.controller.isOpen).to.be.true;
  });

  it('marker click re-focuses the open card and cancels a pending outside-click close', async () => {
    ctx = await setup();
    focus('a');
    await until(() => card()?.finding);
    const id = markerMsgs(ctx.sent)[0].payload.selectedId;
    ctx.controller.onMarkerClick({ id: 'nope' });
    ctx.controller.onMarkerClick({ id });
    expect(ctx.controller.isOpen).to.be.true;
  });

  it('follows document edits and closes when the anchor no longer resolves', async () => {
    ctx = await setup();
    focus('b');
    await until(() => card()?.finding);
    const before = markerMsgs(ctx.sent)[0].payload.markers[0];
    const count = markerMsgs(ctx.sent).length;

    const { view } = ctx;
    view.dispatch(view.state.tr.insertText('AAA ', 1));
    const msgs = markerMsgs(ctx.sent);
    expect(msgs).to.have.lengthOf(count + 1);
    const moved = msgs[msgs.length - 1].payload;
    expect(moved.scrollIntoView).to.be.false;
    expect(moved.markers[0].id).to.equal(before.id);
    expect(moved.markers[0].from).to.equal(before.from + 4);
    expect(view.state.doc.textBetween(moved.markers[0].from, moved.markers[0].to))
      .to.equal('exceptional coffee');

    view.dispatch(view.state.tr.delete(0, view.state.doc.firstChild.nodeSize));
    expect(ctx.controller.isOpen).to.be.false;
    expect(card()).to.be.null;
    const last = markerMsgs(ctx.sent).pop();
    expect(last.payload.markers).to.deep.equal([]);
  });

  it('re-sends the marker when the port changes', async () => {
    ctx = await setup();
    focus('b');
    await until(() => card()?.finding);
    const count = markerMsgs(ctx.sent).length;
    ctx.controller.onPortChange();
    expect(markerMsgs(ctx.sent)).to.have.lengthOf(count + 1);
  });
});
