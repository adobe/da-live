import { getNx } from '../../scripts/utils.js';
import './canvas-header/canvas-header.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { openPanel } = await import(`${getNx()}/utils/panel.js`);

const style = await loadStyle(import.meta.url);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];

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

// Open preview/publish at the structured-content renderer.
function ensurePreviewRenderer() {
  let meta = document.head.querySelector('meta[name="ew-preview-renderer"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'ew-preview-renderer';
    document.head.append(meta);
  }
  meta.content = 'sc';
}

function openChatPanel() {
  return openPanel({
    position: 'before',
    width: '400px',
    getContent: async () => {
      await import(`${getNx()}/blocks/chat/chat.js`);
      return document.createElement('nx-chat');
    },
  });
}

// Header sits before .form (outside its scroll region), so it stays put.
function installHeader(block) {
  const header = document.createElement('canvas-header');
  header.addEventListener('form-toggle-chat', () => openChatPanel());
  block.before(header);
  return header;
}

// Requires `?nxver=2` so getNx() resolves to nx2 (where the form lives). The
// form and chat both read the `#/org/site/path` hash, so they stay in sync.
export default async function decorate(block) {
  ensureAppFrame();
  ensureNavPath();
  ensurePreviewRenderer();

  installHeader(block);

  const { default: decorateForm } = await import(`${getNx()}/blocks/form/form.js`);
  await decorateForm(block);

  await openChatPanel();
}
