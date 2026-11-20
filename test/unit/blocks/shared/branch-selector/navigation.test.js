import { expect } from '@esm-bundle/chai';
import { retirePublishedBranch, flushForBranchAction, switchContentBranch } from '../../../../../blocks/shared/branch-selector/navigation.js';

describe('branch navigation barrier', () => {
  it('checks the Default binding, switches away before deleting, and reloads after success', async () => {
    const calls = [];
    const location = {
      hash: '#/org/site~work/branch-only',
      pathname: '/edit',
      search: '?da-admin=local',
      reload: () => calls.push('reload'),
    };
    const history = {
      state: null,
      replaceState: (state, title, url) => {
        calls.push(url);
        const { hash, pathname, search } = new URL(url, 'https://da.live');
        Object.assign(location, { hash, pathname, search });
      },
    };
    const remove = async () => {
      expect(location.hash).to.equal('#/org/site');
      calls.push('delete');
    };
    const options = { location, history, defaultMatches: async () => true };
    try {
      await retirePublishedBranch('work', remove, { ...options, defaultMatches: async () => false });
      throw new Error('Expected binding check to fail');
    } catch (error) {
      expect(error.message).to.include('not bound');
    }
    expect(calls).to.deep.equal([]);
    try {
      await retirePublishedBranch('work', async () => { throw new Error('Revision changed'); }, options);
      throw new Error('Expected deletion to fail');
    } catch (error) {
      expect(error.message).to.equal('Revision changed');
    }
    expect(location.hash).to.equal('#/org/site~work/branch-only');
    expect(calls).not.to.include('reload');
    calls.length = 0;
    await retirePublishedBranch('work', remove, options);
    expect(calls).to.deep.equal(['/?da-admin=local#/org/site', 'delete', 'reload']);
  });

  it('requires a positive flush before navigating and keeps the editor inert', async () => {
    const editor = { localName: 'da-content', inert: false, forceSave: async () => ({ ok: false }) };
    const root = { querySelector: (name) => (name === 'da-content' ? editor : null) };
    const location = { hash: '#/org/site/page', pathname: '/edit', search: '?x=1' };
    const urls = [];
    const options = { root, location, navigate: (url) => urls.push(url), validate: async () => {} };
    try {
      await switchContentBranch('work', options);
      throw new Error('Expected flush failure');
    } catch (error) {
      expect(error.message).to.include('not confirmed');
    }
    expect(editor.inert).to.equal(false);
    expect(urls).to.have.length(0);
    editor.forceSave = async () => {
      expect(editor.inert).to.equal(true);
      return { ok: true };
    };
    await switchContentBranch('work', options);
    expect(urls).to.deep.equal(['/edit?x=1#/org/site~work/page']);
  });

  it('fails closed when a mounted editor cannot flush', async () => {
    const root = { querySelector: () => ({ localName: 'da-content' }) };
    expect((await flushForBranchAction(root)).ok).to.equal(false);
  });

  it('does not navigate to Default on a different Source binding', async () => {
    const location = { hash: '#/org/site~work/page', pathname: '/edit', search: '' };
    const root = { querySelector: () => null };
    let navigated = false;
    try {
      await switchContentBranch(null, {
        location,
        root,
        defaultMatches: async () => false,
        navigate: () => { navigated = true; },
      });
      throw new Error('Expected binding failure');
    } catch (error) {
      expect(error.message).to.include('not bound');
    }
    expect(navigated).to.equal(false);
  });

  it('commits selector navigation with pushState before reloading, preserving the query', async () => {
    const calls = [];
    const location = {
      hash: '#/org/site~work/page',
      pathname: '/edit',
      search: '?da-admin=local&nx=local',
      reload: () => calls.push('reload'),
    };
    Object.defineProperty(location, 'href', { set: () => { throw new Error('hash navigation must not occur'); } });
    const history = { state: { marker: 1 }, pushState: (...args) => calls.push(args) };
    const root = { querySelector: () => null };
    await switchContentBranch(null, { location, history, root, defaultMatches: async () => true });
    expect(calls).to.deep.equal([
      [{ marker: 1 }, '', '/edit?da-admin=local&nx=local#/org/site/page'],
      'reload',
    ]);
  });

  it('does not navigate if the location changes during flush', async () => {
    const location = { hash: '#/org/site/page', pathname: '/edit', search: '' };
    const root = { querySelector: () => null };
    let navigated = false;
    try {
      await switchContentBranch('work', {
        location,
        root,
        validate: async () => {},
        flush: async () => { location.hash = '#/org/other/page'; return { ok: true }; },
        navigate: () => { navigated = true; },
      });
      throw new Error('Expected changed context');
    } catch (error) {
      expect(error.message).to.include('location changed');
    }
    expect(navigated).to.equal(false);
  });
});
