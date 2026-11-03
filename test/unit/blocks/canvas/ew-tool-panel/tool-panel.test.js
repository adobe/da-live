/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { TOOL_PANEL_PINNED_VIEWS_KEY } from '../../../../../blocks/canvas/utils/panel.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

before(async () => {
  await import('../../../../../blocks/canvas/ew-tool-panel/tool-panel.js');
});

// The element is used detached (never appended), so Lit never runs an update
// cycle — we call the changed methods directly. The 'modal' branch of showPanel
// returns before touching the shadow root, so this stays safe without rendering.
function createPanel(views) {
  const el = document.createElement('ew-tool-panel');
  el.views = views;
  return el;
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

const nextTask = () => new Promise((resolve) => { setTimeout(resolve); });

describe('EwToolPanel — modal experience', () => {
  describe('_pickerItemsFromViews', () => {
    it('marks a modal view as an external-opening action item', () => {
      const el = createPanel([
        { id: 'blocks', label: 'Blocks', section: 'Library', experience: 'modal' },
      ]);
      const item = el._pickerItemsFromViews().find((i) => i.value === 'blocks');
      expect(item.action).to.be.true;
      expect(item.trailingIcon).to.exist;
      expect(item.ariaLabel).to.equal('Blocks (opens in dialog)');
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

describe('EwToolPanel pinned panels', () => {
  let el;
  let savedPins;
  let loads;
  let views;

  beforeEach(async () => {
    savedPins = sessionStorage.getItem(TOOL_PANEL_PINNED_VIEWS_KEY);
    sessionStorage.removeItem(TOOL_PANEL_PINNED_VIEWS_KEY);
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
    el = document.createElement('ew-tool-panel');
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
  const pin = async () => {
    el.shadowRoot.querySelector('.tool-panel-pin').click();
    await el.updateComplete;
  };

  it('moves the active option into a focused tab without reloading its content', async () => {
    const content = el._loaded.files;
    await pin();
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['files']);
    expect(tabs()[0].getAttribute('aria-pressed')).to.equal('true');
    expect(el.shadowRoot.activeElement).to.equal(tabs()[0]);
    expect(pickerValues()).to.deep.equal(['blocks', 'assets']);
    expect(el._pickerItemsFromViews()[0]).to.deep.equal({ section: 'Library' });
    expect(el.shadowRoot.querySelector('nx-picker').value).to.equal(undefined);
    expect(el.shadowRoot.querySelector('.tool-panel-pin')).to.equal(null);
    expect(el.activeId).to.equal('files');
    expect(el._loaded.files).to.equal(content);
    expect(loads).to.deep.equal(['files']);
  });

  it('keeps multiple pins in pinning order and switches tabs without losing panel state', async () => {
    await pin();
    await el.showPanel('blocks');
    await el.updateComplete;
    await pin();
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['files', 'blocks']);
    expect(pickerValues()).to.deep.equal(['assets']);
    tabs()[0].click();
    await el.updateComplete;
    expect(el.activeId).to.equal('files');
    expect(el._loaded.files.value).to.equal('files state');
    expect(el._loaded.blocks.hidden).to.equal(true);
    expect(loads).to.deep.equal(['files', 'blocks']);
    expect(tabs().map((button) => button.getAttribute('aria-pressed'))).to.deep.equal(['true', 'false']);
    el.shadowRoot.querySelector('nx-picker').dispatchEvent(new CustomEvent('change', { detail: { value: 'assets' } }));
    await el.updateComplete;
    await nextTask();
    await el.updateComplete;
    expect(el.activeId).to.equal('assets');
    expect(tabs().every((button) => button.getAttribute('aria-pressed') === 'false')).to.equal(true);
    await pin();
    expect(tabs()).to.have.lengthOf(3);
    expect(el._pickerItemsFromViews()).to.deep.equal([]);
    expect(el.shadowRoot.querySelector('nx-picker').getAttribute('placeholder')).to.equal('Panels');
  });

  it('keeps the pop-out action available for a pinned panel', async () => {
    let opened = 0;
    el.views = [{ ...views[0], openModal: () => { opened += 1; } }, ...views.slice(1)];
    await el.updateComplete;
    await pin();
    el.shadowRoot.querySelector('.tool-panel-popout').click();
    expect(opened).to.equal(1);
    expect(el.activeId).to.equal('files');
    expect(tabs()).to.have.lengthOf(1);
  });

  it('unpins the active tab back into the selector without changing the open panel', async () => {
    await pin();
    el.shadowRoot.querySelector('.tool-panel-unpin').click();
    await el.updateComplete;
    expect(tabs()).to.have.lengthOf(0);
    expect(pickerValues()).to.deep.equal(['files', 'blocks', 'assets']);
    expect(el.activeId).to.equal('files');
    expect(el.shadowRoot.querySelector('nx-picker').value).to.equal('files');
    expect(el.shadowRoot.activeElement).to.equal(el.shadowRoot.querySelector('.tool-panel-pin'));
  });

  it('offers one right-side unpin action for the selected tab only', async () => {
    await pin();
    await el.showPanel('blocks');
    await el.updateComplete;
    await pin();
    expect(el.shadowRoot.querySelectorAll('.tool-panel-unpin')).to.have.lengthOf(1);
    expect(el.shadowRoot.querySelector('.tool-panel-tabs .tool-panel-unpin')).to.equal(null);
    expect(el.shadowRoot.querySelector('.tool-panel-unpin').getAttribute('aria-label'))
      .to.equal('Unpin blocks');
    el.shadowRoot.querySelector('.tool-panel-unpin').click();
    await el.updateComplete;
    expect(el.activeId).to.equal('blocks');
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['files']);
    expect(pickerValues()).to.deep.equal(['blocks', 'assets']);
    expect(el.shadowRoot.activeElement).to.equal(el.shadowRoot.querySelector('.tool-panel-pin'));
  });

  it('restores pins on remount and hides unavailable pins without forgetting them', async () => {
    await pin();
    el.remove();
    el = document.createElement('ew-tool-panel');
    el.pendingView = 'files';
    el.views = views;
    document.body.append(el);
    await el.updateComplete;
    await el.updateComplete;
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['files']);
    el.views = views.filter((view) => view.id !== 'files');
    await el.updateComplete;
    await el.updateComplete;
    expect(tabs()).to.have.lengthOf(0);
    expect(pickerValues()).to.deep.equal(['blocks', 'assets']);
    el.views = views;
    await el.updateComplete;
    expect(tabs().map((button) => button.textContent)).to.deep.equal(['files']);
  });

  it('restores the right-side unpin action only when a pinned tab is selected', async () => {
    await pin();
    el.remove();
    el = document.createElement('ew-tool-panel');
    el.pendingView = 'files';
    el.views = views;
    document.body.append(el);
    await el.updateComplete;
    await el.updateComplete;
    const unpin = el.shadowRoot.querySelector('.tool-panel-unpin');
    expect(el.shadowRoot.activeElement).to.equal(null);
    expect(unpin).not.to.equal(null);
    expect(unpin.querySelector('use').getAttribute('href'))
      .to.equal('/img/icons/s2-icon-pinoff-20-n.svg#icon');
    expect(unpin.nextElementSibling.classList.contains('tool-panel-close')).to.equal(true);
    expect(el.shadowRoot.querySelector('.tool-panel-tabs button use')).to.equal(null);
    await el.showPanel('blocks');
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.tool-panel-unpin')).to.equal(null);
    expect(el.shadowRoot.querySelector('.tool-panel-pin').getAttribute('aria-label'))
      .to.equal('Pin blocks');
  });

  it('keeps dialog and new-tab actions in the dropdown instead of pinning them', async () => {
    for (const experience of ['modal', 'fullsize-dialog', 'window']) {
      const panel = createPanel([{ id: 'external', label: 'External', experience }]);
      await panel._togglePin('external');
      expect(panel._pinnedIds).to.deep.equal([]);
      expect(panel._pickerItemsFromViews().map((i) => i.value)).to.deep.equal(['external']);
    }
  });
});

describe('EwToolPanel — loaded view cache', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('ew-tool-panel');
    document.body.append(el);
    await el.updateComplete;
  });

  afterEach(() => el.remove());

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
    const button = el.shadowRoot.querySelector('.tool-panel-popout');
    expect(button.getAttribute('aria-haspopup')).to.equal('dialog');
    button.click();
    expect(opened).to.equal(1);
    expect(el.activeId).to.equal('blocks');
    expect(el._loaded.blocks).to.equal(content);
  });

  it('opens and closes the assets modal while retaining the sidebar and its state', async () => {
    const content = document.createElement('div');
    let close;
    el.pendingView = 'assets';
    el.views = [{
      id: 'assets',
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
    el.shadowRoot.querySelector('.tool-panel-popout').click();
    await el.updateComplete;
    await nextTask();
    const dialog = el.shadowRoot.querySelector('dialog');
    expect(dialog.open).to.equal(true);
    expect(dialog.textContent).to.include('Asset selector');
    close();
    dialog.dispatchEvent(new Event('close'));
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('dialog')).to.equal(null);
    expect(el.activeId).to.equal('assets');
    expect(el._loaded.assets).to.equal(content);
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
