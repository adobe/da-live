import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import { getNx2Api } from '../../../../scripts/utils.js';
import { loadConfig } from '../../../../blocks/start/start.js';

const { config } = await getNx2Api();

describe('site setup organization permissions', () => {
  let el;
  let href;
  let ims;
  let permission;
  let write;

  beforeEach(() => {
    href = window.location.href;
    const url = new URL(href);
    url.searchParams.set('landing', 'home');
    window.history.replaceState(null, '', url);
    ims = window.adobeIMS;
    window.adobeIMS = { isSignedInUser: () => true };
    localStorage.removeItem('nx-ims');
    permission = sinon.stub(config, 'get').resolves(new Response('{}', { headers: { 'x-da-actions': '/=read' } }));
    write = sinon.stub(window, 'fetch').resolves(new Response(null, { status: 201 }));
    el = document.createElement('da-start');
    el.org = 'org';
    el.site = 'new';
    sinon.stub(el, 'goToNextStep');
  });

  afterEach(() => {
    sinon.restore();
    window.history.replaceState(null, '', href);
    if (ims === undefined) delete window.adobeIMS;
    else window.adobeIMS = ims;
  });

  it('blocks non-admin creation from the LP flow before any write', async () => {
    await el.submitForm({ preventDefault() {}, target: { action: 'https://admin.da.live/source/org/new' } });
    expect(write.called).to.equal(false);
    expect(el._errorText).to.include('Only organization administrators');
    expect(el._loading).to.equal(false);
  });

  it('does not infer admin access from synthetic content-write permissions', async () => {
    const response = new Response('{}');
    response.permissions = ['read', 'write'];
    permission.resolves(response);
    await el.submitForm({ preventDefault() {}, target: { action: 'https://admin.da.live/source/org/new' } });
    expect(write.called).to.equal(false);
  });

  it('reuses the existing creation flow for verified org admins', async () => {
    permission.resolves(new Response('{}', { headers: { 'x-da-actions': '/=read,write' } }));
    await el.submitForm({ preventDefault() {}, target: { action: 'https://admin.da.live/source/org/new' } });
    expect(write.calledOnce).to.equal(true);
    expect(write.firstCall.args[1].method).to.equal('PUT');
    expect(el.goToNextStep.calledOnce).to.equal(true);
  });

  it('preserves the legacy creation flow outside the landing opt-in', async () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('landing');
    window.history.replaceState(null, '', url);
    await el.submitForm({ preventDefault() {}, target: { action: 'https://admin.da.live/source/org/new' } });
    expect(write.calledOnce).to.equal(true);
    expect(el.goToNextStep.calledOnce).to.equal(true);
  });

  it('reports configuration failures and never writes after a failed permission check', async () => {
    permission.rejects(new Error('Offline'));
    const result = await loadConfig('org');
    expect(result.status).to.equal(0);
    expect(result.message).to.include('Offline');
    await el.submitForm({ preventDefault() {}, target: { action: 'https://admin.da.live/source/org/new' } });
    expect(write.called).to.equal(false);
    expect(el._errorText).to.include('Offline');
    expect(el._loading).to.equal(false);
  });
});
