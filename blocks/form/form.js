import { getNx2 } from '../../scripts/utils.js';
import decorateEditor from './editor.js';
import {
  TOOL_PANEL_SECTION,
  createToolPanelSection,
  syncOpenToolPanel,
} from '../shared/tool-panel/tool-panel-section.js';
import { toolPanelHost } from './tool-panel/host.js';

const nx2 = getNx2();
const [
  { loadStyle, hashChange },
  { registerPanelSection, wasPanelOpen, PANEL_EVENT },
  { getEWFlags },
  { loadChat },
  { getConfig },
] = await Promise.all([
  import(`${nx2}/utils/utils.js`),
  import(`${nx2}/utils/panel.js`),
  import(`${nx2}/utils/ewFlags.js`),
  import(`${nx2}/utils/chat.js`),
  import(`${nx2}/scripts/nx.js`),
]);

// The workspace layout and the panel toggles live in the light DOM, so their
// styles are adopted on the document. The toggles reuse da-nx's icon buttons,
// like the canvas header.
const [buttonStyle, style] = await Promise.all([
  loadStyle(`${nx2}/styles/buttons.css`),
  loadStyle(import.meta.url),
]);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, buttonStyle, style];

const { codeBase } = getConfig();
const s2IconHref = (name) => `${codeBase}/img/icons/s2-icon-${name}-20-n.svg#icon`;

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

function currentHashState() {
  let state;
  const unsubscribe = hashChange.subscribe((hashState) => { state = hashState; });
  unsubscribe();
  return state ?? {};
}

function openPanelSection(section, id) {
  document.dispatchEvent(new CustomEvent(PANEL_EVENT.OPEN, { detail: { section, id } }));
}

function createGroup(className) {
  const group = document.createElement('div');
  group.className = className;
  return group;
}

function createHeader(block) {
  const header = document.createElement('header');
  header.className = 'form-header';
  const start = createGroup('form-header-start');
  const end = createGroup('form-header-end');
  header.append(start, end);
  block.before(header);
  return { start, end };
}

function installPanelToggle(toggleGroup, { section, label, icon }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `nx-action-btn-icon form-${section}-toggle`;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 20 20"><use href="${s2IconHref(icon)}"></use></svg>`;
  button.addEventListener('click', () => openPanelSection(section));
  toggleGroup.append(button);
}

function setupTools(toggleGroup, { org, site }) {
  registerPanelSection(TOOL_PANEL_SECTION, createToolPanelSection({
    host: toolPanelHost,
    getContext: currentHashState,
  }));
  hashChange.subscribe(syncOpenToolPanel);

  installPanelToggle(toggleGroup, { section: TOOL_PANEL_SECTION, label: 'Open tools panel', icon: 'splitright' });
  if (org && site && wasPanelOpen(TOOL_PANEL_SECTION)) {
    openPanelSection(TOOL_PANEL_SECTION);
  }
}

async function setupChat(toggleGroup, { org, site }) {
  if (!org || !site) return;

  const flags = await getEWFlags({ org, site });
  if (flags['ew.enabled'] !== 'true') return;

  registerPanelSection('chat', {
    position: 'before',
    width: '400px',
    getContent: async () => loadChat(),
  });

  installPanelToggle(toggleGroup, { section: 'chat', label: 'Toggle chat', icon: 'splitleft' });
  if (wasPanelOpen('chat')) {
    openPanelSection('chat');
  }
}

/**
 * Decorates the `form` block as the structured content editor workspace.
 *
 * Sets up a canvas-style workspace with the app-frame grid around the form
 * editor (editor.js) and a header with the panel toggles. A tools panel on
 * the right shows the outline of the document. When EW is enabled, it also
 * adds a chat toggle and a docked chat. The form, the tools panel, and the
 * chat all read the `#/org/site/path` hash, so they stay in sync.
 *
 * This block was migrated from da-nx's `nx/blocks/form`. The `/form` page
 * content still declares it as `nx-form`, which the nx2 loader loads from
 * da-nx. Pages that declare a `form` block load this copy instead.
 *
 * @param {HTMLElement} block - The block element to decorate.
 */
export default async function decorate(block) {
  ensureAppFrame();
  ensureNavPath();

  decorateEditor(block);

  const context = currentHashState();
  const header = createHeader(block);
  setupTools(header.end, context);
  await setupChat(header.start, context);
}
