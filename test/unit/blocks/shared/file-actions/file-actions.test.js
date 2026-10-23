import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../../setup-nx.js';
import '../../../../../blocks/shared/file-actions/file-actions.js';
import { getNx2Api } from '../../../../../scripts/utils.js';

const api = await getNx2Api();
const response = (data) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

describe('shared file actions', () => {
  let el;
  let versions;
  let status;

  beforeEach(async () => {
    sinon.stub(window, 'fetch').callsFake(async () => new Response(null, { status: 404 }));
    versions = sinon.stub(api.versions, 'list').callsFake(async () => response([{ url: '/versionsource/test', timestamp: 1, users: [{ email: 'alex@example.test' }] }]));
    status = sinon.stub(api.status, 'get').callsFake(async () => response({
      preview: { status: 200, url: 'https://example.test/preview', lastModified: '2026-10-20T10:00:00Z' },
      live: { status: 404 },
    }));
    el = document.createElement('da-file-actions');
    el.path = '/org/site/index.html';
    el.ext = 'html';
    el.name = 'Welcome';
    el.view = 'card';
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

  it('does not load metadata until the always-available trigger is activated', () => {
    expect(versions.called).to.equal(false);
    expect(status.called).to.equal(false);
    const trigger = el.shadowRoot.querySelector('.details-trigger');
    expect(trigger.getAttribute('aria-label')).to.equal('More options for Welcome');
    expect(trigger.getAttribute('aria-expanded')).to.equal('false');
    expect(el.shadowRoot.querySelector('.favorite')).to.equal(null);
  });

  it('loads shared Browse metadata and shows the favorite action in card details', async () => {
    await open();
    expect(status.calledWith('/org/site/index')).to.equal(true);
    expect(el.shadowRoot.querySelector('nx-popover').getAttribute('aria-label')).to.equal('Details for Welcome');
    expect(el.shadowRoot.textContent).to.include('alex');
    expect(el.shadowRoot.textContent).to.include('Not published');
    expect(el.shadowRoot.querySelector('.favorite-action').textContent).to.include('Mark as Favorite');
    expect(el.shadowRoot.querySelector('a').rel).to.equal('noopener noreferrer');
  });

  it('emits a favorite request, closes the card menu and returns focus', async () => {
    await open();
    const favorite = sinon.spy();
    el.addEventListener('favoritechange', favorite);
    el.shadowRoot.querySelector('.favorite-action').click();
    await el.updateComplete;
    expect(favorite.calledOnce).to.equal(true);
    expect(el.shadowRoot.querySelector('nx-popover')).to.equal(null);
    expect(el.shadowRoot.activeElement).to.equal(el.shadowRoot.querySelector('.details-trigger'));
  });

  it('shows Remove as Favorite for a marked card', async () => {
    el.isFavorited = true;
    await open();
    expect(el.shadowRoot.querySelector('.favorite-action').textContent).to.include('Remove as Favorite');
  });

  it('offers folder favorites without requesting unsupported file details', async () => {
    el.ext = undefined;
    await open();
    expect(versions.called).to.equal(false);
    expect(status.called).to.equal(false);
    expect(el.shadowRoot.querySelector('section')).to.equal(null);
    expect(el.shadowRoot.querySelector('.favorite-action')).to.exist;
  });

  it('keeps list info and toggle controls visible and excludes favorite from its details', async () => {
    el.view = 'list';
    await el.updateComplete;
    const toggle = el.shadowRoot.querySelector('.favorite');
    expect(toggle.getAttribute('aria-pressed')).to.equal('false');
    expect(toggle.getAttribute('aria-label')).to.equal('Mark as Favorite: Welcome');
    el.isFavorited = true;
    await el.updateComplete;
    expect(toggle.getAttribute('aria-pressed')).to.equal('true');
    await open();
    expect(el.shadowRoot.querySelector('.favorite-action')).to.equal(null);
  });

  it('surfaces metadata failures with a retry instead of loading forever', async () => {
    versions.rejects(new Error('Offline'));
    await open();
    expect(el.shadowRoot.querySelector('[role="status"]').textContent).to.include('could not be loaded');
    expect(el.shadowRoot.textContent).to.include('Unavailable');
    expect(el.shadowRoot.textContent).not.to.include('Loading...');
    versions.callsFake(async () => response([]));
    await el.loadDetails();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[role="status"]')).to.equal(null);
  });

  it('ignores pending results after changing the file', async () => {
    let finish;
    versions.returns(new Promise((resolve) => { finish = resolve; }));
    const loading = el.loadDetails();
    el.path = '/org/other/new.html';
    await el.updateComplete;
    finish(response([]));
    await loading;
    expect(el._status).to.equal(undefined);
    expect(el._aem).to.equal(undefined);
  });

  it('discards pending metadata when disconnected', async () => {
    let finish;
    versions.returns(new Promise((resolve) => { finish = resolve; }));
    const loading = el.loadDetails();
    el.remove();
    finish(response([]));
    await loading;
    expect(el._status).to.equal(undefined);
    expect(el._aem).to.equal(undefined);
  });
});
