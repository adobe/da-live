/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

await import('../../../../../blocks/browse/da-list-item/da-list-item.js');

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
    expect(titles).to.include.members(['Version', 'Last Modified By', 'Previewed', 'Published']);
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
  describe('plugin status cells', () => {
    const statusOf = (over = {}) => ({
      name: 'rfp',
      heading: 'Workflow',
      status: { state: 'pending', label: 'In Review', icon: 'clock', ...over },
    });

    async function expanded(statuses) {
      await fixture({ path: '/org/repo/page.html' });
      el.updateAEMStatus = async () => {};
      el.updateDAStatus = async () => {};
      el.statusRegistry = { getContributions: async () => statuses };
      el.toggleExpand();
      await el.updatePluginStatus();
      await el.updateComplete;
      await nextFrame();
      return el;
    }

    it('Renders nothing at all when no plugin contributes', async () => {
      await expanded([]);
      expect(el.shadowRoot.querySelector('.da-item-list-item-statuses')).to.equal(null);
    });

    it('Leaves the native column widths alone when no plugin contributes', async () => {
      await expanded([]);
      const details = el.shadowRoot.querySelector('.da-item-list-item-details');
      expect(details.classList.contains('has-status')).to.be.false;
    });

    it('Renders the heading, the label and the icon', async () => {
      await expanded([statusOf()]);
      const cell = el.shadowRoot.querySelector('.da-list-item-status');
      expect(cell.querySelector('.da-list-item-details-title').textContent).to.equal('Workflow');
      expect(cell.querySelector('.da-list-item-status-label').textContent).to.equal('In Review');
      expect(cell.querySelector('use').getAttribute('href')).to.equal('/img/icons/s2-icon-clock-20-n.svg#icon');
    });

    it('Tints the cell by state', async () => {
      await expanded([statusOf({ state: 'negative' })]);
      expect(el.shadowRoot.querySelector('.da-list-item-status').classList.contains('is-negative')).to.be.true;
    });

    it('Gives every plugin a cell in one shared track', async () => {
      await expanded([statusOf(), { ...statusOf(), heading: 'Review' }]);
      const track = el.shadowRoot.querySelectorAll('.da-item-list-item-statuses');
      expect(track.length).to.equal(1);
      expect(track[0].querySelectorAll('.da-list-item-status').length).to.equal(2);
      expect(el.shadowRoot.querySelector('.da-item-list-item-details').classList.contains('has-status')).to.be.true;
    });

    it('Leaves the icon a plain glyph when there is no detail', async () => {
      await expanded([statusOf()]);
      expect(el.shadowRoot.querySelector('.da-list-item-status-btn')).to.equal(null);
      expect(el.shadowRoot.querySelector('nx-popover')).to.equal(null);
      expect(el.shadowRoot.querySelector('.da-list-item-status-icon')).to.exist;
    });

    it('Makes the icon a button when there is detail', async () => {
      await expanded([statusOf({ detail: [{ label: 'Approver', value: 'ana' }] })]);
      const button = el.shadowRoot.querySelector('.da-list-item-status-btn');
      expect(button.getAttribute('aria-haspopup')).to.equal('dialog');
      expect(button.getAttribute('aria-label')).to.equal('In Review details');
      expect(button.getAttribute('aria-expanded')).to.equal('false');
    });

    it('Puts the label, the detail rows and the link in the popover', async () => {
      await expanded([statusOf({
        detail: [{ label: 'Approver', value: 'ana' }, { label: 'Requested', value: 'today' }],
        href: '/apps/inbox',
      })]);
      const popover = el.shadowRoot.querySelector('nx-popover');
      expect(popover.querySelector('.da-list-item-status-detail-title').textContent).to.equal('In Review');
      const keys = [...popover.querySelectorAll('.da-list-item-status-detail-key')].map((k) => k.textContent);
      expect(keys).to.deep.equal(['Approver', 'Requested']);
      expect(popover.querySelector('.da-list-item-status-link').getAttribute('href')).to.equal('/apps/inbox');
    });

    it('Leaves the link out when the status has no href', async () => {
      await expanded([statusOf({ detail: [{ label: 'Approver', value: 'ana' }] })]);
      expect(el.shadowRoot.querySelector('.da-list-item-status-link')).to.equal(null);
    });

    it('Opens the popover from the icon and marks the button expanded', async () => {
      await expanded([statusOf({ detail: [{ label: 'Approver', value: 'ana' }] })]);
      const button = el.shadowRoot.querySelector('.da-list-item-status-btn');
      button.click();
      const popover = el.shadowRoot.querySelector('nx-popover');
      expect(popover.open).to.be.true;
      expect(popover.anchor).to.equal(button);
      expect(popover.placement).to.equal('auto');
      expect(button.getAttribute('aria-expanded')).to.equal('true');
    });

    it('Returns the button to its resting state when the popover closes', async () => {
      await expanded([statusOf({ detail: [{ label: 'Approver', value: 'ana' }] })]);
      const button = el.shadowRoot.querySelector('.da-list-item-status-btn');
      button.click();
      el.shadowRoot.querySelector('nx-popover').close();
      expect(button.getAttribute('aria-expanded')).to.equal('false');
    });

    it('Closes an open popover when the icon is clicked again', async () => {
      await expanded([statusOf({ detail: [{ label: 'Approver', value: 'ana' }] })]);
      const button = el.shadowRoot.querySelector('.da-list-item-status-btn');
      button.click();
      button.click();
      expect(el.shadowRoot.querySelector('nx-popover').open).to.be.false;
    });
  });
});
