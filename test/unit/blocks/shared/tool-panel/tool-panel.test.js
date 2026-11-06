/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { TOOL_PANEL_PINNED_VIEWS_KEY } from '../../../../../blocks/canvas/utils/panel.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

before(async () => {
  await import('../../../../../blocks/shared/tool-panel/tool-panel.js');
});

// The element is used detached (never appended), so Lit never runs an update
// cycle — we call the changed methods directly. The 'modal' branch of showPanel
// returns before touching the shadow root, so this stays safe without rendering.
function createPanel(views) {
  const el = document.createElement('da-tool-panel');
  el.views = views;
  return el;
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

const nextTask = () => new Promise((resolve) => { setTimeout(resolve); });

describe('DaToolPanel — modal experience', () => {
  describe('_pickerItemsFromViews', () => {
    ['modal', 'fullsize-dialog'].forEach((experience) => {
      it(`marks a ${experience} view as a dialog action with the fullscreen icon`, () => {
        const el = createPanel([
          { id: 'blocks', label: 'Blocks', section: 'Library', experience },
        ]);
        const item = el._pickerItemsFromViews().find((i) => i.value === 'blocks');
        expect(item.action).to.be.true;
        expect(item.trailingIcon).to.equal('/img/icons/s2-icon-fullscreen-20-n.svg');
        expect(item.ariaLabel).to.equal('Blocks (opens in dialog)');
      });
    });

    it('keeps the external-link icon for views that open in a new tab', () => {
      const el = createPanel([
        { id: 'external', label: 'External', section: 'Extensions', experience: 'window' },
      ]);
      const item = el._pickerItemsFromViews().find((i) => i.value === 'external');
      expect(item.action).to.be.true;
      expect(item.trailingIcon).to.equal('/img/icons/s2-icon-openin-20-n.svg');
      expect(item.ariaLabel).to.equal('External (opens in new tab)');
    });

    it('leaves a plain inline view as a non-action item', () => {
      const el = createPanel([
        { id: 'files', label: 'Files', section: 'Editor', experience: 'inline' },
      ]);
      const item = el._pickerItemsFromViews().find((i) => i.value === 'files');
      expect(item.action).to.be.undefined;
      expect(item.trailingIcon).to.be.undefined;
    });
  });

  describe('showPanel', () => {
    it('invokes openModal and does not activate the view for a modal experience', async () => {
      let opened = 0;
      const openModal = async () => { opened += 1; };
      const el = createPanel([{ id: 'blocks', label: 'Blocks', experience: 'modal', openModal }]);
      await el.showPanel('blocks');
      expect(opened).to.equal(1);
      expect(el.activeId).to.be.undefined;
    });

    it('does not throw when a modal view has no openModal handler', async () => {
      const el = createPanel([{ id: 'blocks', label: 'Blocks', experience: 'modal' }]);
      let threw = false;
      try {
        await el.showPanel('blocks');
      } catch {
        threw = true;
      }
      expect(threw).to.be.false;
      expect(el.activeId).to.be.undefined;
    });
  });
});

describe('DaToolPanel selected panels', () => {
  let el;
  let savedPins;
  let loads;
  let views;

  beforeEach(async () => {
    savedPins = sessionStorage.getItem(TOOL_PANEL_PINNED_VIEWS_KEY);
    sessionStorage.setItem(TOOL_PANEL_PINNED_VIEWS_KEY, JSON.stringify(['files']));
    loads = [];
    views = ['files', 'blocks', 'assets'].map((id) => ({
      id,
      label: id,
      section: id === 'files' ? 'Editor' : 'Library',
      load: async () => {
        loads.push(id);
        const content = document.createElement('input');
        content.value = `${id} state`;
        return content;
      },
    }));
    el = document.createElement('da-tool-panel');
    el.pendingView = 'files';
    el.views = views;
    document.body.append(el);
    await el.updateComplete;
    await el.updateComplete;
  });

  afterEach(() => {
    el.remove();
    if (savedPins === null) sessionStorage.removeItem(TOOL_PANEL_PINNED_VIEWS_KEY);
    else sessionStorage.setItem(TOOL_PANEL_PINNED_VIEWS_KEY, savedPins);
  });

  const tabs = () => [...el.shadowRoot.querySelectorAll('.tool-panel-tab')];
  const pickerValues = () => el._pickerItemsFromViews().filter((i) => i.value).map((i) => i.value);
  const select = async (id, selected = true) => {
    const picker = el.shadowRoot.querySelector('nx-picker');
    const values = selected
      ? [...new Set([...picker.values, id])]
      : picker.values.filter((value) => value !== id);
    picker.values = values;
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: id, values, selected } }));
    await el.updateComplete;
    await nextTask();
    await el.updateComplete;
  };
  const pinAll = async () => {
    for (const { id } of views) {
      await select(id);
    }
  };
  const dragEvent = (type, dataTransfer, clientX = 0) => new DragEvent(type, {
    bubbles: true,
    cancelable: true,
    dataTransfer,
    clientX,
  });

  it('reorders tabs by dropping before or after a tab and restores the saved order', async () => {
    await pinAll();
    const activeContent = el._loaded.assets;
    const source = tabs()[0];
    const transfer = new DataTransfer();
    source.dispatchEvent(dragEvent('dragstart', transfer));
    expect(transfer.getData('text/plain')).to.equal('');
    expect(transfer.getData('application/x-da-panel-tab')).to.equal('files');
    const last = tabs()[2].parentElement;
    const end = last.getBoundingClientRect().right - 1;
    const over = dragEvent('dragover', transfer, end);
    last.dispatchEvent(over);
    await el.updateComplete;
    expect(over.defaultPrevented).to.equal(true);
    expect(last.dataset.dropSide).to.equal('after');
    last.dispatchEvent(dragEvent('drop', transfer, end));
    await el.updateComplete;
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['blocks', 'assets', 'files']);
    expect(tabs()[2]).to.equal(source);
    expect(el.activeId).to.equal('assets');
    expect(el._loaded.assets).to.equal(activeContent);

    source.dispatchEvent(dragEvent('dragstart', transfer));
    const target = tabs()[0].parentElement;
    target.dispatchEvent(dragEvent('drop', transfer, target.getBoundingClientRect().left));
    await el.updateComplete;
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['files', 'blocks', 'assets']);
    expect(loads).to.deep.equal(['files', 'blocks', 'assets']);
    expect(pickerValues()).to.deep.equal(['files', 'blocks', 'assets']);
    source.dispatchEvent(dragEvent('dragstart', transfer));
    last.dispatchEvent(dragEvent('drop', transfer, end));
    await el.updateComplete;
    el.remove();
    el = document.createElement('da-tool-panel');
    el.pendingView = 'assets';
    el.views = views;
    document.body.append(el);
    await el.updateComplete;
    await el.updateComplete;
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['blocks', 'assets', 'files']);
  });

  it('ignores external drops and leaves pin order unchanged when a drag is cancelled', async () => {
    await pinAll();
    const transfer = new DataTransfer();
    transfer.setData('text/plain', 'files');
    const target = tabs()[2].parentElement;
    const x = target.getBoundingClientRect().right - 1;
    const external = dragEvent('dragover', transfer, x);
    target.dispatchEvent(external);
    target.dispatchEvent(dragEvent('drop', transfer, x));
    expect(external.defaultPrevented).to.equal(false);
    tabs()[0].dispatchEvent(dragEvent('dragstart', transfer));
    target.dispatchEvent(dragEvent('dragover', transfer, x));
    await el.updateComplete;
    tabs()[0].dispatchEvent(dragEvent('dragend', transfer));
    await el.updateComplete;
    expect(target.dataset.dropSide).to.equal('');
    target.dispatchEvent(dragEvent('drop', transfer, x));
    expect(el._pinnedIds).to.deep.equal(['files', 'blocks', 'assets']);
    expect(JSON.parse(sessionStorage.getItem(TOOL_PANEL_PINNED_VIEWS_KEY)))
      .to.deep.equal(['files', 'blocks', 'assets']);
  });

  it('uses a rounded drag image with transparent corners and removes it when dragging ends', async () => {
    await pinAll();
    const sheet = new CSSStyleSheet();
    const response = await fetch('/blocks/shared/tool-panel/tool-panel.css');
    await sheet.replace(await response.text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.setProperty('--s2-corner-radius-400', '12px');
    el.style.setProperty('--s2-gray-900', '#131313');
    el.style.setProperty('--s2-gray-50', '#f8f8f8');
    const source = tabs()[2];
    const transfer = new DataTransfer();
    source.dispatchEvent(dragEvent('dragstart', transfer));
    const image = el.shadowRoot.querySelector('.tool-panel-drag-image');
    const ctx = image.getContext('2d');
    expect(ctx.getImageData(0, 0, 1, 1).data[3]).to.equal(0);
    expect(ctx.getImageData(Math.floor(image.width / 2), 1, 1, 1).data[3]).to.equal(255);
    source.dispatchEvent(dragEvent('dragend', transfer));
    expect(el.shadowRoot.querySelector('.tool-panel-drag-image')).to.equal(null);
  });

  it('rejects a drop after the panel changes page context', async () => {
    await pinAll();
    const transfer = new DataTransfer();
    tabs()[0].dispatchEvent(dragEvent('dragstart', transfer));
    el.contextKey = 'another/page';
    await el.updateComplete;
    const target = tabs()[2].parentElement;
    target.dispatchEvent(dragEvent('drop', transfer, target.getBoundingClientRect().right - 1));
    expect(el._pinnedIds).to.deep.equal(['files', 'blocks', 'assets']);
    tabs()[0].dispatchEvent(dragEvent('dragend', transfer));
  });

  it('supports keyboard reordering without activating the moved tab or crossing the edges', async () => {
    await pinAll();
    const source = tabs()[0];
    source.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
    await el.updateComplete;
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['blocks', 'files', 'assets']);
    expect(el.shadowRoot.activeElement).to.equal(source);
    expect(el.activeId).to.equal('assets');
    source.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true }));
    await el.updateComplete;
    source.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true }));
    expect(el._pinnedIds).to.deep.equal(['files', 'blocks', 'assets']);
  });

  it('fades only overflowing edges and updates when scrolling, resizing, or removing tabs', async () => {
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/shared/tool-panel/tool-panel.css')).text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.width = '160px';
    el.style.height = '300px';
    await pinAll();
    const list = el.shadowRoot.querySelector('.tool-panel-tabs');
    const scroll = async (left) => {
      list.scrollLeft = left;
      list.dispatchEvent(new Event('scroll'));
      await el.updateComplete;
    };
    const edges = () => [
      list.hasAttribute('data-overflow-left'), list.hasAttribute('data-overflow-right'),
    ];
    await scroll(0);
    expect(edges()).to.deep.equal([false, true]);
    expect(el.shadowRoot.querySelector('.tool-panel-tabs-divider')).not.to.equal(null);
    await scroll((list.scrollWidth - list.clientWidth) / 2);
    expect(edges()).to.deep.equal([true, true]);
    await scroll(list.scrollWidth);
    expect(edges()).to.deep.equal([true, false]);

    el.style.width = '600px';
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    await nextTask();
    await el.updateComplete;
    expect(edges()).to.deep.equal([false, false]);
    expect(el.shadowRoot.querySelector('.tool-panel-tabs-divider')).to.equal(null);
    el.style.width = '160px';
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    await nextTask();
    await el.updateComplete;
    expect(edges()).to.deep.equal([false, true]);
    await select('blocks', false);
    await select('assets', false);
    expect(edges()).to.deep.equal([false, false]);
    expect(el.shadowRoot.querySelector('.tool-panel-tabs-divider')).to.equal(null);
  });

  it('opens Files and Outline as default tabs in a new session', async () => {
    el.remove();
    sessionStorage.removeItem(TOOL_PANEL_PINNED_VIEWS_KEY);
    el = document.createElement('da-tool-panel');
    el.pendingView = 'outline';
    el.views = [...views, { ...views[0], id: 'outline', label: 'Outline' }];
    document.body.append(el);
    await el.updateComplete;
    await el.updateComplete;
    expect(tabs().map((button) => button.dataset.viewId)).to.deep.equal(['files', 'outline']);
    expect(el.activeId).to.equal('outline');
    const picker = el.shadowRoot.querySelector('nx-picker');
    expect(picker.hasAttribute('multiple')).to.be.true;
    expect(picker.values).to.deep.equal(['files', 'outline']);
    expect(picker.labelOverride).to.equal('Panels');
    expect(el.shadowRoot.querySelector('.tool-panel-pin, .tool-panel-unpin')).to.equal(null);
  });

  it('opens selections as tabs and switches between them without losing panel state', async () => {
    await select('blocks');
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['files', 'blocks']);
    expect(el.activeId).to.equal('blocks');
    expect(pickerValues()).to.deep.equal(['files', 'blocks', 'assets']);
    expect(el.shadowRoot.querySelector('nx-picker').values).to.deep.equal(['files', 'blocks']);
    tabs()[0].click();
    await el.updateComplete;
    expect(el.activeId).to.equal('files');
    expect(el._loaded.files.value).to.equal('files state');
    expect(el._loaded.blocks.hidden).to.equal(true);
    expect(loads).to.deep.equal(['files', 'blocks']);
    expect(tabs().map((button) => button.getAttribute('aria-pressed'))).to.deep.equal(['true', 'false']);
    await select('assets');
    expect(el.activeId).to.equal('assets');
    expect(tabs().map((button) => button.getAttribute('aria-pressed')))
      .to.deep.equal(['false', 'false', 'true']);
    expect(tabs()).to.have.lengthOf(3);
    expect(pickerValues()).to.deep.equal(['files', 'blocks', 'assets']);
    expect(el.shadowRoot.querySelector('nx-picker').getAttribute('placeholder')).to.equal('Panels');
  });

  it('keeps the pop-out action available for a pinned panel', async () => {
    let opened = 0;
    el.views = [{ ...views[0], openModal: () => { opened += 1; } }, ...views.slice(1)];
    await el.updateComplete;
    el.shadowRoot.querySelector('.tool-panel-popout').click();
    expect(opened).to.equal(1);
    expect(el.activeId).to.equal('files');
    expect(tabs()).to.have.lengthOf(1);
  });

  ['blocks', 'aem-assets-panel'].forEach((id) => {
    it(`shows fullscreen beside Close only while ${id} is selected`, async () => {
      let opened = 0;
      const open = () => { opened += 1; };
      el.views = [
        ...views.filter((view) => view.id !== id),
        {
          ...views[0],
          id,
          label: id === 'blocks' ? 'Blocks' : 'AEM Assets',
          ...(id === 'blocks' ? { openModal: open } : { loadModal: open }),
        },
      ];
      await el.updateComplete;
      await select(id);
      const content = el._loaded[id];
      const button = el.shadowRoot.querySelector('.tool-panel-header .tool-panel-popout');
      expect(button.nextElementSibling.classList.contains('tool-panel-close')).to.be.true;
      expect(el.shadowRoot.querySelector('.tool-panel-tabs nx-menu')).to.equal(null);
      button.click();
      await el.updateComplete;
      await nextTask();
      expect(opened).to.equal(1);
      expect(el.activeId).to.equal(id);
      expect(el._loaded[id]).to.equal(content);
      expect(el.shadowRoot.querySelector('nx-picker').values).to.deep.equal(['files', id]);
      el.shadowRoot.querySelector('.tool-panel-fullsize-dialog-close')?.click();
      await el.showPanel('files');
      await el.updateComplete;
      expect(el.shadowRoot.querySelector('.tool-panel-popout')).to.equal(null);
    });
  });

  it('opens and restores more than four selected tabs', async () => {
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/shared/tool-panel/tool-panel.css')).text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.width = '280px';
    el.style.height = '300px';
    el.views = [
      ...views,
      ...['outline', 'versions', 'comments'].map((id) => ({ ...views[0], id, label: id })),
    ];
    await el.updateComplete;
    const ids = ['files', 'blocks', 'assets', 'outline', 'versions', 'comments'];
    for (const id of ids) await select(id);
    expect(tabs()).to.have.lengthOf(6);
    expect(el.activeId).to.equal('comments');
    const tabList = el.shadowRoot.querySelector('.tool-panel-tabs');
    const activeTab = tabs().at(-1).getBoundingClientRect();
    expect(tabList.scrollLeft).to.be.greaterThan(0);
    expect(activeTab.left).to.be.at.least(tabList.getBoundingClientRect().left);
    expect(Math.floor(activeTab.right))
      .to.be.at.most(Math.ceil(tabList.getBoundingClientRect().right));
    expect(JSON.parse(sessionStorage.getItem(TOOL_PANEL_PINNED_VIEWS_KEY)))
      .to.deep.equal(ids);
    const savedViews = el.views;
    el.remove();
    el = document.createElement('da-tool-panel');
    el.pendingView = 'comments';
    el.views = savedViews;
    document.body.append(el);
    await el.updateComplete;
    await el.updateComplete;
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(ids);
    expect(el.shadowRoot.querySelector('nx-picker').values).to.deep.equal(ids);
  });

  it('removes a deselected active tab and activates another selected panel', async () => {
    await select('blocks');
    await select('blocks', false);
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(['files']);
    expect(pickerValues()).to.deep.equal(['files', 'blocks', 'assets']);
    expect(el.activeId).to.equal('files');
    expect(el.shadowRoot.querySelector('nx-picker').values).to.deep.equal(['files']);
    expect(el._loaded.blocks.hidden).to.be.true;
  });

  it('removes an inactive tab without changing the active panel and reuses it when reopened', async () => {
    await select('blocks');
    const { files } = el._loaded;
    await select('files', false);
    expect(el.activeId).to.equal('blocks');
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(['blocks']);
    await select('files');
    expect(el._loaded.files).to.equal(files);
    expect(loads).to.deep.equal(['files', 'blocks']);
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(['blocks', 'files']);
  });

  it('keeps the last available tab selected even when saved tabs are unavailable', async () => {
    el._pinnedIds = ['files', 'unavailable'];
    await el.updateComplete;
    await select('files', false);
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(['files']);
    expect(el.shadowRoot.querySelector('nx-picker').values).to.deep.equal(['files']);
    expect(el.activeId).to.equal('files');
  });

  it('restores pins on remount and hides unavailable pins without forgetting them', async () => {
    await select('assets');
    el.remove();
    el = document.createElement('da-tool-panel');
    el.pendingView = 'assets';
    el.views = views;
    document.body.append(el);
    await el.updateComplete;
    await el.updateComplete;
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['files', 'assets']);
    el.views = views.filter((view) => view.id !== 'assets');
    await el.updateComplete;
    await el.updateComplete;
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['files']);
    expect(pickerValues()).to.deep.equal(['files', 'blocks']);
    el.views = views;
    await el.updateComplete;
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['files', 'assets']);
  });

  it('does not activate a tab that was deselected while its content was loading', async () => {
    const loading = deferred();
    el.views = [...views, { id: 'slow', label: 'Slow', load: () => loading.promise }];
    await el.updateComplete;
    const opened = el.showPanel('slow');
    await el.updateComplete;
    await select('slow', false);
    loading.resolve(document.createElement('div'));
    await opened;
    await el.updateComplete;
    expect(el.activeId).to.equal('files');
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(['files']);
    expect(el._loaded.slow).to.equal(undefined);
  });

  it('does not let a slower selected panel override a more recent selection', async () => {
    const loading = deferred();
    el.views = [...views, { id: 'slow', label: 'Slow', load: () => loading.promise }];
    await el.updateComplete;
    const opened = el.showPanel('slow');
    await select('blocks');
    loading.resolve(document.createElement('div'));
    await opened;
    await el.updateComplete;
    expect(el.activeId).to.equal('blocks');
    expect(el._loaded.slow).not.to.equal(undefined);
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(['files', 'slow', 'blocks']);
  });

  it('keeps modal actions separate from the selected tabs', async () => {
    let opened = 0;
    el.views = [
      ...views,
      { id: 'modal', label: 'Modal', experience: 'modal', openModal: () => { opened += 1; } },
    ];
    await el.updateComplete;
    el.shadowRoot.querySelector('nx-picker')
      .dispatchEvent(new CustomEvent('change', { detail: { value: 'modal' } }));
    await el.updateComplete;
    expect(opened).to.equal(1);
    expect(el.activeId).to.equal('files');
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(['files']);
    expect(el.shadowRoot.querySelector('nx-picker').values).to.deep.equal(['files']);
  });
});

describe('DaToolPanel — loaded view cache', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('da-tool-panel');
    document.body.append(el);
    await el.updateComplete;
  });

  afterEach(() => el.remove());

  it('scrolls the next hidden tab into view in either direction without changing panels', async () => {
    el.views = ['files', 'outline', 'page', 'comments'].map((id) => ({
      id,
      label: id,
      firstParty: true,
      load: async () => document.createElement('div'),
    }));
    await el.updateComplete;
    await el.updateComplete;
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/shared/tool-panel/tool-panel.css')).text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.setProperty('--s2-gray-400', '#aaa');
    const container = el.shadowRoot.querySelector('.tool-panel-tabs-container');
    const tabs = container.querySelector('.tool-panel-tabs');
    tabs.style.flex = '0 0 160px';
    const items = [...tabs.querySelectorAll('.tool-panel-tab-item')];
    items.forEach((item) => { item.style.width = '100px'; });
    // Keep scrolling synchronous so assertions do not depend on animation timing.
    tabs.scrollBy = ({ left }) => { tabs.scrollLeft += left; };
    el._syncTabOverflow();
    await el.updateComplete;
    const previous = container.querySelector('[aria-label="Show previous tab"]');
    const next = container.querySelector('[aria-label="Show next tab"]');
    const { activeId } = el;
    expect(previous.hidden).to.be.false;
    expect(previous.disabled).to.be.true;
    expect(next.hidden).to.be.false;
    expect(next.disabled).to.be.false;
    const previousBounds = previous.getBoundingClientRect();
    const nextBounds = next.getBoundingClientRect();
    expect(previousBounds.width).to.equal(previousBounds.height);
    expect(nextBounds.width).to.equal(nextBounds.height);
    [previous, next].forEach((button) => {
      const bounds = button.getBoundingClientRect();
      const icon = button.querySelector('svg').getBoundingClientRect();
      expect(icon.left + icon.width / 2).to.equal(bounds.left + bounds.width / 2);
      expect(icon.top + icon.height / 2).to.equal(bounds.top + bounds.height / 2);
    });
    expect(getComputedStyle(previous).color).to.equal('rgb(170, 170, 170)');
    previous.click();
    expect(tabs.scrollLeft).to.equal(0);
    next.click();
    el._syncTabOverflow();
    await el.updateComplete;
    expect(tabs.scrollLeft).to.be.greaterThan(0);
    expect(items[1].getBoundingClientRect().right)
      .to.be.at.most(tabs.getBoundingClientRect().right - 3);
    expect(previous.hidden).to.be.false;
    expect(previous.disabled).to.be.false;
    previous.click();
    el._syncTabOverflow();
    await el.updateComplete;
    expect(tabs.scrollLeft).to.equal(0);
    expect(previous.hidden).to.be.false;
    expect(previous.disabled).to.be.true;
    for (let i = 0; i < items.length; i += 1) {
      next.click();
      el._syncTabOverflow();
      // eslint-disable-next-line no-await-in-loop
      await el.updateComplete;
    }
    expect(next.hidden).to.be.false;
    expect(next.disabled).to.be.true;
    expect(previous.disabled).to.be.false;
    expect(previous.getBoundingClientRect().left).to.equal(previousBounds.left);
    expect(next.getBoundingClientRect().left).to.equal(nextBounds.left);
    expect(getComputedStyle(next).color).to.equal('rgb(170, 170, 170)');
    const endScroll = tabs.scrollLeft;
    next.click();
    expect(tabs.scrollLeft).to.equal(endScroll);
    expect(items.at(-1).getBoundingClientRect().right)
      .to.be.at.most(tabs.getBoundingClientRect().right);
    expect(el.activeId).to.equal(activeId);
    tabs.style.flexBasis = '600px';
    el._syncTabOverflow();
    await el.updateComplete;
    expect(previous.hidden).to.be.true;
    expect(next.hidden).to.be.true;
  });

  it('keeps refresh below the tabs and moves fullscreen there below 500px', async () => {
    const content = document.createElement('div');
    const refresh = document.createElement('button');
    refresh.textContent = 'Refresh';
    let refreshed = 0;
    let opened = 0;
    refresh.addEventListener('click', () => { refreshed += 1; });
    content.getHeaderActions = () => refresh;
    el.pendingView = 'versions';
    el.views = [{
      id: 'versions',
      label: 'Versions',
      firstParty: true,
      load: async () => content,
      openModal: () => { opened += 1; },
    }];
    await el.updateComplete;
    await el.updateComplete;
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/shared/tool-panel/tool-panel.css')).text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    el.style.width = '500px';
    el.style.height = '300px';
    el.style.setProperty('--s2-spacing-200', '12px');
    el.style.setProperty('--s2-spacing-75', '4px');
    el.style.setProperty('--s2-spacing-100', '8px');
    const header = el.shadowRoot.querySelector('.tool-panel-header');
    const toolbar = el.shadowRoot.querySelector('.tool-panel-toolbar');
    const selector = header.querySelector('.tool-panel-selector');
    header.querySelector('nx-picker').style.width = '72px';
    const divider = header.querySelector('.tool-panel-divider').getBoundingClientRect();
    const close = header.querySelector('.tool-panel-close').getBoundingClientRect();
    expect(header.querySelector('.tool-panel-tabs-container').nextElementSibling).to.equal(selector);
    expect(selector.getBoundingClientRect().right).to.be.at.most(divider.left);
    expect(divider.width).to.be.greaterThan(0);
    expect(divider.right).to.be.at.most(close.left);
    expect(close.right).to.equal(header.getBoundingClientRect().right - 12);
    expect(header.querySelectorAll(':scope > button')).to.have.lengthOf(2);
    expect(header.querySelector('.tool-panel-close')).not.to.equal(null);
    expect(toolbar.contains(refresh)).to.be.true;
    const toolbarPopout = toolbar.querySelector('.tool-panel-popout');
    expect(getComputedStyle(toolbarPopout).display).to.equal('none');
    expect(toolbar.querySelector('.tool-panel-pin, .tool-panel-unpin')).to.equal(null);
    expect(toolbar.getBoundingClientRect().top)
      .to.be.at.least(header.getBoundingClientRect().bottom);
    expect(el.shadowRoot.querySelector('.tool-panel-content').getBoundingClientRect().top)
      .to.be.at.least(toolbar.getBoundingClientRect().bottom);
    const popoutButton = header.querySelector('.tool-panel-popout');
    const popout = popoutButton.getBoundingClientRect();
    expect(refresh.getBoundingClientRect().left)
      .to.equal(toolbar.getBoundingClientRect().left + 12);
    expect(popoutButton.nextElementSibling.classList.contains('tool-panel-close')).to.be.true;
    expect(popout.right).to.equal(close.left);
    expect(popout.bottom).to.be.at.most(header.getBoundingClientRect().bottom);
    el.style.width = '499px';
    expect(getComputedStyle(popoutButton).display).to.equal('none');
    expect(getComputedStyle(toolbarPopout).display).not.to.equal('none');
    expect(toolbarPopout.getBoundingClientRect().top)
      .to.be.at.least(header.getBoundingClientRect().bottom);
    expect(toolbar.contains(refresh)).to.be.true;
    refresh.click();
    toolbarPopout.click();
    expect(refreshed).to.equal(1);
    expect(opened).to.equal(1);
    el.style.width = '500px';
    expect(getComputedStyle(popoutButton).display).not.to.equal('none');
    expect(getComputedStyle(toolbarPopout).display).to.equal('none');
    refresh.remove();
    expect(getComputedStyle(toolbar).display).to.equal('none');
    el.style.width = '499px';
    expect(getComputedStyle(toolbar).display).not.to.equal('none');
  });

  it('hides an empty second row even when a panel is active', async () => {
    el.views = [{
      id: 'files',
      label: 'Files',
      firstParty: true,
      load: async () => document.createElement('div'),
    }];
    await el.updateComplete;
    await el.updateComplete;
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/shared/tool-panel/tool-panel.css')).text());
    el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, sheet];
    const toolbar = el.shadowRoot.querySelector('.tool-panel-toolbar');
    el.style.width = '499px';
    expect(getComputedStyle(toolbar).display).to.equal('none');
    el.style.width = '500px';
    expect(getComputedStyle(toolbar).display).to.equal('none');
  });

  it('opens the block pop-out without switching or reloading the sidebar', async () => {
    let opened = 0;
    const content = document.createElement('div');
    el.pendingView = 'blocks';
    el.views = [{
      id: 'blocks',
      label: 'Blocks',
      experience: 'inline',
      load: async () => content,
      openModal: () => { opened += 1; },
    }];
    await el.updateComplete;
    await el.updateComplete;
    const item = el._pickerItemsFromViews().find((i) => i.value === 'blocks');
    expect(item.action).to.equal(undefined);
    el.shadowRoot.querySelector('.tool-panel-header .tool-panel-popout').click();
    expect(opened).to.equal(1);
    expect(el.activeId).to.equal('blocks');
    expect(el._loaded.blocks).to.equal(content);
  });

  it('opens and closes the assets modal while retaining the sidebar and its state', async () => {
    const content = document.createElement('div');
    let close;
    el.pendingView = 'aem-assets-panel';
    el.views = [{
      id: 'aem-assets-panel',
      label: 'AEM Assets',
      experience: 'inline',
      load: async () => content,
      loadModal: async (body, onClose) => {
        body.textContent = 'Asset selector';
        close = onClose;
      },
    }];
    await el.updateComplete;
    await el.updateComplete;
    el.shadowRoot.querySelector('.tool-panel-header .tool-panel-popout').click();
    await el.updateComplete;
    await nextTask();
    const dialog = el.shadowRoot.querySelector('dialog');
    expect(dialog.open).to.equal(true);
    expect(dialog.textContent).to.include('Asset selector');
    close();
    dialog.dispatchEvent(new Event('close'));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('dialog')).to.equal(null);
    expect(el.activeId).to.equal('aem-assets-panel');
    expect(el._loaded['aem-assets-panel']).to.equal(content);
  });

  it('does not show a pop-out button for ordinary inline panels', async () => {
    el.pendingView = 'files';
    el.views = [{ id: 'files', label: 'Files', load: async () => document.createElement('div') }];
    await el.updateComplete;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.tool-panel-popout')).to.equal(null);
  });

  it('reloads an active configured view when its source cache key changes', async () => {
    let loadCount = 0;
    const view = (cacheKey) => ({
      id: 'configured-tool',
      label: 'Configured tool',
      cacheKey,
      load: async () => {
        loadCount += 1;
        return document.createElement('div');
      },
    });

    el.contextKey = 'example-org/site-one';
    el.pendingView = 'configured-tool';
    el.views = [view('["https://one.example/app"]')];
    await el.updateComplete;
    await el.updateComplete;

    el.contextKey = 'example-org/site-two';
    el.views = [view('["https://two.example/app"]')];
    await el.updateComplete;
    await el.updateComplete;

    expect(loadCount).to.equal(2);
  });

  it('reloads a configured view when its site context changes', async () => {
    let loadCount = 0;
    const view = {
      id: 'configured-tool',
      label: 'Configured tool',
      cacheKey: '["https://plugin.example/app"]',
      load: async () => {
        loadCount += 1;
        return document.createElement('div');
      },
    };

    el.contextKey = 'example-org/site-one';
    el.pendingView = 'configured-tool';
    el.views = [view];
    await el.updateComplete;
    await el.updateComplete;

    el.contextKey = 'example-org/site-two';
    await el.updateComplete;
    el.views = [{ ...view }];
    await el.updateComplete;
    await el.updateComplete;

    expect(loadCount).to.equal(2);
  });

  it('retains an active first-party view when view definitions refresh', async () => {
    let loadCount = 0;
    const view = () => ({
      id: 'outline',
      label: 'Outline',
      firstParty: true,
      load: async () => {
        loadCount += 1;
        return document.createElement('div');
      },
    });

    el.contextKey = 'example-org/site-one';
    el.pendingView = 'outline';
    el.contextKey = 'example-org/site-two';
    el.views = [view()];
    await el.updateComplete;
    await el.updateComplete;

    el.views = [view()];
    await el.updateComplete;
    await el.updateComplete;

    expect(loadCount).to.equal(1);
  });

  it('ignores a deferred load from the previous site after a same-id view loads', async () => {
    const staleLoad = deferred();
    const staleStarted = deferred();
    const staleEl = document.createElement('div');
    staleEl.dataset.source = 'site-one';
    const currentEl = document.createElement('div');
    currentEl.dataset.source = 'site-two';

    el.contextKey = 'example-org/site-one';
    el.pendingView = 'configured-tool';
    el.views = [{
      id: 'configured-tool',
      label: 'Configured tool',
      cacheKey: '["https://one.example/app"]',
      load: async () => {
        staleStarted.resolve();
        return staleLoad.promise;
      },
    }];
    await staleStarted.promise;

    el.contextKey = 'example-org/site-two';
    el.pendingView = 'configured-tool';
    el.views = [{
      id: 'configured-tool',
      label: 'Configured tool',
      cacheKey: '["https://two.example/app"]',
      load: async () => currentEl,
    }];
    await el.updateComplete;
    await nextTask();
    await el.updateComplete;
    expect(el._loaded['configured-tool']).to.equal(currentEl);

    staleLoad.resolve(staleEl);
    await nextTask();
    await el.updateComplete;

    expect(el._loaded['configured-tool']).to.equal(currentEl);
    expect(el.activeId).to.equal('configured-tool');
    expect(el.shadowRoot.querySelector('.tool-panel-content').contains(currentEl)).to.be.true;
    expect(el.shadowRoot.querySelector('.tool-panel-content').contains(staleEl)).to.be.false;
  });

  it('ignores a deferred load after its view is removed', async () => {
    const staleLoad = deferred();
    const staleStarted = deferred();
    const staleEl = document.createElement('div');

    el.contextKey = 'example-org/site-one';
    el.pendingView = 'configured-tool';
    el.views = [{
      id: 'configured-tool',
      label: 'Configured tool',
      cacheKey: '["https://one.example/app"]',
      load: async () => {
        staleStarted.resolve();
        return staleLoad.promise;
      },
    }];
    await staleStarted.promise;

    el.contextKey = '';
    el.views = [];
    await el.updateComplete;
    await nextTask();

    staleLoad.resolve(staleEl);
    await nextTask();
    await el.updateComplete;

    expect(el._loaded['configured-tool']).to.be.undefined;
    expect(el.activeId).to.be.undefined;
    expect(el.shadowRoot.querySelector('.tool-panel-content').contains(staleEl)).to.be.false;
  });
});
