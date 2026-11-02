import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import '../../../../blocks/landing/file-actions.js';
import { getNx2Api } from '../../../../scripts/utils.js';

const api = await getNx2Api();
const response = (data) => new Response(JSON.stringify(data));

describe('Content list details and favorites', () => {
  let el;
  let versions;
  let status;

  beforeEach(async () => {
    sinon.stub(window, 'fetch').resolves(new Response(null, { status: 404 }));
    versions = sinon.stub(api.versions, 'list').callsFake(async () => response([
      { url: '/versionsource/test', timestamp: 1, users: [{ email: 'alex@example.test' }] },
    ]));
    status = sinon.stub(api.status, 'get').callsFake(async () => response({
      preview: { status: 200, url: 'https://example.test/preview', lastModified: '2026-10-20T10:00:00Z' },
      live: { status: 404 },
    }));
    el = document.createElement('da-landing-file-actions');
    el.path = '/org/site/index.html';
    el.ext = 'html';
    el.name = 'Welcome';
    document.body.append(el);
    await el.updateComplete;
  });

  afterEach(() => {
    el.remove();
    sinon.restore();
  });

  async function open() {
    await el.toggleDetails({ currentTarget: el.shadowRoot.querySelector('.details-trigger') });
    await el.updateComplete;
  }

  it('keeps list actions visible and loads main Browse metadata only on demand', async () => {
    expect(versions.called).to.equal(false);
    expect(status.called).to.equal(false);
    expect(el.shadowRoot.querySelector('.favorite')).not.to.equal(null);
    await open();
    expect(status.calledWith('/org/site/index')).to.equal(true);
    expect(el.shadowRoot.textContent).to.include('alex');
    expect(el.shadowRoot.textContent).to.include('Not published');
    expect(el.shadowRoot.querySelector('.favorite-action')).to.equal(null);
    expect(el.shadowRoot.querySelector('a').rel).to.equal('noopener noreferrer');
  });

  it('emits favorite changes and reflects the saved state', async () => {
    const favorite = sinon.spy();
    el.addEventListener('favoritechange', favorite);
    el.shadowRoot.querySelector('.favorite').click();
    expect(favorite.calledOnce).to.equal(true);
    el.isFavorited = true;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.favorite').getAttribute('aria-pressed')).to.equal('true');
  });

  it('restores focus on keyboard close without stealing outside focus', async () => {
    await open();
    el.shadowRoot.querySelector('a').focus();
    el.popover.dispatchEvent(new Event('close'));
    await el.updateComplete;
    expect(el.shadowRoot.activeElement?.classList.contains('details-trigger')).to.equal(true);
  });

  it('reports failed details, retries, and discards results after a file change', async () => {
    versions.rejects(new Error('Offline'));
    await open();
    expect(el.shadowRoot.querySelector('[role="status"]').textContent).to.include('could not be loaded');
    versions.callsFake(async () => response([]));
    await el.loadDetails();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[role="status"]')).to.equal(null);
    let finish;
    versions.returns(new Promise((resolve) => { finish = resolve; }));
    const loading = el.loadDetails();
    el.path = '/other/site/new.html';
    await el.updateComplete;
    finish(response([]));
    await loading;
    expect(el._status).to.equal(undefined);
  });
});
