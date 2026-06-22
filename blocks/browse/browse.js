import { getNx } from '../../scripts/utils.js';

const { hashChange, loadStyle } = await import(`${getNx()}/utils/utils.js`);
const { getPanelStore, openPanel, setPanelsGrid } = await import(`${getNx()}/utils/panel.js`);

const styles = await loadStyle(import.meta.url);
document.adoptedStyleSheets.push(styles);

const CMP_NAME = {
  BROWSE: 'da-browse',
  SITES: 'da-sites',
};

const BROWSE_PANELS = {
  before: {
    width: '400px',
    getContent: async () => {
      await import(`${getNx()}/blocks/chat/chat.js`);
      return document.createElement('nx-chat');
    },
  },
};

async function openBrowsePanel(position) {
  const config = BROWSE_PANELS[position];
  if (!config) return undefined;
  const store = getPanelStore();
  const width = store[position]?.width ?? config.width;
  return openPanel({ position, width, getContent: config.getContent });
}

function installBrowseHeader(el) {
  const header = document.createElement('div');
  header.className = 'browse-header';

  const chatBtn = document.createElement('button');
  chatBtn.type = 'button';
  chatBtn.className = 'browse-header-chat-btn';
  chatBtn.setAttribute('aria-label', 'Open chat panel');
  chatBtn.innerHTML = '<svg aria-hidden="true" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-splitleft-20-n.svg#icon"></use></svg>';
  chatBtn.addEventListener('click', () => openBrowsePanel('before'));

  header.append(chatBtn);
  el.prepend(header);
}

async function loadComponent(el, cmpName, pathDetails) {
  const existing = el.querySelector(cmpName);
  if (existing && pathDetails) {
    existing.details = pathDetails;
    return;
  }
  // Swapping views — remove whichever component is currently mounted.
  el.querySelector('da-sites, da-browse')?.remove();
  await import(`./${cmpName}/${cmpName}.js`);
  const cmp = document.createElement(cmpName);
  cmp.details = pathDetails;
  el.append(cmp);
}

function setRecentSite(details) {
  if (!details.site) return;
  // .trash, .da, .helix, .versions
  if (details.site.startsWith('.')) return;
  const currentSites = JSON.parse(localStorage.getItem(CMP_NAME.SITES)) || [];
  const siteString = `${details.org}/${details.site}`;
  const foundIdx = currentSites.indexOf(siteString);
  if (foundIdx === 0) return;
  if (foundIdx !== -1) currentSites.splice(foundIdx, 1);
  localStorage.setItem(CMP_NAME.SITES, JSON.stringify([siteString, ...currentSites].slice(0, 8)));
}

export default function init(el) {
  installBrowseHeader(el);

  hashChange.subscribe((pathDetails) => {
    const cmpName = pathDetails ? CMP_NAME.BROWSE : CMP_NAME.SITES;

    if (cmpName === CMP_NAME.BROWSE) {
      const store = getPanelStore();
      if (store.before && !store.before.fragment) openBrowsePanel('before');
    } else {
      const beforePanel = document.querySelector('aside.panel[data-position="before"]');
      if (beforePanel && !beforePanel.hidden) {
        beforePanel.hidden = true;
        setPanelsGrid();
      }
    }

    loadComponent(el, cmpName, pathDetails);
    if (pathDetails) setRecentSite(pathDetails);
  });

  document.addEventListener('nx-open-chat-panel', async ({ detail }) => {
    const aside = await openBrowsePanel('before');
    if (!detail?.text) return;
    aside?.querySelector('nx-chat')?.setPrompt(detail.text, { autoSend: detail.autoSend });
  });

  // Lazily preload the editor
  setTimeout(() => { import('da-y-wrapper'); }, 3000);
}
