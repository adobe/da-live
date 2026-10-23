import { getNx2 } from '../../scripts/utils.js';
import decorateEditor from './editor.js';

const { loadStyle, hashChange } = await import(`${getNx2()}/utils/utils.js`);
const {
  registerPanelSection,
  wasPanelOpen,
  PANEL_EVENT,
} = await import(`${getNx2()}/utils/panel.js`);
const { getEWFlags } = await import(`${getNx2()}/utils/ewFlags.js`);
const { loadChat } = await import(`${getNx2()}/utils/chat.js`);
const { getConfig } = await import(`${getNx2()}/scripts/nx.js`);

// Workspace layout is light-DOM (it sizes the block container and the docked
// chat panel), so it adopts on the document rather than an element shadow.
const style = await loadStyle(import.meta.url);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];

const { codeBase } = getConfig();
const CHAT_TOGGLE_ICON = `${codeBase}/img/icons/s2-icon-splitleft-20-n.svg#icon`;

// Engage the app-frame panel grid even when the page didn't declare it.
function ensureAppFrame() {
  let meta = document.head.querySelector('meta[name="template"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'template';
    document.head.append(meta);
  }
  meta.content = 'app-frame';
}

const WORKSPACE_NAV_PATH = '/fragments/exp-workspace/nav';

// Use the workspace nav (breadcrumb + actions), like canvas. Read by nav.js,
// which loads after this block decorates. Page nav-path wins.
function ensureNavPath() {
  if (document.head.querySelector('meta[name="nav-path"]')) return;
  const meta = document.createElement('meta');
  meta.name = 'nav-path';
  meta.content = WORKSPACE_NAV_PATH;
  document.head.append(meta);
}

function openChatPanel() {
  document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section: 'chat' } }));
}

// A floating toggle at the top-left of the canvas opens the chat panel. The
// anchor is a zero-height element in the main flow (so its left edge is the
// canvas edge, not the viewport — clearing the left rail); the button is
// absolutely positioned within it. It sits before the block (outside its scroll
// region) so it stays put, and hides itself while the chat is open — see form.css.
function installChatToggle(block) {
  const anchor = document.createElement('div');
  anchor.className = 'form-chat-toggle-anchor';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'form-chat-toggle';
  btn.setAttribute('aria-label', 'Toggle chat');
  btn.innerHTML = `<svg aria-hidden="true" viewBox="0 0 20 20"><use href="${CHAT_TOGGLE_ICON}"></use></svg>`;
  btn.addEventListener('click', () => openChatPanel());
  anchor.append(btn);
  block.before(anchor);
  return btn;
}

// The chat workspace (toggle + docked chat) is gated on the `ew.enabled`
// flag for the current site. Read once from the hash on load — the form
// workspace is scoped to a single org/site.
async function setupChat(block) {
  let state;
  const unsubscribe = hashChange.subscribe((s) => { state = s; });
  unsubscribe();

  const { org, site } = state ?? {};
  if (!org || !site) return;

  const flags = await getEWFlags({ org, site });
  if (flags['ew.enabled'] !== 'true') return;

  registerPanelSection('chat', {
    position: 'before',
    width: '400px',
    getContent: async () => loadChat(),
  });

  installChatToggle(block);
  if (wasPanelOpen('chat')) openChatPanel();
}

/**
 * Decorates the `form` block as the structured content editor workspace.
 *
 * Sets up a canvas-style workspace with the app-frame grid around the form
 * editor (editor.js). When EW is enabled, it also adds a floating chat toggle
 * and a docked chat. The form and the chat both read the `#/org/site/path`
 * hash, so they stay in sync.
 *
 * This block was migrated from da-nx's `nx/blocks/form`. The `/form` page
 * content still declares it as `nx-form`, which the nx2 loader would load
 * from da-nx. Until the content says `form`, `routeStructuredContentBlock` in
 * `scripts/scripts.js` renames the class before blocks load, so this file
 * loads instead.
 *
 * @param {HTMLElement} block - The block element to decorate.
 */
export default async function decorate(block) {
  ensureAppFrame();
  ensureNavPath();

  decorateEditor(block);

  await setupChat(block);
}
