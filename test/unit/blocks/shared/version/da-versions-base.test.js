import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import DaVersionsBase from '../../../../../blocks/shared/version/da-versions-base.js';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
customElements.define('test-offline-versions', class extends DaVersionsBase {});

describe('version creation source flush', () => {
  let el;
  let fetchStub;
  const event = () => ({
    preventDefault() {},
    target: { elements: { label: { value: 'Saved snapshot' } } },
  });

  beforeEach(() => {
    el = document.createElement('test-offline-versions');
    el.path = '/org/site/page.html';
    el._newVersion = { date: 'Today', users: [] };
    el._versions = [];
    fetchStub = sinon.stub(window, 'fetch').resolves(new Response('', { status: 201 }));
    sinon.stub(el, 'getVersions').resolves();
  });

  afterEach(() => sinon.restore());

  it('waits for the source snapshot before creating a version', async () => {
    let finishSave;
    el.forceSave = sinon.stub().returns(new Promise((resolve) => { finishSave = resolve; }));
    const creating = el.handleNewSubmit(event());
    expect(fetchStub.called).to.be.false;
    expect(el._savingVersion).to.be.true;
    finishSave({ ok: true });
    await creating;
    expect(fetchStub.getCalls().filter((call) => call.args[1]?.method === 'POST'))
      .to.have.length(1);
    expect(el._newVersion).to.be.null;
    expect(el._savingVersion).to.be.false;
  });

  it('keeps the form and reports a failed source flush without creating a version', async () => {
    el.forceSave = sinon.stub().resolves({ ok: false, error: 'Write denied' });
    await el.handleNewSubmit(event());
    expect(fetchStub.called).to.be.false;
    expect(el._newVersion).to.exist;
    expect(el._saveError).to.equal('Write denied');
    expect(el._savingVersion).to.be.false;
  });

  it('does not create a version for a destination selected during flushing', async () => {
    el.forceSave = async () => {
      el.path = '/org/site/other.html';
      return { ok: true };
    };
    await el.handleNewSubmit(event());
    expect(fetchStub.called).to.be.false;
    expect(el._savingVersion).to.be.false;
  });

  it('surfaces version API failures', async () => {
    el.forceSave = sinon.stub().resolves({ ok: true });
    fetchStub.rejects(new Error('Version service unavailable'));
    await el.handleNewSubmit(event());
    expect(el._saveError).to.equal('Could not save version. Please try again.');
    expect(el._newVersion).to.exist;
    expect(el._savingVersion).to.be.false;
  });
});
