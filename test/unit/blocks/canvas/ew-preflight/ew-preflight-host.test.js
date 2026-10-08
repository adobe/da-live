/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

const tick = () => new Promise((resolve) => { setTimeout(resolve, 30); });

const EXTENSION = {
  name: 'preflight',
  title: 'Preflight',
  sources: ['https://example.com/pf'],
  experience: 'inline',
  org: 'org',
  site: 'site',
};

function captureStatus() {
  const events = [];
  const handler = (e) => { events.push(e.detail); };
  document.addEventListener('nx-preflight-status', handler);
  return {
    events,
    stop: () => document.removeEventListener('nx-preflight-status', handler),
  };
}

describe('ew-preflight-host', () => {
  let canvasBus;
  let peekPendingPreflightRequest;
  let takePendingPreflightRequest;
  let el;

  before(async () => {
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    const responder = await import('../../../../../blocks/canvas/editor-utils/preflight-responder.js');
    ({ peekPendingPreflightRequest, takePendingPreflightRequest } = responder);
    responder.initPreflightResponder();
    await import('../../../../../blocks/canvas/ew-preflight/ew-preflight-host.js');
    ({ canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js'));
  });

  async function mount() {
    const host = document.createElement('ew-preflight-host');
    host.extension = EXTENSION;
    document.body.append(host);
    await host.updateComplete;
    return host;
  }

  const custom = (host) => host.shadowRoot.querySelector('ew-panel-extension');
  const builtin = (host) => host.shadowRoot.querySelector('ew-preflight');
  const run = (requestId) => canvasBus.preflightRunRequest.emit({ paths: ['/org/site/a.html'], requestId });

  afterEach(() => {
    el?.remove();
    el = null;
    takePendingPreflightRequest();
  });

  it('shows the custom content by default', async () => {
    el = await mount();
    expect(custom(el)).to.exist;
    expect(custom(el).hidden).to.equal(false);
    expect(custom(el).extension).to.equal(EXTENSION);
    expect(builtin(el)).to.equal(null);
    expect(el.getHeaderActions().childElementCount).to.equal(0);
  });

  it('switches to the built-in Preflight for a publish gate and reports its verdict', async () => {
    el = await mount();
    const cap = captureStatus();
    run('h1');
    await el.updateComplete;
    await tick();
    cap.stop();
    expect(builtin(el)).to.exist;
    expect(custom(el).hidden).to.equal(true);
    expect(el.getHeaderActions().childElementCount).to.equal(1);
    expect(peekPendingPreflightRequest()).to.equal(null);
    const gate = cap.events.filter((d) => d.requestId === 'h1');
    expect(gate).to.have.length(1);
    expect(gate[0].path).to.equal('/org/site/a.html');
  });

  it('claims a request parked before mount exactly once', async () => {
    const cap = captureStatus();
    run('h2');
    expect(peekPendingPreflightRequest()?.requestId).to.equal('h2');
    el = await mount();
    await tick();
    cap.stop();
    expect(builtin(el)).to.exist;
    expect(peekPendingPreflightRequest()).to.equal(null);
    expect(cap.events.filter((d) => d.requestId === 'h2')).to.have.length(1);
  });

  it('returns to the custom content when the tools panel closes', async () => {
    el = await mount();
    run('h3');
    await el.updateComplete;
    await tick();
    document.dispatchEvent(new CustomEvent('nx-panel-close'));
    await el.updateComplete;
    expect(builtin(el)).to.equal(null);
    expect(custom(el).hidden).to.equal(false);
    expect(el.getHeaderActions().childElementCount).to.equal(0);
  });

  it('ignores closing a different panel section', async () => {
    el = await mount();
    run('h4');
    await el.updateComplete;
    await tick();
    document.dispatchEvent(new CustomEvent('nx-panel-close', { detail: { section: 'chat' } }));
    await el.updateComplete;
    expect(builtin(el)).to.exist;
  });

  it('returns to the custom content on a view switch only after the gate settled', async () => {
    el = await mount();
    run('h5');
    await el.updateComplete;
    await tick();
    el._gateSettled = false;
    canvasBus.toolPanelViewState.emit('files');
    await el.updateComplete;
    expect(builtin(el)).to.exist;

    canvasBus.preflightStatusState.emit({ requestId: 'h5', status: 'fail' });
    canvasBus.toolPanelViewState.emit('files');
    await el.updateComplete;
    expect(builtin(el)).to.equal(null);
    canvasBus.toolPanelViewState.emit('preflight');
  });

  it('reuses a mounted built-in for a second gate and drops the parked copy', async () => {
    el = await mount();
    run('h6');
    await el.updateComplete;
    await tick();
    const first = builtin(el);
    const cap = captureStatus();
    run('h7');
    await el.updateComplete;
    await tick();
    cap.stop();
    expect(builtin(el)).to.equal(first);
    expect(peekPendingPreflightRequest()).to.equal(null);
    expect(cap.events.filter((d) => d.requestId === 'h7')).to.have.length(1);
  });
});
