import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import {
  TOOL_PANEL_SECTION,
  TOOL_PANEL_TAG,
  createToolPanelSection,
  syncOpenToolPanel,
} from '../../../../../blocks/shared/tool-panel/tool-panel-section.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const CONTEXT = { org: 'acme', site: 'web' };

function asideWith(child) {
  const aside = document.createElement('aside');
  aside.className = 'panel';
  aside.dataset.section = TOOL_PANEL_SECTION;
  if (child) {
    aside.append(child);
  }
  return aside;
}

function spyPanel(calls) {
  const panel = document.createElement(TOOL_PANEL_TAG);
  panel.setContext = async (...args) => { calls.push(['setContext', ...args]); };
  return panel;
}

describe('createToolPanelSection', () => {
  it('registers the panel after the editor', () => {
    const section = createToolPanelSection({ host: {}, getContext: () => CONTEXT });

    expect(section.position).to.equal('after');
    expect(section.width).to.equal('400px');
  });

  it('creates a tool panel that carries the host', async () => {
    const host = { getViews: async () => [] };
    const section = createToolPanelSection({ host, getContext: () => CONTEXT });

    const panel = await section.getContent();

    expect(panel.localName).to.equal(TOOL_PANEL_TAG);
    expect(panel.host === host).to.be.true;
  });

  it('points the panel at the host context before the host onShow', async () => {
    const calls = [];
    const panel = spyPanel(calls);
    const section = createToolPanelSection({
      host: {},
      getContext: () => CONTEXT,
      onShow: async (toolPanel, id, options) => {
        calls.push(['onShow', toolPanel === panel, id, options]);
      },
    });

    await section.onShow(asideWith(panel), 'files', { newVersion: true });

    expect(calls).to.deep.equal([
      ['setContext', CONTEXT, 'files'],
      ['onShow', true, 'files', { newVersion: true }],
    ]);
  });

  it('ignores an aside without a tool panel', async () => {
    let shown = false;
    const section = createToolPanelSection({
      host: {},
      getContext: () => CONTEXT,
      onShow: async () => { shown = true; },
    });

    await section.onShow(asideWith(), 'files');

    expect(shown).to.be.false;
  });
});

describe('syncOpenToolPanel', () => {
  let aside;

  afterEach(() => aside?.remove());

  it('points the open tool panel at the context', async () => {
    const calls = [];
    aside = asideWith(spyPanel(calls));
    document.body.append(aside);

    syncOpenToolPanel(CONTEXT);

    expect(calls).to.deep.equal([['setContext', CONTEXT]]);
  });

  it('does nothing without an open tool panel', () => {
    expect(() => syncOpenToolPanel(CONTEXT)).to.not.throw();
  });
});
