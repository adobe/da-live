import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../blocks/permissions/folder-picker/folder-picker.js');

function makeListFolders(tree) {
  return async (org, site, path) => tree[path] ?? [];
}

// Waits for `predicate()` to become true, then always flushes one more
// `updateComplete` — the property can already satisfy the predicate before
// the corresponding render has committed to the DOM.
async function settle(el, predicate, { tries = 50, intervalMs = 10 } = {}) {
  for (let i = 0; i < tries && !predicate(); i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, intervalMs); });
    // eslint-disable-next-line no-await-in-loop
    await el.updateComplete;
  }
  await el.updateComplete;
}

async function mount(props) {
  const el = document.createElement('da-folder-picker');
  Object.assign(el, {
    org: 'myorg',
    site: 'mysite',
    ...props,
  });
  document.body.append(el);
  await el.updateComplete;
  // Initial folder load is async; wait for it to settle.
  await settle(el, () => el._columns.length > 0);
  return el;
}

function columnButtons(el, index) {
  return [...el.shadowRoot.querySelectorAll('.folder-column')][index]
    .querySelectorAll('.folder-item');
}

describe('da-folder-picker', () => {
  afterEach(() => {
    document.querySelectorAll('da-folder-picker').forEach((el) => el.remove());
  });

  it('lists root folders from the injected listFolders', async () => {
    const tree = { '/': [{ name: 'blog', path: '/mysite/blog' }, { name: 'docs', path: '/mysite/docs' }] };
    const el = await mount({ listFolders: makeListFolders(tree) });

    const names = [...columnButtons(el, 0)].map((btn) => btn.textContent.trim());
    expect(names).to.deep.equal(['blog', 'docs']);
  });

  it('clicking "blog" loads a second column via listFolders(org, site, "/blog/")', async () => {
    const calls = [];
    const tree = {
      '/': [{ name: 'blog', path: '/mysite/blog' }, { name: 'docs', path: '/mysite/docs' }],
      '/blog/': [{ name: 'drafts', path: '/mysite/blog/drafts' }],
    };
    const listFolders = async (org, site, path) => {
      calls.push(path);
      return tree[path] ?? [];
    };
    const el = await mount({ listFolders });

    const blogBtn = [...columnButtons(el, 0)].find((btn) => btn.textContent.trim() === 'blog');
    blogBtn.click();
    await settle(el, () => el._columns.length >= 2);

    expect(calls).to.include('/blog/');
    const columns = el.shadowRoot.querySelectorAll('.folder-column');
    expect(columns.length).to.equal(2);
    const names = [...columnButtons(el, 1)].map((btn) => btn.textContent.trim());
    expect(names).to.deep.equal(['drafts']);
  });

  it('clicking a different first-column folder drops deeper columns', async () => {
    const tree = {
      '/': [{ name: 'blog', path: '/mysite/blog' }, { name: 'docs', path: '/mysite/docs' }],
      '/blog/': [{ name: 'drafts', path: '/mysite/blog/drafts' }],
      '/docs/': [],
    };
    const el = await mount({ listFolders: makeListFolders(tree) });

    const blogBtn = [...columnButtons(el, 0)].find((btn) => btn.textContent.trim() === 'blog');
    blogBtn.click();
    await settle(el, () => el._columns.length >= 2);
    expect(el.shadowRoot.querySelectorAll('.folder-column').length).to.equal(2);

    const docsBtn = [...columnButtons(el, 0)].find((btn) => btn.textContent.trim() === 'docs');
    docsBtn.click();
    await settle(el, () => el._columns.length === 1 && !el._loading);

    expect(el.shadowRoot.querySelectorAll('.folder-column').length).to.equal(1);
  });

  it('shows "Selected: blog/drafts" once a leaf is picked', async () => {
    const tree = {
      '/': [{ name: 'blog', path: '/mysite/blog' }],
      '/blog/': [{ name: 'drafts', path: '/mysite/blog/drafts' }],
      '/blog/drafts/': [],
    };
    const el = await mount({ listFolders: makeListFolders(tree) });

    [...columnButtons(el, 0)].find((btn) => btn.textContent.trim() === 'blog').click();
    await settle(el, () => el._columns.length >= 2);

    [...columnButtons(el, 1)].find((btn) => btn.textContent.trim() === 'drafts').click();
    await settle(el, () => el._selected === 'blog/drafts');

    const normalized = el.shadowRoot.textContent.replace(/\s+/g, ' ').trim();
    expect(normalized).to.contain('Selected: blog/drafts');
  });

  it('a folder with no children does not add an empty column', async () => {
    const tree = {
      '/': [{ name: 'blog', path: '/mysite/blog' }],
      '/blog/': [],
    };
    const el = await mount({ listFolders: makeListFolders(tree) });

    [...columnButtons(el, 0)].find((btn) => btn.textContent.trim() === 'blog').click();
    await settle(el, () => el._selected === 'blog' && !el._loading);

    expect(el.shadowRoot.querySelectorAll('.folder-column').length).to.equal(1);
  });

  it('"Add this folder" is disabled until a folder is selected, then emits folder-select', async () => {
    const tree = { '/': [{ name: 'blog', path: '/mysite/blog' }] };
    const el = await mount({ listFolders: makeListFolders(tree) });

    const addBtn = el.shadowRoot.querySelector('.nx-btn-accent');
    expect(addBtn.disabled).to.equal(true);

    let detail = null;
    el.addEventListener('folder-select', (e) => { detail = e.detail; });

    [...columnButtons(el, 0)].find((btn) => btn.textContent.trim() === 'blog').click();
    await settle(el, () => el._selected === 'blog' && !el._loading);

    expect(addBtn.disabled).to.equal(false);
    addBtn.click();
    expect(detail).to.deep.equal({ folder: 'blog' });
  });

  it('"Cancel" emits folder-cancel', async () => {
    const el = await mount({ listFolders: makeListFolders({ '/': [] }) });
    let fired = false;
    el.addEventListener('folder-cancel', () => { fired = true; });
    el.shadowRoot.querySelector('.nx-action-btn').click();
    expect(fired).to.equal(true);
  });
});
