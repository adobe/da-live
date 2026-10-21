import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderCommentMenu } from '../../../../../../blocks/canvas/comments/helpers/templates.js';

function menuItemIds(panel, { isRoot = true, canEdit = true, isResolved = false } = {}) {
  const host = document.createElement('div');
  render(
    renderCommentMenu(panel, { id: 'c1' }, 't1', isRoot, canEdit, isResolved),
    host,
  );
  const menu = host.querySelector('nx-menu');
  return (menu?.items ?? []).map((i) => i.id).filter(Boolean);
}

describe('comments helpers/templates renderCommentMenu', () => {
  it('offers "Add to chat" on an active root thread', () => {
    expect(menuItemIds({ currentUser: { id: 'u' } })).to.include('chat');
  });

  it('hides "Add to chat" on a resolved thread but keeps share', () => {
    const ids = menuItemIds({ currentUser: { id: 'u' } }, { isResolved: true });
    expect(ids).to.not.include('chat');
    expect(ids).to.include('link');
    expect(ids).to.include('reopen');
  });

  it('hides "Add to chat" when the site has ew.disableChat set', () => {
    const ids = menuItemIds({ currentUser: { id: 'u' }, chatDisabled: true });
    expect(ids).to.not.include('chat');
    expect(ids).to.include('link');
  });

  it('never offers "Add to chat" on a reply', () => {
    expect(menuItemIds({ currentUser: { id: 'u' } }, { isRoot: false })).to.not.include('chat');
  });
});
