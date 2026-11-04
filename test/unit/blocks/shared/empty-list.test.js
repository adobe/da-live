import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { renderEmptyList, EMPTY_LIST_CSS } from '../../../../blocks/shared/empty-list.js';
import { NOT_PERMITTED_HINT } from '../../../../blocks/shared/utils.js';

describe('renderEmptyList', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => container.remove());

  it('renders only the message for a regular empty state', () => {
    render(renderEmptyList('Empty'), container);
    const box = container.querySelector('.empty-list');
    expect(box).to.exist;
    expect(box.querySelector('h3').textContent).to.equal('Empty');
    expect(box.querySelector('.empty-list-hint')).to.not.exist;
    expect(box.querySelector('.empty-list-action')).to.not.exist;
  });

  it('adds the hint and Open Profile button for Not permitted', () => {
    render(renderEmptyList('Not permitted'), container);
    const box = container.querySelector('.empty-list');
    expect(box.querySelector('h3').textContent).to.equal('Not permitted');
    const hint = box.querySelector('p.empty-list-hint');
    expect(hint.textContent.trim()).to.equal(NOT_PERMITTED_HINT);
    const action = box.querySelector('button.empty-list-action');
    expect(action.type).to.equal('button');
    expect(action.classList.contains('nx-btn-primary')).to.be.true;
    expect(action.textContent.trim()).to.equal('Open Profile');
  });

  it('opens the profile menu when Open Profile is clicked', () => {
    const nav = document.createElement('nx-nav');
    const profile = document.createElement('nx-profile');
    const menu = document.createElement('div');
    menu.setAttribute('popover', '');
    profile.attachShadow({ mode: 'open' }).append(menu);
    nav.attachShadow({ mode: 'open' }).append(profile);
    document.body.append(nav);
    try {
      render(renderEmptyList('Not permitted'), container);
      container.querySelector('.empty-list-action').click();
      expect(menu.matches(':popover-open')).to.be.true;
      menu.hidePopover();
    } finally {
      nav.remove();
    }
  });

  it('exposes the shared stylesheet URL', () => {
    expect(EMPTY_LIST_CSS).to.match(/\/blocks\/shared\/styles\/empty-list\.css$/);
  });
});
