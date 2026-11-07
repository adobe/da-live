/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx } from '../../../../../scripts/utils.js';
import {
  TOOL_PANEL_PINNED_VIEWS_KEY,
  persistPinnedToolPanelViews,
  readPinnedToolPanelViews,
} from '../../../../../blocks/canvas/utils/panel.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

before(async () => {
  await import('../../../../../blocks/shared/tool-panel/tool-panel.js');
});

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

/**
 * Replaces the resize observer and animation frames with versions the test
 * triggers because background tabs render no frames.
 */
function stubResizeFrames() {
  const { ResizeObserver, requestAnimationFrame, cancelAnimationFrame } = window;
  const originals = { ResizeObserver, requestAnimationFrame, cancelAnimationFrame };
  const callbacks = new Set();
  window.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
    }

    observe() {
      callbacks.add(this.callback);
    }

    disconnect() {
      callbacks.delete(this.callback);
    }
  };
  window.requestAnimationFrame = (callback) => setTimeout(callback);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  return {
    resize: () => callbacks.forEach((callback) => callback([])),
    restore: () => Object.assign(window, originals),
  };
}

describe('DaToolPanel — modal experience', () => {
  describe('views menu rows', () => {
    let panel;

    const renderPanel = async (view) => {
      panel = createPanel([
        { id: 'files', label: 'Files', load: async () => document.createElement('div') },
        view,
      ]);
      document.body.append(panel);
      await panel.updateComplete;
      await panel.updateComplete;
      return {
        item: panel.shadowRoot.querySelector(`.tool-panel-menu-item[data-view-id="${view.id}"]`),
        pin: panel.shadowRoot.querySelector(`.tool-panel-menu-pin[data-view-id="${view.id}"]`),
      };
    };
    const iconOf = (item) => item.querySelector('use')?.getAttribute('href');

    afterEach(() => panel?.remove());

    ['modal', 'fullsize-dialog'].forEach((experience) => {
      it(`marks a ${experience} view as a dialog action with the fullscreen icon`, async () => {
        const { item, pin } = await renderPanel({ id: 'blocks', label: 'Blocks', experience });
        expect(iconOf(item)).to.equal('/img/icons/s2-icon-fullscreen-20-n.svg#icon');
        expect(item.getAttribute('aria-label')).to.equal('Blocks (opens in dialog)');
        expect(!!pin).to.be.false;
      });
    });

    it('keeps the external-link icon for views that open in a new tab', async () => {
      const { item, pin } = await renderPanel({ id: 'external', label: 'External', experience: 'window' });
      expect(iconOf(item)).to.equal('/img/icons/s2-icon-openin-20-n.svg#icon');
      expect(item.getAttribute('aria-label')).to.equal('External (opens in new tab)');
      expect(!!pin).to.be.false;
    });

    it('gives a plain inline view a pin toggle and no icon', async () => {
      const load = async () => document.createElement('div');
      const { item, pin } = await renderPanel({ id: 'outline', label: 'Outline', experience: 'inline', load });
      expect(!!iconOf(item)).to.be.false;
      expect(item.hasAttribute('aria-label')).to.be.false;
      expect(pin.getAttribute('aria-label')).to.equal('Pin Outline');
      expect(pin.getAttribute('aria-checked')).to.equal('false');
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
  const canvasPins = {
    readPinnedViews: readPinnedToolPanelViews,
    persistPinnedViews: persistPinnedToolPanelViews,
  };
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
    panel.host = canvasPins;
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

  const tabs = () => [...panel.shadowRoot.querySelectorAll('.tool-panel-tabs .tool-panel-tab')];
  const menu = () => panel.shadowRoot.querySelector('.tool-panel-views-menu');
  const menuItem = (id) => panel.shadowRoot.querySelector(`.tool-panel-menu-item[data-view-id="${id}"]`);
  const pinToggle = (id) => panel.shadowRoot.querySelector(`.tool-panel-menu-pin[data-view-id="${id}"]`);
  const menuIds = () => [...panel.shadowRoot.querySelectorAll('.tool-panel-menu-item')]
    .map((item) => item.dataset.viewId);
  const pinnedMenuIds = () => [...panel.shadowRoot.querySelectorAll('.tool-panel-menu-pin[aria-checked="true"]')]
    .map((pin) => pin.dataset.viewId);
  const settle = async () => {
    await panel.updateComplete;
    await nextTask();
    await panel.updateComplete;
  };
  const select = async (id, selected = true) => {
    const target = selected ? menuItem(id) : pinToggle(id);
    target.click();
    await settle();
  };
  const adoptPanelStyles = async () => {
    const sheet = new CSSStyleSheet();
    await sheet.replace(await (await fetch('/blocks/shared/tool-panel/tool-panel.css')).text());
    panel.shadowRoot.adoptedStyleSheets = [...panel.shadowRoot.adoptedStyleSheets, sheet];
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
    const pinned = [...panel._pinnedIds];

    await panel.showPanel('assets', { modal: true });
    await panel.updateComplete;
    await nextTask();

    const dialog = panel.shadowRoot.querySelector('.tool-panel-fullsize-dialog');
    expect(dialog.open).to.be.true;
    expect(loadModal.calledOnce).to.be.true;
    expect(loadModal.firstCall.args[0]).to.equal(dialog.querySelector('.tool-panel-fullsize-dialog-body'));
    expect(loads).to.deep.equal(['files']);
    expect(panel.activeId).to.equal('files');
    expect(panel._pinnedIds).to.deep.equal(pinned);
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
    expect(menuIds()).to.deep.equal(['files', 'blocks', 'assets']);
    source.dispatchEvent(dragEvent('dragstart', transfer));
    last.dispatchEvent(dragEvent('drop', transfer, end));
    await panel.updateComplete;
    panel.remove();
    panel = document.createElement('da-tool-panel');
    panel.host = canvasPins;
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

  it('uses a rounded drag preview with transparent corners and removes it when dragging ends', async () => {
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
    const preview = panel.shadowRoot.querySelector('.drag-preview');
    const context = preview.getContext('2d');
    expect(context.getImageData(0, 0, 1, 1).data[3]).to.equal(0);
    const middle = Math.floor(preview.width / 2);
    expect(context.getImageData(middle, 1, 1, 1).data[3]).to.equal(255);
    source.dispatchEvent(dragEvent('dragend', transfer));
    expect(panel.shadowRoot.querySelector('.drag-preview')).to.equal(null);
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

  it('collapses the tabs into a switcher when they do not fit and restores them when they do', async () => {
    const frames = stubResizeFrames();
    panel.remove();
    document.body.append(panel);
    await panel.updateComplete;
    await adoptPanelStyles();
    panel.style.width = '600px';
    panel.style.height = '300px';
    await pinAll();
    const resize = async (width) => {
      panel.style.width = width;
      frames.resize();
      await nextTask();
      await panel.updateComplete;
    };
    const switcher = () => panel.shadowRoot.querySelector('.tool-panel-switcher');
    try {
      expect(tabs()).to.have.lengthOf(3);
      expect(!!switcher()).to.be.false;
      expect(menu().trigger.getAttribute('aria-label')).to.equal('All panels');

      await resize('120px');
      expect(tabs()).to.have.lengthOf(0);
      expect(switcher().textContent.trim()).to.equal('assets');
      expect(menu().trigger).to.equal(switcher());
      expect(menu().placement).to.equal('below');
      expect(pinnedMenuIds()).to.deep.equal(['files', 'blocks', 'assets']);
      expect(!!panel.shadowRoot.querySelector('.tool-panel-menu-hint')).to.be.false;

      await select('blocks', false);
      await select('assets', false);
      expect(tabs()).to.have.lengthOf(1);
      expect(!!switcher()).to.be.false;

      await select('blocks');
      await select('assets');
      await resize('120px');
      expect(!!switcher()).to.be.true;
      await resize('600px');
      expect(tabs().map((button) => button.dataset.viewId)).to.deep.equal(['files', 'blocks', 'assets']);
      expect(menu().placement).to.equal('below');
    } finally {
      frames.restore();
    }
  });

  it('keeps drag reordering working once the tabs fit again', async () => {
    const frames = stubResizeFrames();
    panel.remove();
    document.body.append(panel);
    await panel.updateComplete;
    await adoptPanelStyles();
    panel.style.width = '120px';
    await pinAll();
    try {
      frames.resize();
      await panel.updateComplete;
      expect(tabs()).to.have.lengthOf(0);
      panel.style.width = '600px';
      frames.resize();
      await panel.updateComplete;
      const transfer = new DataTransfer();
      tabs()[0].dispatchEvent(dragEvent('dragstart', transfer));
      const last = tabs()[2].parentElement;
      last.dispatchEvent(dragEvent('drop', transfer, last.getBoundingClientRect().right - 1));
      await panel.updateComplete;
      expect(tabs().map((button) => button.dataset.viewId)).to.deep.equal(['blocks', 'assets', 'files']);
      expect(pinnedMenuIds()).to.deep.equal(['blocks', 'assets', 'files']);
    } finally {
      frames.restore();
    }
  });

  it('marks the dragged tab and tells in the menu that pinned tabs drag to reorder', async () => {
    const viewsArea = () => panel.shadowRoot.querySelector('.tool-panel-views');
    const hint = () => panel.shadowRoot.querySelector('.tool-panel-menu-hint');
    const nav = () => panel.shadowRoot.querySelector('.tool-panel-tabs');
    expect(viewsArea().hasAttribute('data-reorderable')).to.be.false;
    expect(!!hint()).to.be.false;

    await pinAll();
    expect(viewsArea().hasAttribute('data-reorderable')).to.be.true;
    expect(hint().textContent).to.equal('Drag tabs to reorder');
    expect(hint().parentElement.getAttribute('aria-label')).to.equal('Pinned');

    const transfer = new DataTransfer();
    tabs()[1].dispatchEvent(dragEvent('dragstart', transfer));
    await panel.updateComplete;
    expect(nav().hasAttribute('data-dragging')).to.be.true;
    expect(tabs().map((tab) => tab.parentElement.hasAttribute('data-dragged')))
      .to.deep.equal([false, true, false]);

    tabs()[1].dispatchEvent(dragEvent('dragend', transfer));
    await panel.updateComplete;
    expect(nav().hasAttribute('data-dragging')).to.be.false;
    expect(tabs().some((tab) => tab.parentElement.hasAttribute('data-dragged'))).to.be.false;
  });

  it('mirrors the open menu on its trigger and closes it once a view is picked', async () => {
    const { trigger } = menu();
    expect(trigger.getAttribute('aria-haspopup')).to.equal('menu');
    expect(trigger.getAttribute('aria-expanded')).to.equal('false');
    trigger.click();
    await settle();
    expect(menu().open).to.be.true;
    expect(trigger.getAttribute('aria-expanded')).to.equal('true');
    await select('blocks');
    expect(menu().open).to.be.false;
    expect(trigger.getAttribute('aria-expanded')).to.equal('false');
  });

  it('lists pinned views in tab order before the other views and marks the active one', async () => {
    await select('assets');
    await select('blocks');
    const groups = [...panel.shadowRoot.querySelectorAll('.tool-panel-menu-group')];
    expect(groups.map((group) => group.getAttribute('aria-label'))).to.deep.equal(['Pinned']);
    expect(menuIds()).to.deep.equal(['files', 'assets', 'blocks']);
    await select('files', false);
    expect(menuIds()).to.deep.equal(['assets', 'blocks', 'files']);
    expect([...panel.shadowRoot.querySelectorAll('.tool-panel-menu-group')]
      .map((group) => group.getAttribute('aria-label'))).to.deep.equal(['Pinned', 'More panels']);
    expect(menuItem('blocks').getAttribute('aria-current')).to.equal('true');
    expect(menuItem('assets').hasAttribute('aria-current')).to.be.false;
  });

  it('pins from the menu without switching and keeps the menu open', async () => {
    menu().trigger.click();
    await settle();
    pinToggle('blocks').click();
    await settle();
    expect(panel.activeId).to.equal('files');
    expect(tabs().map((button) => button.dataset.viewId)).to.deep.equal(['files', 'blocks']);
    expect(pinToggle('blocks').getAttribute('aria-checked')).to.equal('true');
    expect(pinToggle('blocks').title).to.equal('Unpin');
    expect(menu().open).to.be.true;
    expect(panel.shadowRoot.activeElement).to.equal(pinToggle('blocks'));
    expect(JSON.parse(sessionStorage.getItem(TOOL_PANEL_PINNED_VIEWS_KEY)))
      .to.deep.equal(['files', 'blocks']);
  });

  it('keeps the last pinned view pinned', async () => {
    const pin = pinToggle('files');
    expect(pin.getAttribute('aria-disabled')).to.equal('true');
    await select('files', false);
    expect(panel._pinnedIds).to.deep.equal(['files']);
    expect(pinToggle('files').getAttribute('aria-checked')).to.equal('true');
    await select('blocks');
    expect(pinToggle('files').hasAttribute('aria-disabled')).to.be.false;
  });

  it('opens Files and Outline as default tabs in a new session', async () => {
    panel.remove();
    sessionStorage.removeItem(TOOL_PANEL_PINNED_VIEWS_KEY);
    panel = document.createElement('da-tool-panel');
    panel.host = canvasPins;
    panel.pendingView = 'outline';
    panel.views = [...views, { ...views[0], id: 'outline', label: 'Outline' }];
    document.body.append(panel);
    await panel.updateComplete;
    await panel.updateComplete;
    expect(tabs().map((button) => button.dataset.viewId)).to.deep.equal(['files', 'outline']);
    expect(panel.activeId).to.equal('outline');
    expect(pinnedMenuIds()).to.deep.equal(['files', 'outline']);
    expect(menu().label).to.equal('Panels');
    expect(menu().trigger.getAttribute('aria-label')).to.equal('All panels');
  });

  it('opens selections as tabs and switches between them without losing panel state', async () => {
    await select('blocks');
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['files', 'blocks']);
    expect(panel.activeId).to.equal('blocks');
    expect(menuIds()).to.deep.equal(['files', 'blocks', 'assets']);
    expect(pinnedMenuIds()).to.deep.equal(['files', 'blocks']);
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
    expect(pinnedMenuIds()).to.deep.equal(['files', 'blocks', 'assets']);
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
      expect(pinnedMenuIds()).to.deep.equal(['files', id]);
      panel.shadowRoot.querySelector('.tool-panel-fullsize-dialog-close')?.click();
      await panel.showPanel('files');
      await panel.updateComplete;
      expect(panel.shadowRoot.querySelector('.tool-panel-popout')).to.equal(null);
    });
  });

  it('opens and restores more than four selected tabs', async () => {
    await adoptPanelStyles();
    panel.style.width = '280px';
    panel.style.height = '300px';
    panel.views = [
      ...views,
      ...['outline', 'versions', 'comments'].map((id) => ({ ...views[0], id, label: id })),
    ];
    await panel.updateComplete;
    const ids = ['files', 'blocks', 'assets', 'outline', 'versions', 'comments'];
    for (const id of ids) await select(id);
    expect(tabs()).to.have.lengthOf(0);
    expect(panel.shadowRoot.querySelector('.tool-panel-switcher').textContent.trim()).to.equal('comments');
    expect(pinnedMenuIds()).to.deep.equal(ids);
    expect(panel.activeId).to.equal('comments');
    expect(JSON.parse(sessionStorage.getItem(TOOL_PANEL_PINNED_VIEWS_KEY)))
      .to.deep.equal(ids);
    const savedViews = panel.views;
    panel.remove();
    panel = document.createElement('da-tool-panel');
    panel.host = canvasPins;
    panel.pendingView = 'comments';
    panel.views = savedViews;
    document.body.append(panel);
    await panel.updateComplete;
    await panel.updateComplete;
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(ids);
    expect(pinnedMenuIds()).to.deep.equal(ids);
  });

  it('removes a deselected active tab and activates another selected panel', async () => {
    await select('blocks');
    await select('blocks', false);
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(['files']);
    expect(menuIds()).to.deep.equal(['files', 'blocks', 'assets']);
    expect(panel.activeId).to.equal('files');
    expect(pinnedMenuIds()).to.deep.equal(['files']);
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
    expect(pinnedMenuIds()).to.deep.equal(['files']);
    expect(panel.activeId).to.equal('files');
  });

  it('restores pins on remount and hides unavailable pins without forgetting them', async () => {
    await select('assets');
    panel.remove();
    panel = document.createElement('da-tool-panel');
    panel.host = canvasPins;
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
    expect(menuIds()).to.deep.equal(['files', 'blocks']);
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
    await select('modal');
    expect(opened).to.equal(1);
    expect(panel.activeId).to.equal('files');
    expect(tabs().map((tab) => tab.dataset.viewId)).to.deep.equal(['files']);
    expect(pinnedMenuIds()).to.deep.equal(['files']);
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
    const views = header.querySelector('.tool-panel-views');
    const menuButton = views.querySelector('.tool-panel-menu-button');
    const divider = header.querySelector('.tool-panel-divider').getBoundingClientRect();
    const close = header.querySelector('.tool-panel-close').getBoundingClientRect();
    expect(views.nextElementSibling.classList.contains('tool-panel-divider')).to.be.true;
    expect(menuButton.getAttribute('aria-label')).to.equal('All panels');
    expect(menuButton.getBoundingClientRect().right).to.be.at.most(divider.left);
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
    const item = panel.shadowRoot.querySelector('.tool-panel-menu-item[data-view-id="blocks"]');
    expect(item.hasAttribute('aria-label')).to.be.false;
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

describe('DaToolPanel — host delegate', () => {
  let panel;

  const inlineView = (id) => ({
    id,
    label: id,
    load: async () => document.createElement('div'),
  });

  async function settle() {
    await panel.updateComplete;
    await nextTask();
    await panel.updateComplete;
  }

  beforeEach(async () => {
    panel = document.createElement('da-tool-panel');
    document.body.append(panel);
    await panel.updateComplete;
  });

  afterEach(() => panel.remove());

  const menuLabels = () => [...panel.shadowRoot.querySelectorAll('.tool-panel-menu-item')]
    .map((item) => item.textContent.trim());

  function viewWithDynamicLabel(label) {
    const view = {
      ...inlineView('comments'),
      label,
      unsubscribed: 0,
      getLabel: () => view.label,
      subscribeLabel: (onChange) => {
        view.changeLabel = (next) => {
          view.label = next;
          onChange();
        };
        return () => { view.unsubscribed += 1; };
      },
    };
    return view;
  }

  it('re-renders the tabs and menu when a view label changes', async () => {
    const view = viewWithDynamicLabel('Comments');
    panel.views = [view];
    await settle();

    view.changeLabel('Comments (2)');
    await panel.updateComplete;

    expect(menuLabels()).to.deep.equal(['Comments (2)']);
    expect(panel.shadowRoot.querySelector('.tool-panel-tabs .tool-panel-tab').textContent).to.equal('Comments (2)');
  });

  it('drops label subscriptions once disconnected', async () => {
    const view = viewWithDynamicLabel('Comments');
    panel.views = [view];
    await settle();

    panel.remove();

    expect(view.unsubscribed).to.equal(1);
  });

  it('drops label subscriptions of replaced views', async () => {
    const view = viewWithDynamicLabel('Comments');
    panel.views = [view];
    await settle();

    panel.views = [inlineView('outline')];
    await settle();

    expect(view.unsubscribed).to.equal(1);
  });

  it('tells the host about every view that becomes active', async () => {
    const persisted = [];
    panel.host = { persistView: (id) => persisted.push(id) };
    panel.views = [inlineView('outline'), inlineView('files')];
    await settle();

    await panel.showPanel('files');
    await panel.updateComplete;

    expect(persisted).to.deep.equal(['outline', 'files']);
  });

  it('opens the host initial view with the panel context', async () => {
    let received;
    panel.host = {
      resolveInitialView: async (args) => {
        received = args;
        return 'blocks';
      },
    };
    panel.org = 'acme';
    panel.site = 'web';

    panel.views = [inlineView('outline'), inlineView('blocks')];
    await settle();

    expect(panel.activeId).to.equal('blocks');
    expect(received.org).to.equal('acme');
    expect(received.site).to.equal('web');
    expect([...received.availableIds]).to.deep.equal(['outline', 'blocks']);
  });

  it('falls back to the first view without a host initial view', async () => {
    panel.views = [inlineView('outline'), inlineView('files')];
    await settle();

    expect(panel.activeId).to.equal('outline');
  });

  it('pins only the opened view without host pinned views', async () => {
    panel.views = [inlineView('outline'), inlineView('files')];
    await settle();

    expect(panel._pinnedIds).to.deep.equal(['outline']);
  });

  it('opens the first host pinned view', async () => {
    panel.host = { readPinnedViews: () => ['files'] };

    panel.views = [inlineView('outline'), inlineView('files')];
    await settle();

    expect(panel.activeId).to.equal('files');
  });

  it('tells the host about new pins', async () => {
    const persisted = [];
    panel.host = {
      readPinnedViews: () => ['files'],
      persistPinnedViews: (ids) => persisted.push(ids),
    };
    panel.views = [inlineView('outline'), inlineView('files')];
    await settle();

    await panel.showPanel('outline');

    expect(persisted).to.deep.equal([['files', 'outline']]);
  });

  describe('setContext', () => {
    const CONTEXT = { org: 'acme', site: 'web' };

    function hostWith(ids) {
      const calls = [];
      return {
        calls,
        getViews: async (context) => {
          calls.push(context);
          return ids.map(inlineView);
        },
      };
    }

    it('loads the host views and shows the requested view', async () => {
      panel.host = hostWith(['outline', 'files']);

      await panel.setContext(CONTEXT, 'files');
      await settle();

      expect(panel.host.calls).to.deep.equal([CONTEXT]);
      expect(panel.contextKey).to.equal('acme/web');
      expect(panel.activeId).to.equal('files');
    });

    it('keeps the views of an unchanged context and still shows the requested view', async () => {
      panel.host = hostWith(['outline', 'files']);
      await panel.setContext(CONTEXT);
      await settle();

      await panel.setContext(CONTEXT, 'files');
      await settle();

      expect(panel.host.calls.length).to.equal(1);
      expect(panel.activeId).to.equal('files');
    });

    it('clears the views without an org and site', async () => {
      panel.host = hostWith(['outline']);
      await panel.setContext(CONTEXT);
      await settle();

      await panel.setContext({});
      await settle();

      expect(panel.host.calls.length).to.equal(1);
      expect(panel.org === undefined).to.be.true;
      expect(panel.views).to.deep.equal([]);
    });

    it('lets the newest context win when views resolve out of order', async () => {
      const oldViews = deferred();
      const getViews = async ({ site }) => (site === 'old' ? oldViews.promise : [inlineView('new')]);
      panel.host = { getViews };

      const oldContextLoad = panel.setContext({ org: 'acme', site: 'old' });
      await panel.setContext(CONTEXT);
      oldViews.resolve([inlineView('old')]);
      await oldContextLoad;
      await settle();

      expect(panel.views.map((view) => view.id)).to.deep.equal(['new']);
    });

    describe('with a modal view', () => {
      const modalView = (loadModal) => ({ ...inlineView('assets'), loadModal });

      function heldViews() {
        const pending = {};
        panel.host = {
          getViews: ({ site }) => {
            pending[site] = deferred();
            return pending[site].promise;
          },
        };
        return pending;
      }

      it('waits for the in-flight load before opening the modal', async () => {
        const loadModal = sinon.spy();
        const pending = heldViews();
        const loading = panel.setContext(CONTEXT);
        const opening = panel.setContext(CONTEXT, 'assets', { modal: true });
        await nextTask();
        expect(panel._fullsizeDialogViewId === undefined).to.be.true;

        pending.web.resolve([inlineView('files'), modalView(loadModal)]);
        await Promise.all([loading, opening]);
        await settle();

        expect(panel._fullsizeDialogViewId).to.equal('assets');
        expect(loadModal.calledOnce).to.be.true;
        expect(panel.activeId).to.equal('files');
        expect(panel._pinnedIds).to.deep.equal(['files']);
      });

      it('drops the modal request when a newer context supersedes its load', async () => {
        const loadModal = sinon.spy();
        const pending = heldViews();
        const opening = panel.setContext({ org: 'acme', site: 'first' }, 'assets', { modal: true });
        const second = panel.setContext({ org: 'acme', site: 'second' });
        pending.second.resolve([modalView(loadModal)]);
        await second;
        pending.first.resolve([modalView(loadModal)]);
        await opening;
        await settle();

        expect(panel.site).to.equal('second');
        expect(panel._fullsizeDialogViewId === undefined).to.be.true;
        expect(loadModal.called).to.be.false;
      });

      it('does not reuse a superseded load when the context switches back', async () => {
        const loadModal = sinon.spy();
        const pending = heldViews();
        const opening = panel.setContext({ org: 'acme', site: 'first' }, 'assets', { modal: true });
        const firstLoad = pending.first;
        const second = panel.setContext({ org: 'acme', site: 'second' });
        pending.second.resolve([modalView(loadModal)]);
        await second;
        const back = panel.setContext({ org: 'acme', site: 'first' });
        pending.first.resolve([inlineView('current')]);
        await back;
        firstLoad.resolve([modalView(loadModal)]);
        await opening;
        await settle();

        expect(panel.site).to.equal('first');
        expect(panel.views.map((view) => view.id)).to.deep.equal(['current']);
        expect(loadModal.called).to.be.false;
      });
    });

    it('retries a context whose views failed to load', async () => {
      let fail = true;
      panel.host = {
        getViews: async () => {
          if (fail) {
            throw new Error('offline');
          }
          return [inlineView('files')];
        },
      };

      const error = await panel.setContext(CONTEXT).catch((e) => e);
      fail = false;
      await panel.setContext(CONTEXT);

      expect(error.message).to.equal('offline');
      expect(panel.views.map((view) => view.id)).to.deep.equal(['files']);
    });
  });
});
