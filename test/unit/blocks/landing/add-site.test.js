import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import '../../../../blocks/landing/add-site.js';
import { getNx2Api } from '../../../../scripts/utils.js';

const { source, config } = await getNx2Api();
const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('landing Add site dialog', () => {
  let el;
  let list;
  let permission;

  beforeEach(async () => {
    localStorage.setItem('da-sites', JSON.stringify(['org/other']));
    permission = sinon.stub(config, 'get').resolves(new Response('{}', { headers: { 'x-da-actions': '/=read' } }));
    list = sinon.stub(source, 'list').callsFake(async (path) => ({ ok: true, items: path === '/org' ? [{ name: 'site', path: '/org/site' }] : [] }));
    el = document.createElement('da-add-site');
    el.org = 'org';
    document.body.append(el);
    await el.updateComplete;
    await tick();
    await el.updateComplete;
    el.shadowRoot.querySelector('input').value = 'https://main--site--org.aem.page';
  });

  afterEach(() => {
    el.remove();
    sinon.restore();
    localStorage.removeItem('da-sites');
  });

  it('lets a non-admin add an existing accessible site with no server writes', async () => {
    const added = sinon.spy();
    const saveSource = sinon.spy(source, 'save');
    const saveConfig = sinon.spy(config, 'save');
    el.addEventListener('site-added', added);
    expect(el.shadowRoot.querySelector('.site-creation')).to.equal(null);
    await el.submitForm({ preventDefault() {} });
    expect(added.calledOnce).to.equal(true);
    expect(added.firstCall.args[0].detail.value).to.equal('org/site');
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/site', 'org/other']);
    expect(saveSource.called).to.equal(false);
    expect(saveConfig.called).to.equal(false);
  });

  it('shows creation only for explicit organization administrators', async () => {
    permission.resolves(new Response('{}', { headers: { 'x-da-actions': '/=read,write' } }));
    await el.loadCreationPermission();
    await el.updateComplete;
    const link = new URL(el.shadowRoot.querySelector('.site-creation a').href);
    expect(link.pathname).to.equal('/start');
    expect(link.searchParams.get('org')).to.equal('org');
    expect(link.searchParams.has('site')).to.equal(false);
    permission.resolves(new Response('{}', { headers: { 'x-da-actions': '/=read' } }));
    await el.loadCreationPermission();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.site-creation')).to.equal(null);
  });

  it('keeps Add existing available when admin permissions cannot be checked', async () => {
    permission.rejects(new Error('Offline'));
    await el.loadCreationPermission();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.permission-error').textContent).to.include('Offline');
    expect(el.shadowRoot.querySelector('.site-creation')).to.equal(null);
    expect(el.shadowRoot.querySelector('button[type="submit"]').disabled).to.equal(false);
    await el.submitForm({ preventDefault() {} });
    expect(JSON.parse(localStorage.getItem('da-sites'))[0]).to.equal('org/site');
  });

  it('does not trust fallback permissions when the explicit action header is absent', async () => {
    const response = new Response('{}');
    response.permissions = ['read', 'write'];
    permission.resolves(response);
    await el.loadCreationPermission();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.site-creation')).to.equal(null);
    expect(el.shadowRoot.querySelector('.permission-error').textContent).to.include('could not be verified');
  });

  it('does not infer an admin organization when no site is selected', async () => {
    el.org = undefined;
    permission.resetHistory();
    await el.loadCreationPermission();
    expect(permission.called).to.equal(false);
    expect(el._canCreate).to.equal(false);
  });

  it('rejects invalid site URLs before checking access or changing storage', async () => {
    el.shadowRoot.querySelector('input').value = 'https://example.com';
    await el.submitForm({ preventDefault() {} });
    expect(list.called).to.equal(false);
    expect(el._error).to.include('existing AEM site URL');
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/other']);
  });

  it('does not add inaccessible sites or grant access', async () => {
    list.resolves({ ok: false });
    sinon.stub(source, 'getMetadata').resolves(new Response(null, { status: 403 }));
    await el.submitForm({ preventDefault() {} });
    expect(el._error).to.include('do not have access');
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/other']);
  });

  it('does not add a nonexistent site merely because an empty source listing succeeds', async () => {
    list.resolves({ ok: true, items: [] });
    await el.submitForm({ preventDefault() {} });
    expect(el._error).to.include('not found in your accessible sites');
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/other']);
  });

  it('surfaces unavailable access checks without calling them a confirmed denial', async () => {
    list.rejects(new Error('Offline'));
    await el.submitForm({ preventDefault() {} });
    expect(el._error).to.include('Offline');
    expect(el._error).not.to.include('do not have access');
    expect(el._saving).to.equal(false);
  });

  it('does not claim success when the browser cannot save the site', async () => {
    const added = sinon.spy();
    el.addEventListener('site-added', added);
    sinon.stub(Storage.prototype, 'setItem').throws(new DOMException('Storage unavailable', 'QuotaExceededError'));
    await el.submitForm({ preventDefault() {} });
    expect(added.called).to.equal(false);
    expect(el._error).to.include('Storage unavailable');
  });

  it('cancels an in-flight add without later saving or opening the site', async () => {
    let finish;
    list.returns(new Promise((resolve) => { finish = resolve; }));
    const added = sinon.spy();
    el.addEventListener('site-added', added);
    const pending = el.submitForm({ preventDefault() {} });
    await tick();
    el.close();
    finish({ ok: true, items: [] });
    await pending;
    expect(added.called).to.equal(false);
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal(['org/other']);
  });

  it('ignores a late administrator response after the dialog is removed', async () => {
    let finish;
    permission.returns(new Promise((resolve) => { finish = resolve; }));
    const pending = el.loadCreationPermission();
    await tick();
    el.remove();
    finish(new Response('{}', { headers: { 'x-da-actions': '/=read,write' } }));
    await pending;
    expect(el._canCreate).to.equal(false);
  });
});
