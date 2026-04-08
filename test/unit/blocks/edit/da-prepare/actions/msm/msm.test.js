/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setMergeCopy } from '../../../../../../../blocks/edit/da-prepare/actions/msm/helpers/utils.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const waitForLoad = () => new Promise((resolve) => { setTimeout(resolve, 100); });

const BASE_CONFIG = {
  msm: {
    data: [
      { base: 'mccs', satellite: '', title: 'MCCS Global' },
      { base: 'mccs', satellite: 'san-diego', title: 'San Diego' },
      { base: 'mccs', satellite: 'pendleton', title: 'Camp Pendleton' },
    ],
  },
};

function createFetchMock({ orgConfigs = {}, overrideSites = [], aemStatus } = {}) {
  return async (url, opts = {}) => {
    if (url.endsWith('.css')) {
      return new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } });
    }
    if (url.includes('/config/')) {
      for (const [org, config] of Object.entries(orgConfigs)) {
        if (url.includes(`/config/${org}`)) {
          return new Response(JSON.stringify(config), { status: 200 });
        }
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }
    if (opts.method === 'HEAD') {
      const hasOverride = overrideSites.some((site) => url.includes(`/${site}/`));
      return new Response('', { status: hasOverride ? 200 : 404 });
    }
    if (url.includes('admin.hlx.page/status/')) {
      const body = aemStatus || { preview: { status: 200 }, live: { status: 200 } };
      return new Response(JSON.stringify(body), { status: 200 });
    }
    if (url.includes('admin.hlx.page/preview/') || url.includes('admin.hlx.page/live/')) {
      if (opts.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
    }
    if (opts.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    if (opts.method === 'PUT') {
      return new Response('', { status: 201 });
    }
    if (url.includes('/source/')) {
      return new Response('<p>Base content</p>', { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };
}

describe('DaMsm component', () => {
  let savedFetch;
  let savedLocalStorage;
  let el;

  before(async () => {
    savedFetch = window.fetch;
    savedLocalStorage = window.localStorage.getItem('nx-ims');
    window.localStorage.removeItem('nx-ims');

    window.fetch = async (url) => {
      if (url.endsWith('.css')) {
        return new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } });
      }
      return new Response('{}', { status: 200 });
    };

    await import('../../../../../../../blocks/edit/da-prepare/actions/msm/msm.js');
  });

  after(() => {
    window.fetch = savedFetch;
    if (savedLocalStorage) {
      window.localStorage.setItem('nx-ims', savedLocalStorage);
    } else {
      window.localStorage.removeItem('nx-ims');
    }
  });

  afterEach(() => {
    if (el && el.parentElement) el.remove();
    el = null;
    setMergeCopy(null);
  });

  async function fixture(details, fetchMock) {
    window.fetch = fetchMock;
    el = document.createElement('da-msm');
    el.details = details;
    document.body.appendChild(el);
    await waitForLoad();
    await nextFrame();
    return el;
  }

  function makeSatellites(overrides = []) {
    return [
      { site: 'san-diego', label: 'San Diego', hasOverride: overrides.includes('san-diego'), status: undefined },
      { site: 'pendleton', label: 'Camp Pendleton', hasOverride: overrides.includes('pendleton'), status: undefined },
    ];
  }

  async function fixtureWithState(fetchMock, stateOverrides = {}) {
    window.fetch = fetchMock;
    el = document.createElement('da-msm');
    el.details = stateOverrides.details || { org: 'test', site: 'mccs', path: '/about' };
    el.loadSatellites = () => {};
    document.body.appendChild(el);
    el._loading = undefined;
    el._role = stateOverrides.role || 'base';
    el._satellites = stateOverrides.satellites || makeSatellites();
    el._selected = stateOverrides.selected || new Set();
    el._action = stateOverrides.action || 'preview';
    if (stateOverrides.baseSite) el._baseSite = stateOverrides.baseSite;
    if (stateOverrides.hasOverride !== undefined) el._hasOverride = stateOverrides.hasOverride;
    el.requestUpdate();
    await nextFrame();
    await nextFrame();
    return el;
  }

  it('is defined as a custom element', () => {
    expect(customElements.get('da-msm')).to.exist;
  });

  describe('loading', () => {
    it('resolves to base role with satellite list', async () => {
      const mock = createFetchMock({
        orgConfigs: { 'msm-load': BASE_CONFIG },
        overrideSites: ['san-diego'],
      });
      await fixture({ org: 'msm-load', site: 'mccs', path: '/about' }, mock);

      expect(el._loading).to.be.undefined;
      expect(el._role).to.equal('base');
      expect(el._satellites).to.have.length(2);
    });

    it('shows no-satellites message when config is empty', async () => {
      const mock = createFetchMock({ orgConfigs: { 'msm-empty': {} } });
      await fixture({ org: 'msm-empty', site: 'mccs', path: '/about' }, mock);

      const msg = el.shadowRoot.querySelector('.no-satellites');
      expect(msg).to.exist;
    });

    it('resolves to satellite role when site is a satellite', async () => {
      const mock = createFetchMock({ orgConfigs: { 'msm-satload': BASE_CONFIG } });
      await fixture({ org: 'msm-satload', site: 'san-diego', path: '/about' }, mock);

      expect(el._role).to.equal('satellite');
      expect(el._baseSite).to.equal('mccs');
    });
  });

  describe('rendering — base view', () => {
    it('renders inherited and custom columns', async () => {
      const mock = createFetchMock({
        orgConfigs: { 'msm-cols': BASE_CONFIG },
        overrideSites: ['san-diego'],
      });
      await fixture({ org: 'msm-cols', site: 'mccs', path: '/about' }, mock);
      await nextFrame();

      const columns = el.shadowRoot.querySelectorAll('.satellite-column');
      expect(columns.length).to.equal(2);

      const headings = [...columns].map((c) => c.querySelector('.column-heading').textContent);
      expect(headings).to.include('Inherited');
      expect(headings).to.include('Custom');
    });

    it('shows open-in-editor link only for custom sites', async () => {
      const mock = createFetchMock({
        orgConfigs: { 'msm-link': BASE_CONFIG },
        overrideSites: ['san-diego'],
      });
      await fixture({ org: 'msm-link', site: 'mccs', path: '/about' }, mock);
      await nextFrame();

      const links = el.shadowRoot.querySelectorAll('.icon-btn');
      expect(links.length).to.equal(1);
      expect(links[0].getAttribute('href')).to.include('san-diego');
    });

    it('dims out-of-scope satellites', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock, {
        satellites: makeSatellites(['san-diego']),
        action: 'preview',
      });

      const outOfScope = el.shadowRoot.querySelectorAll('.out-of-scope');
      expect(outOfScope.length).to.be.greaterThan(0);
    });

    it('renders action picker', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock);

      const picker = el.shadowRoot.querySelector('.picker-trigger');
      expect(picker).to.exist;
    });
  });

  describe('rendering — satellite view', () => {
    it('shows base site name and action pickers', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock, {
        role: 'satellite',
        baseSite: 'mccs',
        hasOverride: false,
        details: { org: 'test', site: 'san-diego', path: '/about' },
      });

      const statusLine = el.shadowRoot.querySelector('.sat-status-line');
      expect(statusLine).to.exist;
      expect(statusLine.textContent).to.include('mccs');
    });

    it('disables apply when resume-inheritance has no override', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock, {
        role: 'satellite',
        baseSite: 'mccs',
        hasOverride: false,
        action: 'resume-inheritance',
        details: { org: 'test', site: 'san-diego', path: '/about' },
      });

      const btn = el.shadowRoot.querySelector('sl-button');
      expect(btn.hasAttribute('disabled')).to.be.true;
    });
  });

  describe('selection', () => {
    it('toggles satellite selection on and off', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock);

      expect(el._selected.size).to.equal(0);
      el.handleToggle('pendleton');
      expect(el._selected.has('pendleton')).to.be.true;
      el.handleToggle('pendleton');
      expect(el._selected.has('pendleton')).to.be.false;
    });

    it('_canApply is false with no selection', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock);

      expect(el._canApply).to.be.false;
    });

    it('_canApply is true with in-scope selection', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock, { action: 'preview' });

      el.handleToggle('pendleton');
      expect(el._canApply).to.be.true;
    });

    it('_canApply is false when selection is out of scope', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock, {
        satellites: makeSatellites(['san-diego']),
        action: 'preview',
      });

      el.handleToggle('san-diego');
      expect(el._canApply).to.be.false;
    });
  });

  describe('preview action', () => {
    it('previews selected satellites and sets success', async () => {
      const calls = [];
      const base = createFetchMock({});
      const mock = async (url, opts) => {
        calls.push({ url, method: opts?.method });
        return base(url, opts);
      };
      await fixtureWithState(mock, { action: 'preview', selected: new Set(['pendleton']) });

      await el.runAction('preview');

      expect(calls.some((c) => c.url.includes('/preview/') && c.url.includes('pendleton'))).to.be.true;
      const sat = el._satellites.find((s) => s.site === 'pendleton');
      expect(sat.status).to.equal('success');
    });

    it('sets error status on failure', async () => {
      const base = createFetchMock({});
      const mock = async (url, opts) => {
        if (url.includes('admin.hlx.page/preview/')) {
          return new Response('', { status: 500 });
        }
        return base(url, opts);
      };
      await fixtureWithState(mock, { action: 'preview', selected: new Set(['pendleton']) });

      await el.runAction('preview');

      const sat = el._satellites.find((s) => s.site === 'pendleton');
      expect(sat.status).to.equal('error');
    });
  });

  describe('publish action', () => {
    it('publishes selected satellites', async () => {
      const calls = [];
      const base = createFetchMock({});
      const mock = async (url, opts) => {
        calls.push({ url, method: opts?.method });
        return base(url, opts);
      };
      await fixtureWithState(mock, { action: 'publish', selected: new Set(['pendleton']) });

      await el.runAction('publish');

      expect(calls.some((c) => c.url.includes('/live/') && c.url.includes('pendleton'))).to.be.true;
    });
  });

  describe('cancel inheritance (break) action', () => {
    it('creates override and moves satellite to custom', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock, { action: 'break', selected: new Set(['pendleton']) });

      await el.runAction('break');

      const sat = el._satellites.find((s) => s.site === 'pendleton');
      expect(sat.hasOverride).to.be.true;
      expect(sat.status).to.equal('success');
    });
  });

  describe('sync to satellite action', () => {
    it('creates override in override mode', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock, {
        satellites: makeSatellites(['san-diego']),
        action: 'sync',
        selected: new Set(['san-diego']),
      });
      el._syncMode = 'override';

      await el.runAction('sync');

      const sat = el._satellites.find((s) => s.site === 'san-diego');
      expect(sat.status).to.equal('success');
    });

    it('merges from base in merge mode', async () => {
      let mergeCalled = false;
      setMergeCopy(async () => { mergeCalled = true; return { ok: true }; });

      const mock = createFetchMock({});
      await fixtureWithState(mock, {
        satellites: makeSatellites(['san-diego']),
        action: 'sync',
        selected: new Set(['san-diego']),
      });
      el._syncMode = 'merge';

      await el.runAction('sync');

      expect(mergeCalled).to.be.true;
      const sat = el._satellites.find((s) => s.site === 'san-diego');
      expect(sat.status).to.equal('success');
    });
  });

  describe('resume inheritance (reset) action', () => {
    it('shows confirm dialog before executing', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock, {
        satellites: makeSatellites(['san-diego']),
        action: 'reset',
        selected: new Set(['san-diego']),
      });

      await el.apply();

      expect(el._confirmAction).to.exist;
      expect(el._confirmAction.message).to.include('Resume inheritance');
    });

    it('deletes override and auto-previews/publishes when live', async () => {
      const calls = [];
      const base = createFetchMock({});
      const mock = async (url, opts) => {
        calls.push({ url, method: opts?.method });
        return base(url, opts);
      };
      await fixtureWithState(mock, {
        satellites: makeSatellites(['san-diego']),
        action: 'reset',
        selected: new Set(['san-diego']),
      });

      await el.runAction('reset');

      const sat = el._satellites.find((s) => s.site === 'san-diego');
      expect(sat.hasOverride).to.be.false;
      expect(sat.status).to.equal('success');
      expect(calls.some((c) => c.url.includes('/preview/'))).to.be.true;
      expect(calls.some((c) => c.url.includes('/live/'))).to.be.true;
    });

    it('only previews when page was not published', async () => {
      const calls = [];
      const base = createFetchMock({
        aemStatus: { preview: { status: 200 }, live: { status: 404 } },
      });
      const mock = async (url, opts) => {
        calls.push({ url, method: opts?.method });
        return base(url, opts);
      };
      await fixtureWithState(mock, {
        satellites: makeSatellites(['san-diego']),
        action: 'reset',
        selected: new Set(['san-diego']),
      });

      await el.runAction('reset');

      expect(calls.some((c) => c.url.includes('/preview/'))).to.be.true;
      expect(calls.filter((c) => c.url.includes('/live/') && c.method === 'POST').length).to.equal(0);
    });
  });

  describe('post-action behavior', () => {
    it('clears selection after action completes', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock, { action: 'preview', selected: new Set(['pendleton']) });

      expect(el._selected.size).to.equal(1);
      await el.runAction('preview');
      expect(el._selected.size).to.equal(0);
    });

    it('clears statuses via clearStatuses()', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock);

      el._satellites = el._satellites.map((s) => ({ ...s, status: 'success' }));
      el.clearStatuses();

      el._satellites.forEach((s) => {
        expect(s.status).to.be.undefined;
      });
    });

    it('is not busy after action completes', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock, { action: 'preview', selected: new Set(['pendleton']) });

      await el.runAction('preview');
      expect(el._busy).to.be.false;
    });
  });

  describe('confirm dialog', () => {
    it('cancelConfirm clears the dialog', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock);

      el._confirmAction = { message: 'Test' };
      el.cancelConfirm();
      expect(el._confirmAction).to.be.undefined;
    });

    it('doConfirmedAction runs reset for base view', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock, {
        satellites: makeSatellites(['san-diego']),
        action: 'reset',
        selected: new Set(['san-diego']),
      });

      el._confirmAction = { message: 'Confirm?' };
      await el.doConfirmedAction();

      expect(el._confirmAction).to.be.undefined;
      const sat = el._satellites.find((s) => s.site === 'san-diego');
      expect(sat.hasOverride).to.be.false;
    });

    it('renders confirm box in DOM', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock);

      el._confirmAction = { message: 'Are you sure?' };
      el.requestUpdate();
      await nextFrame();
      await nextFrame();

      const box = el.shadowRoot.querySelector('.confirm-box');
      expect(box).to.exist;
      expect(box.textContent).to.include('Are you sure?');
    });
  });

  describe('picker', () => {
    it('toggles picker open and closed', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock);

      el.togglePicker('action');
      expect(el._openPicker).to.equal('action');

      el.togglePicker('action');
      expect(el._openPicker).to.be.null;
    });

    it('selectPickerOption sets value and closes picker', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock);

      el._openPicker = 'action';
      let captured;
      el.selectPickerOption('action', 'publish', (v) => { captured = v; });

      expect(captured).to.equal('publish');
      expect(el._openPicker).to.be.null;
    });

    it('closes picker on outside click', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock);

      el.togglePicker('action');
      expect(el._openPicker).to.equal('action');

      el._handleOutsidePickerClick({ composedPath: () => [] });
      expect(el._openPicker).to.be.null;
    });

    it('does not close picker on inside click', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock);

      el.togglePicker('action');
      el._handleOutsidePickerClick({ composedPath: () => [el] });
      expect(el._openPicker).to.equal('action');
    });
  });

  describe('satellite view — actions', () => {
    function satDetails() {
      return { org: 'test', site: 'san-diego', path: '/about' };
    }

    it('sync-from-base with override mode sets hasOverride', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock, {
        role: 'satellite',
        baseSite: 'mccs',
        hasOverride: false,
        details: satDetails(),
      });
      el._syncMode = 'override';
      el._action = 'sync-from-base';

      await el.runSatelliteAction('sync-from-base');

      expect(el._hasOverride).to.be.true;
      expect(el._satStatus).to.equal('success');
    });

    it('sync-from-base with merge mode calls mergeCopy', async () => {
      let mergeCalled = false;
      setMergeCopy(async () => { mergeCalled = true; return { ok: true }; });

      const mock = createFetchMock({});
      await fixtureWithState(mock, {
        role: 'satellite',
        baseSite: 'mccs',
        hasOverride: false,
        details: satDetails(),
      });
      el._syncMode = 'merge';
      el._action = 'sync-from-base';

      await el.runSatelliteAction('sync-from-base');

      expect(mergeCalled).to.be.true;
      expect(el._hasOverride).to.be.true;
    });

    it('resume-inheritance shows confirm dialog', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock, {
        role: 'satellite',
        baseSite: 'mccs',
        hasOverride: true,
        details: satDetails(),
      });
      el._action = 'resume-inheritance';

      el.applySatelliteAction();

      expect(el._confirmAction).to.exist;
      expect(el._confirmAction.confirmedAction).to.equal('resume-inheritance');
    });

    it('resume-inheritance deletes override and auto-previews/publishes', async () => {
      const calls = [];
      const base = createFetchMock({});
      const mock = async (url, opts) => {
        calls.push({ url, method: opts?.method });
        return base(url, opts);
      };
      await fixtureWithState(mock, {
        role: 'satellite',
        baseSite: 'mccs',
        hasOverride: true,
        details: satDetails(),
      });

      await el.runSatelliteAction('resume-inheritance');

      expect(el._hasOverride).to.be.false;
      expect(el._satStatus).to.equal('success');
      expect(calls.some((c) => c.url.includes('/preview/'))).to.be.true;
      expect(calls.some((c) => c.url.includes('/live/'))).to.be.true;
    });

    it('doConfirmedAction runs resume-inheritance for satellite view', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock, {
        role: 'satellite',
        baseSite: 'mccs',
        hasOverride: true,
        details: satDetails(),
      });

      el._confirmAction = {
        message: 'Resume?',
        confirmedAction: 'resume-inheritance',
      };
      await el.doConfirmedAction();

      expect(el._confirmAction).to.be.undefined;
      expect(el._hasOverride).to.be.false;
    });

    it('sets error status when delete fails', async () => {
      const base = createFetchMock({});
      const mock = async (url, opts) => {
        if (opts?.method === 'DELETE') {
          return new Response('', { status: 500 });
        }
        return base(url, opts);
      };
      await fixtureWithState(mock, {
        role: 'satellite',
        baseSite: 'mccs',
        hasOverride: true,
        details: satDetails(),
      });

      await el.runSatelliteAction('resume-inheritance');
      expect(el._satStatus).to.equal('error');
    });

    it('does not run action when busy', async () => {
      const mock = createFetchMock({});
      await fixtureWithState(mock, {
        role: 'satellite',
        baseSite: 'mccs',
        hasOverride: true,
        details: satDetails(),
      });
      el._busy = true;

      el.applySatelliteAction();
      expect(el._confirmAction).to.be.undefined;
    });
  });
});
