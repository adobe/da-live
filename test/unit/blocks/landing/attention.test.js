import { expect } from '@esm-bundle/chai';
import '../../setup-nx.js';
import { itemsForScope, actionLabel } from '../../../../blocks/landing/attention.js';

const item = (id, org, site, extra = {}) => ({
  id: `${org}/${site}/comment:${id}`,
  type: 'comment-mention',
  org,
  site,
  path: `/drafts/${id}`,
  title: id,
  description: `about ${id}`,
  link: `#${id}`,
  actor: { email: 'pat@example.com', name: 'Pat Lee' },
  updatedAt: Date.now(),
  read: false,
  ...extra,
});

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const loaded = (el) => new Promise((resolve) => {
  const check = () => (el._items === undefined ? setTimeout(check, 10) : resolve());
  check();
});

describe('landing attention', () => {
  let originalFetch;
  let calls;
  let el;

  const mount = async (handler) => {
    window.fetch = (url, opts) => {
      const body = opts?.body ? JSON.parse(opts.body) : null;
      calls.push({ url: url.toString(), method: opts?.method, body });
      return Promise.resolve(handler(url, opts));
    };
    el = document.createElement('da-landing-attention');
    el.scope = 'acme/web';
    document.body.append(el);
    await loaded(el);
    await el.updateComplete;
  };

  beforeEach(() => {
    originalFetch = window.fetch;
    calls = [];
  });

  afterEach(() => {
    window.fetch = originalFetch;
    el?.remove();
  });

  it('describes known types and filters to the selected site', () => {
    expect(actionLabel({ type: 'comment-mention' })).to.equal('mentioned you on');
    expect(actionLabel({ type: 'comment-reply' })).to.equal('replied on');
    expect(actionLabel({ type: 'publish-request' })).to.equal('updated');
    expect(actionLabel({ type: 'publish-request', action: 'requested publish of' })).to.equal('requested publish of');
    const items = [item('a', 'acme', 'web'), item('b', 'acme', 'other')];
    expect(itemsForScope(items, 'acme/web').map((i) => i.title)).to.deep.equal(['a']);
    expect(itemsForScope(items, '')).to.have.length(2);
  });

  it('shows the site\'s items with an unread count', async () => {
    await mount(() => json({ notifications: [item('a', 'acme', 'web'), item('b', 'acme', 'web', { read: true }), item('c', 'acme', 'other')] }));
    const rows = el.shadowRoot.querySelectorAll('.item');
    expect(rows).to.have.length(2);
    expect(el.shadowRoot.querySelector('.count').textContent).to.equal('1 new');
    expect(rows[0].classList.contains('unread')).to.equal(true);
    const summary = rows[0].querySelector('.summary').textContent.replace(/\s+/g, ' ').trim();
    expect(summary).to.equal('Unread: Pat Lee mentioned you on a');
    expect(rows[0].querySelector('.excerpt').textContent).to.equal('about a');
    const link = rows[0].querySelector('.item-link');
    expect(link.target).to.equal('_blank');
    expect(link.rel).to.equal('noopener');
  });

  it('marks an item read when opened and hides it when dismissed', async () => {
    await mount(() => json({ notifications: [item('a', 'acme', 'web'), item('b', 'acme', 'web')] }));
    const first = el.shadowRoot.querySelector('.item-link');
    first.addEventListener('click', (e) => e.preventDefault(), { once: true });
    first.click();
    await el.updateComplete;
    const dismiss = el.shadowRoot.querySelectorAll('.item button')[1];
    expect(dismiss.getAttribute('aria-label')).to.equal('Dismiss b');
    dismiss.click();
    await el.updateComplete;

    expect(calls.slice(1).map((c) => [c.method, c.body])).to.deep.equal([
      ['POST', { read: ['acme/web/comment:a'] }],
      ['POST', { done: ['acme/web/comment:b'] }],
    ]);
    const rows = el.shadowRoot.querySelectorAll('.item');
    expect(rows).to.have.length(1);
    expect(rows[0].classList.contains('unread')).to.equal(false);
  });

  it('shows producer actions that open in a new tab and mark the item read', async () => {
    const preview = { label: 'Preview', link: 'https://main--web--acme.aem.page/a' };
    await mount(() => json({ notifications: [item('a', 'acme', 'web', { actions: [preview] })] }));
    const action = el.shadowRoot.querySelector('.item-actions a');
    expect(action.textContent).to.equal('Preview');
    expect(action.href).to.equal(preview.link);
    expect(action.target).to.equal('_blank');
    action.addEventListener('click', (e) => e.preventDefault(), { once: true });
    action.click();
    await el.updateComplete;
    expect(calls.slice(1).map((c) => c.body)).to.deep.equal([{ read: ['acme/web/comment:a'] }]);
  });

  it('shows an empty state when nothing needs attention', async () => {
    await mount(() => json({ notifications: [] }));
    expect(el.shadowRoot.querySelector('.empty').textContent).to.include('You\'re all caught up');
  });

  it('shows the section while loading', async () => {
    window.fetch = () => new Promise(() => {});
    el = document.createElement('da-landing-attention');
    document.body.append(el);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('h2').textContent).to.equal('Inbox');
    expect(el.shadowRoot.querySelector('.empty').textContent).to.equal('Loading…');
  });

  it('keeps its place with an error when notifications are unavailable', async () => {
    await mount(() => new Response('', { status: 501 }));
    expect(el.shadowRoot.querySelector('h2').textContent).to.equal('Inbox');
    expect(el.shadowRoot.querySelector('.empty').textContent).to.include('couldn\'t load');
  });
});
