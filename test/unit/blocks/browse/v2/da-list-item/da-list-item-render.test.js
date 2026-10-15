/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

await import('../../../../../../blocks/browse/v2/da-list-item/da-list-item.js');

describe('da-list-item render', () => {
  let el;

  async function fixture(props = {}) {
    el = document.createElement('da-list-item');
    Object.assign(el, {
      idx: 0,
      name: 'page',
      path: '/org/repo/page',
      ext: 'html',
      editor: '/edit#',
      allowselect: false,
      ...props,
    });
    document.body.appendChild(el);
    await nextFrame();
    await nextFrame();
    return el;
  }

  afterEach(() => {
    if (el && el.parentElement) el.remove();
    el = null;
  });

  it('Renders a file item with edit link path and date placeholder', async () => {
    await fixture({ date: 1704067200000, path: '/org/repo/page.html' });
    const link = el.shadowRoot.querySelector('a.da-item-list-item-title');
    expect(link).to.exist;
    expect(link.getAttribute('href')).to.contain('/edit#/org/repo/page');
    expect(el.shadowRoot.querySelector('.da-item-list-item-name-text').textContent).to.equal('page');
  });

  it('Renders table-style cells for name, type, and modified metadata', async () => {
    await fixture({ date: 1704067200000, path: '/org/repo/page.html', ext: 'html' });
    const row = el.shadowRoot.querySelector('.da-item-list-item-inner');
    expect(row).to.exist;
    expect(row.querySelector('[data-column="name"]')).to.exist;
    expect(row.querySelector('[data-column="type"]').textContent.trim()).to.equal('Page');
    expect(row.querySelector('[data-column="modified"]').textContent).to.contain('2024');
    expect(row.querySelector('[data-column="actions"]')).to.exist;
  });

  it('Renders a folder item with hash href when ext is empty', async () => {
    await fixture({ ext: '' });
    const link = el.shadowRoot.querySelector('a.da-item-list-item-title');
    expect(link.getAttribute('href')).to.equal('#/org/repo/page');
    expect(el.shadowRoot.querySelector('span.da-item-list-item-type svg')).to.exist;
  });

  it('Renders rename form when rename property is true', async () => {
    await fixture({ rename: true });
    const form = el.shadowRoot.querySelector('form.da-item-list-item-rename');
    expect(form).to.exist;
    const input = form.querySelector('input[name="new-name"]');
    expect(input).to.exist;
    expect(input.value).to.equal('page');
  });

  it('Renders confirm and cancel buttons inside the rename form', async () => {
    await fixture({ rename: true });
    const buttons = el.shadowRoot.querySelectorAll('form.da-item-list-item-rename button');
    expect(buttons.length).to.equal(2);
    expect(buttons[0].getAttribute('value')).to.equal('confirm');
    expect(buttons[1].getAttribute('value')).to.equal('cancel');
  });

  it('Renders rename icon while _isRenaming is true', async () => {
    await fixture({ _isRenaming: true });
    el._isRenaming = true;
    el.requestUpdate();
    await nextFrame();
    expect(el.shadowRoot.querySelector('.rename-icon')).to.exist;
  });

  it('Renders the checkbox when allowselect is true', async () => {
    await fixture({ allowselect: true });
    const cb = el.shadowRoot.querySelector('input[type="checkbox"][name="item-selected"]');
    expect(cb).to.exist;
    expect(cb.id).to.equal('item-selected-0');
  });

  it('Adds the file icon class for the configured ext', async () => {
    await fixture({ ext: 'json' });
    const use = el.shadowRoot.querySelector('span.da-item-list-item-type svg use');
    expect(use.getAttribute('href')).to.contain('s2-icon-data-20-n.svg');
  });

  async function openDetails() {
    el.updateAEMStatus = () => { };
    el.updateDAStatus = () => { };
    el.shadowRoot.querySelector('.da-item-list-item-expand-btn').click();
    await el.updateComplete;
    await el.updateComplete;
  }

  it('Renders details only while the popover is open', async () => {
    await fixture();
    expect(el.shadowRoot.querySelector('.da-item-details')).to.be.null;
    await openDetails();
    expect(el.shadowRoot.querySelector('.da-item-details')).to.exist;
  });

  it('Renders details panel with version "Checking" by default', async () => {
    await fixture();
    await openDetails();
    const details = el.shadowRoot.querySelectorAll('.da-list-item-details-title');
    const titles = [...details].map((p) => p.textContent);
    expect(titles).to.deep.equal(['Version', 'Modified by', 'Previewed', 'Published']);
    expect(el.shadowRoot.querySelector('.da-item-list-item-type-file-version')).to.be.null;
    expect(el.shadowRoot.querySelector('.da-item-details').children).to.have.length(4);
  });

  it('Renders concrete version count when set', async () => {
    await fixture();
    await openDetails();
    el._version = 5;
    el._lastModifiedBy = 'alice';
    el.requestUpdate();
    await nextFrame();
    const versionEl = el.shadowRoot.querySelectorAll('.da-list-item-da-details-version p')[1];
    expect(versionEl.textContent).to.equal('5');
    const modifierEl = el.shadowRoot.querySelectorAll('.da-list-item-da-details-modified p')[1];
    expect(modifierEl.textContent).to.equal('alice');
  });

  it('Shows "Not authorized" when preview status is 401', async () => {
    await fixture();
    await openDetails();
    el._preview = { status: 401 };
    el._live = { status: 401 };
    el.requestUpdate();
    await nextFrame();
    const dates = el.shadowRoot.querySelectorAll('.da-aem-icon-date');
    const text = [...dates].map((d) => d.textContent).join(' ');
    expect(text).to.contain('Not authorized');
  });

  it('Shows status text without redundant status icons', async () => {
    await fixture();
    await openDetails();
    el._preview = { status: 200, url: 'https://x', lastModified: { date: '2024-01-01', time: '12:00' } };
    el._live = { status: 200, url: 'https://y', lastModified: { date: '2024-01-02', time: '13:00' } };
    el.requestUpdate();
    await nextFrame();
    expect(el.shadowRoot.querySelectorAll('.da-item-list-item-aem-icon')).to.have.length(0);
    expect(el.shadowRoot.querySelector('#preview-date').textContent).to.equal('2024-01-01 12:00');
    expect(el.shadowRoot.querySelector('#live-date').textContent).to.equal('2024-01-02 13:00');
  });

  it('keeps preview/published links and accessible labels associated with their values', async () => {
    await fixture();
    await openDetails();
    el._preview = { status: 200, url: 'https://preview.example', redirect: 'https://redirect.example' };
    el._live = { status: 200, url: 'https://live.example' };
    await el.updateComplete;
    const [preview, live] = el.shadowRoot.querySelectorAll('.da-item-list-item-aem-btn');
    expect(preview.href).to.equal('https://redirect.example/');
    expect(live.href).to.equal('https://live.example/');
    expect(preview.target).to.equal('_blank');
    expect(live.target).to.equal('_blank');
    expect(preview.getAttribute('aria-labelledby')).to.equal('preview-label preview-date');
    expect(live.getAttribute('aria-labelledby')).to.equal('live-label live-date');
    expect(el.shadowRoot.querySelector('#preview-label').textContent).to.equal('Previewed redirect');
    expect(el.shadowRoot.querySelector('#live-label').textContent).to.equal('Published');
  });

  it('toggles the details popover from the more button', async () => {
    await fixture();
    el.updateAEMStatus = () => { };
    el.updateDAStatus = () => { };
    const button = el.shadowRoot.querySelector('.da-item-list-item-expand-btn');
    expect(button.getAttribute('aria-expanded')).to.equal('false');
    expect(button.getAttribute('aria-haspopup')).to.equal('dialog');
    expect(button.querySelector('use').getAttribute('href')).to.contain('s2-icon-more-20-n.svg#icon');
    button.click();
    await el.updateComplete;
    await el.updateComplete;
    const popover = el.shadowRoot.querySelector('nx-popover');
    expect(button.getAttribute('aria-expanded')).to.equal('true');
    expect(button.getAttribute('aria-label')).to.equal('Hide details');
    expect(button.classList.contains('is-active')).to.be.true;
    expect(button.querySelector('use').getAttribute('href')).to.contain('s2-icon-chevronup-20-n.svg#icon');
    expect(popover.open).to.be.true;
    button.click();
    await el.updateComplete;
    expect(button.getAttribute('aria-expanded')).to.equal('false');
    expect(button.getAttribute('aria-label')).to.equal('Show details');
    expect(button.classList.contains('is-active')).to.be.false;
    expect(button.querySelector('use').getAttribute('href')).to.contain('s2-icon-more-20-n.svg#icon');
    expect(el.shadowRoot.querySelector('nx-popover')).to.be.null;
  });

  it('closes the details when the row is reused for another path', async () => {
    await fixture();
    await openDetails();
    el.path = '/org/repo/next.html';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('nx-popover')).to.be.null;
    expect(el.shadowRoot.querySelector('.da-item-list-item-expand-btn')
      .getAttribute('aria-expanded')).to.equal('false');
  });

  it('leaves preview and published links inert until their status loads', async () => {
    await fixture();
    await openDetails();
    const links = el.shadowRoot.querySelectorAll('.da-item-list-item-aem-btn');
    links.forEach((link) => expect(link.hasAttribute('href')).to.be.false);
  });

  it('Hides the details button for folders and link items', async () => {
    await fixture({ ext: '' });
    expect(el.shadowRoot.querySelector('.da-item-list-item-expand-btn')).to.be.null;
  });

  it('Hides the details button for link items', async () => {
    const savedFetch = window.fetch;
    window.fetch = () => Promise.resolve(new Response(
      JSON.stringify({ externalUrl: 'https://link-target' }),
      { status: 200 },
    ));
    try {
      await fixture({ ext: 'link' });
      expect(el.shadowRoot.querySelector('.da-item-list-item-expand-btn')).to.be.null;
    } finally {
      window.fetch = savedFetch;
    }
  });

  it('Shows the details button for file items', async () => {
    await fixture({ ext: 'html' });
    expect(el.shadowRoot.querySelector('.da-item-list-item-expand-btn')).to.exist;
  });

  it('Opens the same details popover from the card heading', async () => {
    await fixture({ view: 'card', ext: 'json' });
    el.updateAEMStatus = () => { };
    el.updateDAStatus = () => { };
    const button = el.shadowRoot.querySelector('.card-heading .da-item-list-item-expand-btn');
    expect(button).to.exist;
    button.click();
    await el.updateComplete;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.card nx-popover.da-item-details')).to.exist;
  });

  it('Reflects checked state on checkbox input', async () => {
    await fixture({ allowselect: true, isChecked: true });
    const cb = el.shadowRoot.querySelector('input[type="checkbox"][name="item-selected"]');
    expect(cb.checked).to.be.true;
  });

  it('Renders card title and metadata below the preview with details on the right', async () => {
    await fixture({
      view: 'card',
      allowselect: true,
      name: 'brand.xlsx',
      ext: 'json',
      date: new Date('2024-01-01T12:00:00Z').getTime(),
    });
    const preview = el.shadowRoot.querySelector('.card-preview');
    expect(preview.querySelector('da-card-preview').ext).to.equal('json');
    const select = preview.querySelector('.card-select');
    expect(select.querySelector('input[type="checkbox"]')).to.exist;
    expect(el.shadowRoot.querySelector('.card-name-text').textContent).to.equal('brand.xlsx');
    expect(el.shadowRoot.querySelector('.card-date').textContent).to.equal(el.renderDate());
    expect(el.shadowRoot.querySelector('.card-type').textContent).not.to.be.empty;
    expect(el.shadowRoot.querySelector('.card-heading .da-item-list-item-expand-btn')).to.exist;
    expect(preview.querySelector('.da-item-list-item-expand-btn')).to.be.null;
    expect(el.shadowRoot.querySelector('.da-item-list-item-inner')).to.be.null;
  });

  it('Renders a card preview and passes the renaming state to it', async () => {
    await fixture({ view: 'card', ext: 'png', path: '/org/site/a.png' });
    const preview = el.shadowRoot.querySelector('.card-preview da-card-preview');
    expect(preview.path).to.equal('/org/site/a.png');
    expect(preview.ext).to.equal('png');
    expect(preview.busy).to.not.be.ok;
    el._isRenaming = true;
    await el.updateComplete;
    expect(preview.busy).to.be.true;
  });

  it('Renders the rename form in card view', async () => {
    await fixture({ view: 'card', rename: true });
    expect(el.shadowRoot.querySelector('.card form.da-item-list-item-rename')).to.exist;
  });

  it('Shows the favorite badge on cards only when favorited', async () => {
    await fixture({ view: 'card' });
    expect(el.shadowRoot.querySelector('.card-favorite')).to.not.exist;
    el.isFavorited = true;
    await el.updateComplete;
    const badge = el.shadowRoot.querySelector('.card-preview .card-favorite');
    expect(badge.getAttribute('aria-label')).to.equal('Favorited');
  });
});
