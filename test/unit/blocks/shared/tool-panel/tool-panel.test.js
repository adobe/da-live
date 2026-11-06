/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
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
  const panel = document.createElement('da-tool-panel');
  panel.views = views;
  return panel;
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
        const panel = createPanel([
          { id: 'blocks', label: 'Blocks', section: 'Library', experience },
        ]);
        const item = panel._pickerItemsFromViews().find((candidate) => candidate.value === 'blocks');
        expect(item.action).to.be.true;
        expect(item.trailingIcon).to.equal('/img/icons/s2-icon-fullscreen-20-n.svg');
        expect(item.ariaLabel).to.equal('Blocks (opens in dialog)');
      });
    });

    it('keeps the external-link icon for views that open in a new tab', () => {
      const panel = createPanel([
        { id: 'external', label: 'External', section: 'Extensions', experience: 'window' },
      ]);
      const item = panel._pickerItemsFromViews().find((candidate) => candidate.value === 'external');
      expect(item.action).to.be.true;
      expect(item.trailingIcon).to.equal('/img/icons/s2-icon-openin-20-n.svg');
      expect(item.ariaLabel).to.equal('External (opens in new tab)');
    });

    it('leaves a plain inline view as a non-action item', () => {
      const panel = createPanel([
        { id: 'files', label: 'Files', section: 'Editor', experience: 'inline' },
      ]);
      const item = panel._pickerItemsFromViews().find((candidate) => candidate.value === 'files');
      expect(item.action).to.be.undefined;
      expect(item.trailingIcon).to.be.undefined;
    });
  });

  describe('showPanel', () => {
    it('invokes openModal and does not activate the view for a modal experience', async () => {
      let opened = 0;
      const openModal = async () => { opened += 1; };
      const panel = createPanel([{ id: 'blocks', label: 'Blocks', experience: 'modal', openModal }]);
      await panel.showPanel('blocks');
      expect(opened).to.equal(1);
      expect(panel.activeId).to.be.undefined;
    });

    it('does not throw when a modal view has no openModal handler', async () => {
      const panel = createPanel([{ id: 'blocks', label: 'Blocks', experience: 'modal' }]);
      let threw = false;
      try {
        await panel.showPanel('blocks');
      } catch {
        threw = true;
      }
      expect(threw).to.be.false;
      expect(panel.activeId).to.be.undefined;
    });
  });
});

describe('DaToolPanel selected panels', () => {
  let panel;
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
    panel = document.createElement('da-tool-panel');
    panel.pendingView = 'files';
    panel.views = views;
    document.body.append(panel);
    await panel.updateComplete;
    await panel.updateComplete;
  });

  afterEach(() => {
    panel.remove();
    if (savedPins === null) sessionStorage.removeItem(TOOL_PANEL_PINNED_VIEWS_KEY);
    else sessionStorage.setItem(TOOL_PANEL_PINNED_VIEWS_KEY, savedPins);
  });

  const tabs = () => [...panel.shadowRoot.querySelectorAll('.tool-panel-tab')];
  const pickerValues = () => panel._pickerItemsFromViews()
    .filter((item) => item.value).map((item) => item.value);
  const select = async (id, selected = true) => {
    const picker = panel.shadowRoot.querySelector('nx-picker');
    const values = selected
      ? [...new Set([...picker.values, id])]
      : picker.values.filter((value) => value !== id);
    picker.values = values;
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: id, values, selected } }));
    await panel.updateComplete;
    await nextTask();
    await panel.updateComplete;
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

  it('opens the modal selector without loading or activating the assets rail', async () => {
    const loadModal = sinon.spy();
    views.find((view) => view.id === 'assets').loadModal = loadModal;
    const pinned = [...el._pinnedIds];

    await el.showPanel('assets', { modal: true });
    await el.updateComplete;
    await nextTask();

    const dialog = el.shadowRoot.querySelector('.tool-panel-fullsize-dialog');
    expect(dialog.open).to.be.true;
    expect(loadModal.calledOnce).to.be.true;
    expect(loadModal.firstCall.args[0]).to.equal(dialog.querySelector('.tool-panel-fullsize-dialog-body'));
    expect(loads).to.deep.equal(['files']);
    expect(el.activeId).to.equal('files');
    expect(el._pinnedIds).to.deep.equal(pinned);
    dialog.close();
  });

  it('reorders tabs by dropping before or after a tab and restores the saved order', async () => {
    await pinAll();
    const activeContent = panel._loaded.assets;
    const source = tabs()[0];
    const transfer = new DataTransfer();
    source.dispatchEvent(dragEvent('dragstart', transfer));
    expect(transfer.getData('text/plain')).to.equal('');
    expect(transfer.getData('application/x-da-panel-tab')).to.equal('files');
    const last = tabs()[2].parentElement;
    const end = last.getBoundingClientRect().right - 1;
    const over = dragEvent('dragover', transfer, end);
    last.dispatchEvent(over);
    await panel.updateComplete;
    expect(over.defaultPrevented).to.equal(true);
    expect(last.dataset.dropSide).to.equal('after');
    last.dispatchEvent(dragEvent('drop', transfer, end));
    await panel.updateComplete;
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['blocks', 'assets', 'files']);
    expect(tabs()[2]).to.equal(source);
    expect(panel.activeId).to.equal('assets');
    expect(panel._loaded.assets).to.equal(activeContent);

    source.dispatchEvent(dragEvent('dragstart', transfer));
    const target = tabs()[0].parentElement;
    target.dispatchEvent(dragEvent('drop', transfer, target.getBoundingClientRect().left));
    await panel.updateComplete;
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['files', 'blocks', 'assets']);
    expect(loads).to.deep.equal(['files', 'blocks', 'assets']);
    expect(pickerValues()).to.deep.equal(['files', 'blocks', 'assets']);
    source.dispatchEvent(dragEvent('dragstart', transfer));
    last.dispatchEvent(dragEvent('drop', transfer, end));
    await panel.updateComplete;
    panel.remove();
    panel = document.createElement('da-tool-panel');
    panel.pendingView = 'assets';
    panel.views = views;
    document.body.append(panel);
    await panel.updateComplete;
    await panel.updateComplete;
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
    await panel.updateComplete;
    tabs()[0].dispatchEvent(dragEvent('dragend', transfer));
    await panel.updateComplete;
    expect(target.dataset.dropSide).to.equal('');
    target.dispatchEvent(dragEvent('drop', transfer, x));
    expect(panel._pinnedIds).to.deep.equal(['files', 'blocks', 'assets']);
    expect(JSON.parse(sessionStorage.getItem(TOOL_PANEL_PINNED_VIEWS_KEY)))
      .to.deep.equal(['files', 'blocks', 'assets']);
  });

  it('uses a rounded drag image with transparent corners and removes it when dragging ends', async () => {
    await pinAll();
    const sheet = new CSSStyleSheet();
    const response = await fetch('/blocks/shared/tool-panel/tool-panel.css');
    await sheet.replace(await response.text());
    panel.shadowRoot.adoptedStyleSheets = [...panel.shadowRoot.adoptedStyleSheets, sheet];
    panel.style.setProperty('--s2-corner-radius-400', '12px');
    panel.style.setProperty('--s2-gray-900', '#131313');
    panel.style.setProperty('--s2-gray-50', '#f8f8f8');
    const source = tabs()[2];
    const transfer = new DataTransfer();
    source.dispatchEvent(dragEvent('dragstart', transfer));
    const image = panel.shadowRoot.querySelector('.tool-panel-drag-image');
    const canvasContext = image.getContext('2d');
    expect(canvasContext.getImageData(0, 0, 1, 1).data[3]).to.equal(0);
    const middle = Math.floor(image.width / 2);
    expect(canvasContext.getImageData(middle, 1, 1, 1).data[3]).to.equal(255);
    source.dispatchEvent(dragEvent('dragend', transfer));
    expect(panel.shadowRoot.querySelector('.tool-panel-drag-image')).to.equal(null);
  });

  it('rejects a drop after the panel changes page context', async () => {
    await pinAll();
    const transfer = new DataTransfer();
    tabs()[0].dispatchEvent(dragEvent('dragstart', transfer));
    panel.contextKey = 'another/page';
    await panel.updateComplete;
    const target = tabs()[2].parentElement;
    target.dispatchEvent(dragEvent('drop', transfer, target.getBoundingClientRect().right - 1));
    expect(panel._pinnedIds).to.deep.equal(['files', 'blocks', 'assets']);
    tabs()[0].dispatchEvent(dragEvent('dragend', transfer));
  });

  it('supports keyboard reordering without activating the moved tab or crossing the edges', async () => {
    await pinAll();
    const source = tabs()[0];
    source.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
    await panel.updateComplete;
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['blocks', 'files', 'assets']);
    expect(panel.shadowRoot.activeElement).to.equal(source);
    expect(panel.activeId).to.equal('assets');
    source.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true }));
    await panel.updateComplete;
    source.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true }));
    expect(panel._pinnedIds).to.deep.equal(['files', 'blocks', 'assets']);
  });

  it('fades only overflowing edges and updates when scrolling, resizing, or removing tabs', async () => {
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/shared/tool-panel/tool-panel.css')).text());
    panel.shadowRoot.adoptedStyleSheets = [...panel.shadowRoot.adoptedStyleSheets, sheet];
    panel.style.width = '160px';
    panel.style.height = '300px';
    await pinAll();
    const list = panel.shadowRoot.querySelector('.tool-panel-tabs');
    const scroll = async (left) => {
      list.scrollLeft = left;
      list.dispatchEvent(new Event('scroll'));
      await panel.updateComplete;
    };
    const edges = () => [
      list.hasAttribute('data-overflow-left'), list.hasAttribute('data-overflow-right'),
    ];
    await scroll(0);
    expect(edges()).to.deep.equal([false, true]);
    expect(panel.shadowRoot.querySelector('.tool-panel-tabs-divider')).not.to.equal(null);
    await scroll((list.scrollWidth - list.clientWidth) / 2);
    expect(edges()).to.deep.equal([true, true]);
    await scroll(list.scrollWidth);
    expect(edges()).to.deep.equal([true, false]);

    panel.style.width = '600px';
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    await nextTask();
    await panel.updateComplete;
    expect(edges()).to.deep.equal([false, false]);
    expect(panel.shadowRoot.querySelector('.tool-panel-tabs-divider')).to.equal(null);
    panel.style.width = '160px';
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    await nextTask();
    await panel.updateComplete;
    expect(edges()).to.deep.equal([false, true]);
    await select('blocks', false);
    await select('assets', false);
    expect(edges()).to.deep.equal([false, false]);
    expect(panel.shadowRoot.querySelector('.tool-panel-tabs-divider')).to.equal(null);
  });

  it('opens Files and Outline as default tabs in a new session', async () => {
    panel.remove();
    sessionStorage.removeItem(TOOL_PANEL_PINNED_VIEWS_KEY);
    panel = document.createElement('da-tool-panel');
    panel.pendingView = 'outline';
    panel.views = [...views, { ...views[0], id: 'outline', label: 'Outline' }];
    document.body.append(panel);
    await panel.updateComplete;
    await panel.updateComplete;
    expect(tabs().map((button) => button.dataset.viewId)).to.deep.equal(['files', 'outline']);
    expect(panel.activeId).to.equal('outline');
    const picker = panel.shadowRoot.querySelector('nx-picker');
    expect(picker.hasAttribute('multiple')).to.be.true;
    expect(picker.values).to.deep.equal(['files', 'outline']);
    expect(picker.labelOverride).to.equal('Panels');
    expect(panel.shadowRoot.querySelector('.tool-panel-pin, .tool-panel-unpin')).to.equal(null);
  });

  it('opens selections as tabs and switches between them without losing panel state', async () => {
    await select('blocks');
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['files', 'blocks']);
    expect(panel.activeId).to.equal('blocks');
    expect(pickerValues()).to.deep.equal(['files', 'blocks', 'assets']);
    expect(panel.shadowRoot.querySelector('nx-picker').values).to.deep.equal(['files', 'blocks']);
    tabs()[0].click();
    await panel.updateComplete;
    expect(panel.activeId).to.equal('files');
    expect(panel._loaded.files.value).to.equal('files state');
    expect(panel._loaded.blocks.hidden).to.equal(true);
    expect(loads).to.deep.equal(['files', 'blocks']);
    expect(tabs().map((button) => button.getAttribute('aria-pressed'))).to.deep.equal(['true', 'false']);
    await select('assets');
    expect(panel.activeId).to.equal('assets');
    expect(tabs().map((button) => button.getAttribute('aria-pressed')))
      .to.deep.equal(['false', 'false', 'true']);
    expect(tabs()).to.have.lengthOf(3);
    expect(pickerValues()).to.deep.equal(['files', 'blocks', 'assets']);
    expect(panel.shadowRoot.querySelector('nx-picker').getAttribute('placeholder')).to.equal('Panels');
  });

  it('keeps the pop-out action available for a pinned panel', async () => {
    let opened = 0;
    panel.views = [{ ...views[0], openModal: () => { opened += 1; } }, ...views.slice(1)];
    await panel.updateComplete;
    panel.shadowRoot.querySelector('.tool-panel-popout').click();
    expect(opened).to.equal(1);
    expect(panel.activeId).to.equal('files');
    expect(tabs()).to.have.lengthOf(1);
  });

  ['blocks', 'aem-assets-panel'].forEach((id) => {
    it(`shows fullscreen beside Close only while ${id} is selected`, async () => {
      let opened = 0;
      const open = () => { opened += 1; };
      panel.views = [
        ...views.filter((view) => view.id !== id),
        {
          ...views[0],
          id,
          label: id === 'blocks' ? 'Blocks' : 'AEM Assets',
          ...(id === 'blocks' ? { openModal: open } : { loadModal: open }),
        },
      ];
      await panel.updateComplete;
      await select(id);
      const content = panel._loaded[id];
      const button = panel.shadowRoot.querySelector('.tool-panel-header .tool-panel-popout');
      expect(button.nextElementSibling.classList.contains('tool-panel-close')).to.be.true;
      expect(panel.shadowRoot.querySelector('.tool-panel-tabs nx-menu')).to.equal(null);
      button.click();
      await panel.updateComplete;
      await nextTask();
      expect(opened).to.equal(1);
      expect(panel.activeId).to.equal(id);
      expect(panel._loaded[id]).to.equal(content);
      expect(panel.shadowRoot.querySelector('nx-picker').values).to.deep.equal(['files', id]);
      panel.shadowRoot.querySelector('.tool-panel-fullsize-dialog-close')?.click();
      await panel.showPanel('files');
      await panel.updateComplete;
      expect(panel.shadowRoot.querySelector('.tool-panel-popout')).to.equal(null);
    });
  });

  it('opens and restores more than four selected tabs', async () => {
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/shared/tool-panel/tool-panel.css')).text());
    panel.shadowRoot.adoptedStyleSheets = [...panel.shadowRoot.adoptedStyleSheets, sheet];
    panel.style.width = '280px';
    panel.style.height = '300px';
    panel.views = [
      ...views,
      ...['outline', 'versions', 'comments'].map((id) => ({ ...views[0], id, label: id })),
    ];
    await panel.updateComplete;
    const ids = ['files', 'blocks', 'assets', 'outline', 'versions', 'comments'];
    for (const id of ids) await select(id);
    expect(tabs()).to.have.lengthOf(6);
    expect(panel.activeId).to.equal('comments');
    const tabList = panel.shadowRoot.querySelector('.tool-panel-tabs');
    const activeTab = tabs().at(-1).getBoundingClientRect();
    expect(tabList.scrollLeft).to.be.greaterThan(0);
    expect(activeTab.left).to.be.at.least(tabList.getBoundingClientRect().left);
    expect(Math.floor(activeTab.right))
      .to.be.at.most(Math.ceil(tabList.getBoundingClientRect().right));
    expect(JSON.parse(sessionStorage.getItem(TOOL_PANEL_PINNED_VIEWS_KEY)))
      .to.deep.equal(ids);
    const savedViews = panel.views;
    panel.remove();
    panel = document.createElement('da-tool-panel');
    panel.pendingView = 'comments';
    panel.views = savedViews;
    document.body.append(panel);
    await panel.updateComplete;
    await panel.updateComplete;
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(ids);
    expect(panel.shadowRoot.querySelector('nx-picker').values).to.deep.equal(ids);
  });

  it('removes a deselected active tab and activates another selected panel', async () => {
    await select('blocks');
    await select('blocks', false);
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(['files']);
    expect(pickerValues()).to.deep.equal(['files', 'blocks', 'assets']);
    expect(panel.activeId).to.equal('files');
    expect(panel.shadowRoot.querySelector('nx-picker').values).to.deep.equal(['files']);
    expect(panel._loaded.blocks.hidden).to.be.true;
  });

  it('removes an inactive tab without changing the active panel and reuses it when reopened', async () => {
    await select('blocks');
    const { files } = panel._loaded;
    await select('files', false);
    expect(panel.activeId).to.equal('blocks');
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(['blocks']);
    await select('files');
    expect(panel._loaded.files).to.equal(files);
    expect(loads).to.deep.equal(['files', 'blocks']);
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(['blocks', 'files']);
  });

  it('keeps the last available tab selected even when saved tabs are unavailable', async () => {
    panel._pinnedIds = ['files', 'unavailable'];
    await panel.updateComplete;
    await select('files', false);
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(['files']);
    expect(panel.shadowRoot.querySelector('nx-picker').values).to.deep.equal(['files']);
    expect(panel.activeId).to.equal('files');
  });

  it('restores pins on remount and hides unavailable pins without forgetting them', async () => {
    await select('assets');
    panel.remove();
    panel = document.createElement('da-tool-panel');
    panel.pendingView = 'assets';
    panel.views = views;
    document.body.append(panel);
    await panel.updateComplete;
    await panel.updateComplete;
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['files', 'assets']);
    panel.views = views.filter((view) => view.id !== 'assets');
    await panel.updateComplete;
    await panel.updateComplete;
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['files']);
    expect(pickerValues()).to.deep.equal(['files', 'blocks']);
    panel.views = views;
    await panel.updateComplete;
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['files', 'assets']);
  });

  it('does not activate a tab that was deselected while its content was loading', async () => {
    const loading = deferred();
    panel.views = [...views, { id: 'slow', label: 'Slow', load: () => loading.promise }];
    await panel.updateComplete;
    const opened = panel.showPanel('slow');
    await panel.updateComplete;
    await select('slow', false);
    loading.resolve(document.createElement('div'));
    await opened;
    await panel.updateComplete;
    expect(panel.activeId).to.equal('files');
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(['files']);
    expect(panel._loaded.slow).to.equal(undefined);
  });

  it('does not let a slower selected panel override a more recent selection', async () => {
    const loading = deferred();
    panel.views = [...views, { id: 'slow', label: 'Slow', load: () => loading.promise }];
    await panel.updateComplete;
    const opened = panel.showPanel('slow');
    await select('blocks');
    loading.resolve(document.createElement('div'));
    await opened;
    await panel.updateComplete;
    expect(panel.activeId).to.equal('blocks');
    expect(panel._loaded.slow).not.to.equal(undefined);
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(['files', 'slow', 'blocks']);
  });

  it('keeps modal actions separate from the selected tabs', async () => {
    let opened = 0;
    panel.views = [
      ...views,
      { id: 'modal', label: 'Modal', experience: 'modal', openModal: () => { opened += 1; } },
    ];
    await panel.updateComplete;
    panel.shadowRoot.querySelector('nx-picker')
      .dispatchEvent(new CustomEvent('change', { detail: { value: 'modal' } }));
    await panel.updateComplete;
    expect(opened).to.equal(1);
    expect(panel.activeId).to.equal('files');
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(['files']);
    expect(panel.shadowRoot.querySelector('nx-picker').values).to.deep.equal(['files']);
  });
});

describe('DaToolPanel — loaded view cache', () => {
  let panel;

  beforeEach(async () => {
    panel = document.createElement('da-tool-panel');
    document.body.append(panel);
    await panel.updateComplete;
  });

  afterEach(() => panel.remove());

  it('scrolls the next hidden tab into view in either direction without changing panels', async () => {
    panel.views = ['files', 'outline', 'page', 'comments'].map((id) => ({
      id,
      label: id,
      firstParty: true,
      load: async () => document.createElement('div'),
    }));
    await panel.updateComplete;
    await panel.updateComplete;
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/shared/tool-panel/tool-panel.css')).text());
    panel.shadowRoot.adoptedStyleSheets = [...panel.shadowRoot.adoptedStyleSheets, sheet];
    panel.style.setProperty('--s2-gray-400', '#aaa');
    const container = panel.shadowRoot.querySelector('.tool-panel-tabs-container');
    const tabs = container.querySelector('.tool-panel-tabs');
    tabs.style.flex = '0 0 160px';
    const items = [...tabs.querySelectorAll('.tool-panel-tab-item')];
    items.forEach((item) => { item.style.width = '100px'; });
    // Keep scrolling synchronous so assertions do not depend on animation timing.
    tabs.scrollBy = ({ left }) => { tabs.scrollLeft += left; };
    panel._syncTabOverflow();
    await panel.updateComplete;
    const previous = container.querySelector('[aria-label="Show previous tab"]');
    const next = container.querySelector('[aria-label="Show next tab"]');
    const { activeId } = panel;
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
    panel._syncTabOverflow();
    await panel.updateComplete;
    expect(tabs.scrollLeft).to.be.greaterThan(0);
    expect(items[1].getBoundingClientRect().right)
      .to.be.at.most(tabs.getBoundingClientRect().right - 3);
    expect(previous.hidden).to.be.false;
    expect(previous.disabled).to.be.false;
    previous.click();
    panel._syncTabOverflow();
    await panel.updateComplete;
    expect(tabs.scrollLeft).to.equal(0);
    expect(previous.hidden).to.be.false;
    expect(previous.disabled).to.be.true;
    for (let i = 0; i < items.length; i += 1) {
      next.click();
      panel._syncTabOverflow();
      // eslint-disable-next-line no-await-in-loop
      await panel.updateComplete;
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
    expect(panel.activeId).to.equal(activeId);
    tabs.style.flexBasis = '600px';
    panel._syncTabOverflow();
    await panel.updateComplete;
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
    panel.pendingView = 'versions';
    panel.views = [{
      id: 'versions',
      label: 'Versions',
      firstParty: true,
      load: async () => content,
      openModal: () => { opened += 1; },
    }];
    await panel.updateComplete;
    await panel.updateComplete;
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/shared/tool-panel/tool-panel.css')).text());
    panel.shadowRoot.adoptedStyleSheets = [...panel.shadowRoot.adoptedStyleSheets, sheet];
    panel.style.width = '500px';
    panel.style.height = '300px';
    panel.style.setProperty('--s2-spacing-200', '12px');
    panel.style.setProperty('--s2-spacing-75', '4px');
    panel.style.setProperty('--s2-spacing-100', '8px');
    const header = panel.shadowRoot.querySelector('.tool-panel-header');
    const toolbar = panel.shadowRoot.querySelector('.tool-panel-toolbar');
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
    expect(panel.shadowRoot.querySelector('.tool-panel-content').getBoundingClientRect().top)
      .to.be.at.least(toolbar.getBoundingClientRect().bottom);
    const popoutButton = header.querySelector('.tool-panel-popout');
    const popout = popoutButton.getBoundingClientRect();
    expect(refresh.getBoundingClientRect().left)
      .to.equal(toolbar.getBoundingClientRect().left + 12);
    expect(popoutButton.nextElementSibling.classList.contains('tool-panel-close')).to.be.true;
    expect(popout.right).to.equal(close.left);
    expect(popout.bottom).to.be.at.most(header.getBoundingClientRect().bottom);
    panel.style.width = '499px';
    expect(getComputedStyle(popoutButton).display).to.equal('none');
    expect(getComputedStyle(toolbarPopout).display).not.to.equal('none');
    expect(toolbarPopout.getBoundingClientRect().top)
      .to.be.at.least(header.getBoundingClientRect().bottom);
    expect(toolbar.contains(refresh)).to.be.true;
    refresh.click();
    toolbarPopout.click();
    expect(refreshed).to.equal(1);
    expect(opened).to.equal(1);
    panel.style.width = '500px';
    expect(getComputedStyle(popoutButton).display).not.to.equal('none');
    expect(getComputedStyle(toolbarPopout).display).to.equal('none');
    refresh.remove();
    expect(getComputedStyle(toolbar).display).to.equal('none');
    panel.style.width = '499px';
    expect(getComputedStyle(toolbar).display).not.to.equal('none');
  });

  it('hides an empty second row even when a panel is active', async () => {
    panel.views = [{
      id: 'files',
      label: 'Files',
      firstParty: true,
      load: async () => document.createElement('div'),
    }];
    await panel.updateComplete;
    await panel.updateComplete;
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/shared/tool-panel/tool-panel.css')).text());
    panel.shadowRoot.adoptedStyleSheets = [...panel.shadowRoot.adoptedStyleSheets, sheet];
    const toolbar = panel.shadowRoot.querySelector('.tool-panel-toolbar');
    panel.style.width = '499px';
    expect(getComputedStyle(toolbar).display).to.equal('none');
    panel.style.width = '500px';
    expect(getComputedStyle(toolbar).display).to.equal('none');
  });

  it('opens the block pop-out without switching or reloading the sidebar', async () => {
    let opened = 0;
    const content = document.createElement('div');
    panel.pendingView = 'blocks';
    panel.views = [{
      id: 'blocks',
      label: 'Blocks',
      experience: 'inline',
      load: async () => content,
      openModal: () => { opened += 1; },
    }];
    await panel.updateComplete;
    await panel.updateComplete;
    const item = panel._pickerItemsFromViews().find((candidate) => candidate.value === 'blocks');
    expect(item.action).to.equal(undefined);
    panel.shadowRoot.querySelector('.tool-panel-header .tool-panel-popout').click();
    expect(opened).to.equal(1);
    expect(panel.activeId).to.equal('blocks');
    expect(panel._loaded.blocks).to.equal(content);
  });

  it('opens and closes the assets modal while retaining the sidebar and its state', async () => {
    const content = document.createElement('div');
    let close;
    panel.pendingView = 'aem-assets-panel';
    panel.views = [{
      id: 'aem-assets-panel',
      label: 'AEM Assets',
      experience: 'inline',
      load: async () => content,
      loadModal: async (body, onClose) => {
        body.textContent = 'Asset selector';
        close = onClose;
      },
    }];
    await panel.updateComplete;
    await panel.updateComplete;
    panel.shadowRoot.querySelector('.tool-panel-header .tool-panel-popout').click();
    await panel.updateComplete;
    await nextTask();
    const dialog = panel.shadowRoot.querySelector('dialog');
    expect(dialog.open).to.equal(true);
    expect(dialog.textContent).to.include('Asset selector');
    close();
    dialog.dispatchEvent(new Event('close'));
    await panel.updateComplete;
    expect(panel.shadowRoot.querySelector('dialog')).to.equal(null);
    expect(panel.activeId).to.equal('aem-assets-panel');
    expect(panel._loaded['aem-assets-panel']).to.equal(content);
  });

  it('does not show a pop-out button for ordinary inline panels', async () => {
    panel.pendingView = 'files';
    panel.views = [{ id: 'files', label: 'Files', load: async () => document.createElement('div') }];
    await panel.updateComplete;
    await panel.updateComplete;
    expect(panel.shadowRoot.querySelector('.tool-panel-popout')).to.equal(null);
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

    panel.contextKey = 'example-org/site-one';
    panel.pendingView = 'configured-tool';
    panel.views = [view('["https://one.example/app"]')];
    await panel.updateComplete;
    await panel.updateComplete;

    panel.contextKey = 'example-org/site-two';
    panel.views = [view('["https://two.example/app"]')];
    await panel.updateComplete;
    await panel.updateComplete;

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

    panel.contextKey = 'example-org/site-one';
    panel.pendingView = 'configured-tool';
    panel.views = [view];
    await panel.updateComplete;
    await panel.updateComplete;

    panel.contextKey = 'example-org/site-two';
    await panel.updateComplete;
    panel.views = [{ ...view }];
    await panel.updateComplete;
    await panel.updateComplete;

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

    panel.contextKey = 'example-org/site-one';
    panel.pendingView = 'outline';
    panel.contextKey = 'example-org/site-two';
    panel.views = [view()];
    await panel.updateComplete;
    await panel.updateComplete;

    panel.views = [view()];
    await panel.updateComplete;
    await panel.updateComplete;

    expect(loadCount).to.equal(1);
  });

  it('ignores a deferred load from the previous site after a same-id view loads', async () => {
    const staleLoad = deferred();
    const staleStarted = deferred();
    const staleEl = document.createElement('div');
    staleEl.dataset.source = 'site-one';
    const currentEl = document.createElement('div');
    currentEl.dataset.source = 'site-two';

    panel.contextKey = 'example-org/site-one';
    panel.pendingView = 'configured-tool';
    panel.views = [{
      id: 'configured-tool',
      label: 'Configured tool',
      cacheKey: '["https://one.example/app"]',
      load: async () => {
        staleStarted.resolve();
        return staleLoad.promise;
      },
    }];
    await staleStarted.promise;

    panel.contextKey = 'example-org/site-two';
    panel.pendingView = 'configured-tool';
    panel.views = [{
      id: 'configured-tool',
      label: 'Configured tool',
      cacheKey: '["https://two.example/app"]',
      load: async () => currentEl,
    }];
    await panel.updateComplete;
    await nextTask();
    await panel.updateComplete;
    expect(panel._loaded['configured-tool']).to.equal(currentEl);

    staleLoad.resolve(staleEl);
    await nextTask();
    await panel.updateComplete;

    expect(panel._loaded['configured-tool']).to.equal(currentEl);
    expect(panel.activeId).to.equal('configured-tool');
    expect(panel.shadowRoot.querySelector('.tool-panel-content').contains(currentEl)).to.be.true;
    expect(panel.shadowRoot.querySelector('.tool-panel-content').contains(staleEl)).to.be.false;
  });

  it('ignores a deferred load after its view is removed', async () => {
    const staleLoad = deferred();
    const staleStarted = deferred();
    const staleEl = document.createElement('div');

    panel.contextKey = 'example-org/site-one';
    panel.pendingView = 'configured-tool';
    panel.views = [{
      id: 'configured-tool',
      label: 'Configured tool',
      cacheKey: '["https://one.example/app"]',
      load: async () => {
        staleStarted.resolve();
        return staleLoad.promise;
      },
    }];
    await staleStarted.promise;

    panel.contextKey = '';
    panel.views = [];
    await panel.updateComplete;
    await nextTask();

    staleLoad.resolve(staleEl);
    await nextTask();
    await panel.updateComplete;

    expect(panel._loaded['configured-tool']).to.be.undefined;
    expect(panel.activeId).to.be.undefined;
    expect(panel.shadowRoot.querySelector('.tool-panel-content').contains(staleEl)).to.be.false;
  });
});
