/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

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
    it('passes block preselection to a modal without activating another view', async () => {
      let received;
      const el = createPanel([{
        id: 'blocks',
        experience: 'modal',
        openModal: async (options) => { received = options; },
      }]);
      el.activeId = 'quick-block';
      const options = { blockPath: 'https://example.com/library/cards' };
      await el.showPanel('blocks', options);
      expect(received).to.equal(options);
      expect(el.activeId).to.equal('quick-block');
    });

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

describe('EwToolPanel — loaded view cache', () => {
  let el;

  beforeEach(async () => {
    el = document.createElement('ew-tool-panel');
    document.body.append(el);
    await el.updateComplete;
  });

  afterEach(() => el.remove());

  it('delivers tab options on first load and on a cached extension without reloading it', async () => {
    const received = [];
    let loads = 0;
    el.views = [{
      id: 'quick-block',
      load: async () => {
        loads += 1;
        const extension = document.createElement('div');
        extension.setPanelOptions = (options) => received.push(options);
        return extension;
      },
    }];
    el.pendingView = 'quick-block';
    el.pendingOptions = { tab: 'assets' };
    await el.updateComplete;
    await nextTask();
    expect(received).to.deep.equal([{ tab: 'assets' }]);
    await el.showPanel('quick-block', { tab: 'blocks' });
    await el.showPanel('quick-block', { tab: 'assets' });
    expect(loads).to.equal(1);
    expect(received).to.deep.equal([{ tab: 'assets' }, { tab: 'blocks' }, { tab: 'assets' }]);
  });

  it('mounts a same-id extension with navigation options when its page context changes', async () => {
    const received = [];
    const view = () => ({
      id: 'quick-block',
      cacheKey: 'quick-block-source',
      load: async () => {
        const extension = document.createElement('div');
        extension.setPanelOptions = (options) => received.push(options);
        return extension;
      },
    });
    el.contextKey = 'org/first';
    el.pendingView = 'quick-block';
    el.views = [view()];
    await el.updateComplete;
    await nextTask();
    const original = el._loaded['quick-block'];
    el.contextKey = 'org/second';
    el.pendingView = 'quick-block';
    el.pendingOptions = { tab: 'assets' };
    el.views = [view()];
    await el.updateComplete;
    await nextTask();
    expect(el._loaded['quick-block']).not.to.equal(original);
    expect(el.shadowRoot.querySelector('.tool-panel-content').firstElementChild)
      .to.equal(el._loaded['quick-block']);
    expect(received).to.deep.equal([{ tab: 'assets' }]);
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
