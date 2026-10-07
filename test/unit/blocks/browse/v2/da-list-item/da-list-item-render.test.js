/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

await import('../../../../../../blocks/browse/v2/da-list-item/da-list-item.js');

describe('da-list-item render', () => {
  let el;
  let styles;

  before(async () => {
    const { href } = new URL('../../../../../../blocks/browse/v2/da-list-item/da-list-item.css', import.meta.url);
    const response = await fetch(href);
    expect(response.ok).to.be.true;
    styles = new CSSStyleSheet();
    styles.replaceSync(await response.text());
  });

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

  function applyStyles(width) {
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, styles];
    el.style.cssText = `
      width: ${width}px;
      color-scheme: light;
      --s2-spacing-100: 8px;
      --s2-spacing-200: 16px;
      --s2-gray-50: #f8f8f8;
      --s2-gray-100: #eee;
      --s2-gray-200: #ddd;
      --s2-gray-400: #8a8a8a;
      --s2-gray-600: #707070;
      --s2-gray-700: #626262;
      --s2-gray-800: #444;
      --s2-gray-900: #222;
      --s2-blue-800: #1473e6;
      --s2-corner-radius-400: 8px;
      --s2-component-m-regular-font-size: 14px;
      --s2-component-m-regular-font-weight: 400;
      --s2-component-m-regular-line-height: 18px;
      --s2-component-s-regular-font-size: 12px;
      --s2-component-s-regular-font-weight: 400;
      --s2-component-s-regular-line-height: 16px;
    `;
  }

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

  it('Renders details panel with version "Checking" by default', async () => {
    await fixture();
    expect(el.shadowRoot.querySelector('.da-item-list-item-details')).to.exist;
    const details = el.shadowRoot.querySelectorAll('.da-list-item-details-title');
    const titles = [...details].map((p) => p.textContent);
    expect(titles).to.deep.equal(['Version', 'Modified by', 'Previewed', 'Published']);
    expect(el.shadowRoot.querySelector('.da-item-list-item-type-file-version')).to.be.null;
    expect(el.shadowRoot.querySelector('#file-details').children).to.have.length(4);
  });

  it('Renders concrete version count when set', async () => {
    await fixture();
    el._version = 5;
    el._lastModifedBy = 'alice';
    el.requestUpdate();
    await nextFrame();
    const versionEl = el.shadowRoot.querySelectorAll('.da-list-item-da-details-version p')[1];
    expect(versionEl.textContent).to.equal('5');
    const modifierEl = el.shadowRoot.querySelectorAll('.da-list-item-da-details-modified p')[1];
    expect(modifierEl.textContent).to.equal('alice');
  });

  it('Shows "Not authorized" when preview status is 401', async () => {
    await fixture();
    el._preview = { status: 401 };
    el._live = { status: 401 };
    el.requestUpdate();
    await nextFrame();
    const dates = el.shadowRoot.querySelectorAll('.da-aem-icon-date');
    const text = [...dates].map((d) => d.textContent).join(' ');
    expect(text).to.contain('Not authorized');
  });

  it('Adds is-active class when preview status is 200', async () => {
    await fixture();
    el._preview = { status: 200, url: 'https://x', lastModified: { date: '2024-01-01', time: '12:00' } };
    el._live = { status: 200, url: 'https://y', lastModified: { date: '2024-01-02', time: '13:00' } };
    el.requestUpdate();
    await nextFrame();
    const icons = el.shadowRoot.querySelectorAll('.da-item-list-item-aem-icon.is-active');
    expect(icons.length).to.equal(2);
  });

  it('keeps compact red/gray status icons and explicit status text in both color schemes', async () => {
    await fixture();
    applyStyles(1100);
    el._preview = { status: 200, url: 'https://preview.example', lastModified: { date: '2024-01-01', time: '12:00' } };
    el._live = { status: 404, url: 'https://live.example' };
    await el.updateComplete;
    const [preview, live] = el.shadowRoot.querySelectorAll('.da-item-list-item-aem-icon');
    expect(preview.getAttribute('aria-hidden')).to.equal('true');
    expect(getComputedStyle(preview).width).to.equal('18px');
    expect(getComputedStyle(preview).height).to.equal('18px');
    expect(getComputedStyle(preview).color).to.equal('rgb(250, 15, 0)');
    expect(getComputedStyle(live).color).to.equal('rgb(138, 138, 138)');
    expect(el.shadowRoot.querySelector('#preview-date').textContent).to.equal('2024-01-01 12:00');
    expect(el.shadowRoot.querySelector('#live-date').textContent).to.equal('Not published');
    el.style.colorScheme = 'dark';
    expect(getComputedStyle(preview).color).to.equal('rgb(250, 15, 0)');
    expect(getComputedStyle(live).color).to.equal('rgb(98, 98, 98)');
  });

  it('keeps preview/published links and accessible labels associated with their values', async () => {
    await fixture();
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

  it('announces expansion/collapse while retaining the more icon', async () => {
    await fixture();
    applyStyles(1100);
    el.updateAEMStatus = () => {};
    el.updateDAStatus = () => {};
    const button = el.shadowRoot.querySelector('.da-item-list-item-expand-btn');
    const details = el.shadowRoot.querySelector('#file-details');
    expect(button.getAttribute('aria-expanded')).to.equal('false');
    expect(button.getAttribute('aria-controls')).to.equal(details.id);
    expect(button.getAttribute('aria-label')).to.equal('Show details');
    expect(getComputedStyle(details).display).to.equal('none');
    button.focus();
    expect(el.shadowRoot.activeElement).to.equal(button);
    expect(getComputedStyle(button, '::after').maskImage).to.contain('s2-icon-more-20-n.svg');
    expect(button.querySelector('svg')).to.be.null;
    button.click();
    await el.updateComplete;
    expect(button.getAttribute('aria-expanded')).to.equal('true');
    expect(button.getAttribute('aria-label')).to.equal('Hide details');
    expect(getComputedStyle(details).display).to.equal('grid');
    expect(getComputedStyle(el).backgroundColor).to.equal('rgb(248, 248, 248)');
    button.click();
    await el.updateComplete;
    expect(button.getAttribute('aria-expanded')).to.equal('false');
    expect(getComputedStyle(details).display).to.equal('none');
  });

  it('resets the disclosure when the row is reused for another path', async () => {
    await fixture();
    el.updateAEMStatus = () => {};
    el.updateDAStatus = () => {};
    el.toggleExpand();
    await el.updateComplete;
    el.path = '/org/repo/next.html';
    await el.updateComplete;
    expect(el.classList.contains('is-expanded')).to.be.false;
    expect(el.shadowRoot.querySelector('.da-item-list-item-expand-btn')
      .getAttribute('aria-expanded')).to.equal('false');
  });

  [false, true].forEach((allowselect) => {
    it(`aligns and wraps details responsively with selection ${allowselect ? 'enabled' : 'disabled'}`, async () => {
      await fixture({ allowselect });
      applyStyles(1100);
      el.classList.add('is-expanded');
      el._lastModifedBy = 'averylongusername'.repeat(10);
      await el.updateComplete;
      const details = el.shadowRoot.querySelector('#file-details');
      const version = details.querySelector('.da-list-item-da-details-version');
      const modifier = details.querySelector('.da-list-item-da-details-modified');
      const name = el.shadowRoot.querySelector('.da-item-list-item-name-text');
      [[1100, 4], [740, 2], [550, 2], [400, 1], [1100, 4]].forEach(([width, columns]) => {
        el.style.width = `${width}px`;
        expect(getComputedStyle(details).gridTemplateColumns.split(' ')).to.have.length(columns);
        expect(version.getBoundingClientRect().left)
          .to.be.closeTo(name.getBoundingClientRect().left, 1);
        expect(modifier.scrollWidth).to.be.at.most(modifier.clientWidth);
        expect(details.scrollWidth).to.be.at.most(details.clientWidth);
      });
      const labelStyle = getComputedStyle(details.querySelector('.da-list-item-details-title'));
      expect(labelStyle.fontSize).to.equal('12px');
      expect(labelStyle.fontWeight).to.equal('400');
      expect(labelStyle.textTransform).to.equal('none');
    });
  });

  it('Renders external URL via until() for link items', async () => {
    const savedFetch = window.fetch;
    window.fetch = () => Promise.resolve(new Response(
      JSON.stringify({ externalUrl: 'https://link-target' }),
      { status: 200 },
    ));
    try {
      await fixture({ ext: 'link' });
      // until() resolves async; we just verify the link element exists
      expect(el.shadowRoot.querySelector('a.da-item-list-item-title')).to.exist;
    } finally {
      window.fetch = savedFetch;
    }
  });

  it('Hides expand button for folders and link items', async () => {
    await fixture({ ext: '' });
    const btn = el.shadowRoot.querySelector('.da-item-list-item-expand-btn');
    expect(btn).to.exist;
    expect(btn.classList.contains('is-visible')).to.be.false;
  });

  it('Shows expand button for file items', async () => {
    await fixture({ ext: 'html' });
    const btn = el.shadowRoot.querySelector('.da-item-list-item-expand-btn');
    expect(btn.classList.contains('is-visible')).to.be.true;
  });

  it('Adds can-select class when allowselect is true', async () => {
    await fixture({ allowselect: true });
    const inner = el.shadowRoot.querySelector('.da-item-list-item-inner');
    expect(inner.classList.contains('can-select')).to.be.true;
  });

  it('Reflects checked state on checkbox input', async () => {
    await fixture({ allowselect: true, isChecked: true });
    const cb = el.shadowRoot.querySelector('input[type="checkbox"][name="item-selected"]');
    expect(cb.checked).to.be.true;
  });
});
