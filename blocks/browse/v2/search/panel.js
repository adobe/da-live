import { getNx } from '../../../../scripts/utils.js';

const { PANEL_EVENT, registerPanelSection } = await import(`${getNx()}/utils/panel.js`);

function dispatch(type, detail) {
  document.dispatchEvent(new CustomEvent(type, { detail }));
}

export function toggleToolsPanel(isOpen) {
  dispatch(isOpen ? PANEL_EVENT.CLOSE : PANEL_EVENT.OPEN, { section: 'tools', id: 'search' });
}

export function closeToolsPanel() {
  dispatch(PANEL_EVENT.CLOSE, { section: 'tools' });
}

// Registers the browse tools panel; `getPanel` resolves the panel element and
// `shouldShow` tells whether the panel is still wanted once the aside is built.
export function registerToolsPanel({ getPanel, isConnected, shouldShow }) {
  registerPanelSection('tools', {
    position: 'after',
    width: '360px',
    getContent: getPanel,
    onShow: async (aside) => {
      const panel = await getPanel();
      if (!isConnected()) {
        aside.remove();
        return;
      }
      const body = aside.querySelector('.panel-body');
      if (!body.contains(panel)) body.replaceChildren(panel);
      aside.id = 'da-browse-tools';
      aside.setAttribute('aria-label', 'Browse tools');
      if (!shouldShow()) {
        closeToolsPanel();
        return;
      }
      await panel.updateComplete;
      panel.focus();
    },
  });
}

// Reports open/close of the tools panel, including closes triggered from inside it.
// Returns a function that stops listening.
export function watchToolsPanel({ getPanel, onChange }) {
  const handle = (event) => {
    const closingOwn = event.type === PANEL_EVENT.CLOSE
      && getPanel()?.closest('aside.panel')?.contains(event.target);
    if (event.detail?.section !== 'tools' && !closingOwn) return;
    onChange(event.type === PANEL_EVENT.OPEN);
  };
  document.addEventListener(PANEL_EVENT.OPEN, handle);
  document.addEventListener(PANEL_EVENT.CLOSE, handle);
  return () => {
    document.removeEventListener(PANEL_EVENT.OPEN, handle);
    document.removeEventListener(PANEL_EVENT.CLOSE, handle);
  };
}
