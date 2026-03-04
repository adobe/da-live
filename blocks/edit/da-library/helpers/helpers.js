// eslint-disable-next-line import/no-unresolved
import { DOMParser } from 'da-y-wrapper';
import { getDaAdmin } from '../../../shared/constants.js';
import getPathDetails from '../../../shared/pathDetails.js';
import { daFetch, aemAdmin } from '../../../shared/utils.js';
import { getConfKey, openAssets } from '../../da-assets/da-assets.js';
import { fetchKeyAutocompleteData } from '../../prose/plugins/slashMenu/keyAutocomplete.js';
import { sanitizeName } from '../../../../scripts/utils.js';
import { getBlocks } from './index.js';

export const OOTB_PLUGINS = ['blocks', 'templates', 'icons', 'placeholders'];

const LIBRARY_CACHE = {};
const DA_ORIGIN = getDaAdmin();
const REPLACE_CONTENT = '<content>';
const DA_PLUGINS = {
  blocks: {},
  templates: {},
  'aem-assets': { experience: 'assets' },
  placeholders: {},
  icons: {},
};
const DEF_ICON = '/blocks/edit/img/Smock_Plug_18_N.svg';

const ref = sanitizeName(new URLSearchParams(window.location.search).get('ref'), false) || 'main';

export function parseDom(dom) {
  const { schema } = window.view.state;
  return DOMParser.fromSchema(schema).parse(dom);
}

function formatData(data, format) {
  const dataArr = data.data || data;

  return dataArr.reduce((acc, item) => {
    if (item.key) {
      const toParse = format ? format.replace(REPLACE_CONTENT, item.key) : item.key;
      const parsed = window.view.state.schema.text(toParse);
      acc.push({ ...item, parsed });
    }
    return acc;
  }, []);
}

function setupBlockOptions(library) {
  const blockJsonUrl = library.filter((v) => v.name === 'blocks')?.[0]?.sources?.[0];
  if (blockJsonUrl) fetchKeyAutocompleteData(blockJsonUrl);
}

export async function getItems(sources, format) {
  const items = [];
  for (const source of sources) {
    try {
      const resp = await daFetch(source);
      const json = await resp.json();
      if (json.data) {
        items.push(...formatData(json.data, format));
      } else {
        items.push(...json);
      }
    } catch {
      // couldn't fetch source
    }
  }
  return items;
}

async function getAssetsPlugin(owner, repo) {
  const repoId = await getConfKey(owner, repo, 'aem.repositoryId');
  if (!repoId) return null;
  return {
    name: 'aem-assets',
    title: 'AEM Assets',
    experience: 'aem-assets',
    callback: openAssets,
  };
}

function getIsPluginAllowed(plugRef) {
  const pluginRef = plugRef || 'main';

  // Always return true if pluginRef is main
  if (pluginRef === 'main') return true;

  // Allow all branches on dev
  if (ref === 'local') return true;

  // Allow if pluginRef matches query param ref
  if (pluginRef === ref) return true;

  return false;
}

function calculateSources(org, repo, sheetPath) {
  return sheetPath.split(',').map((path) => {
    const trimmed = path.trim();

    // If not relative, just return it.
    if (!trimmed.startsWith('/')) return trimmed;

    // Calculate the ref origin...

    // If dev, the source is localhost
    if (ref === 'local') return `http://localhost:3000${path}`;

    // Fallback to the ref in search param (defaults to main)
    return `https://${ref}--${repo}--${org}.aem.live${path}`;
  });
}

async function fetchLibraryConfig(org, repo) {
  const resp = await daFetch(`${DA_ORIGIN}/config/${org}/${repo}/`);
  if (!resp.ok) return null;
  const { library } = await resp.json();
  if (!library) return null;
  return library.data.reduce((acc, row) => {
    // Determine if a plugin should be visible based on query param
    const allowed = getIsPluginAllowed(row.ref);
    if (allowed) {
      const name = row.title.trim().toLowerCase().replaceAll(' ', '-');
      const ootb = DA_PLUGINS[name];
      const plugin = {
        name,
        title: row.title.trim(),
        sources: calculateSources(org, repo, row.path),
        ref: row.ref || 'main',
        experience: ootb?.experience || row.experience || 'inline',
      };

      if (name === 'blocks') {
        plugin.loadItems = getBlocks(plugin.sources);
      }

      if (name === 'templates') {
        plugin.loadItems = getItems(plugin.sources);
      }

      if (name === 'icons') {
        plugin.loadItems = getItems(plugin.sources, row.format || ':<content>:');
      }

      if (name === 'placeholders') {
        plugin.loadItems = getItems(plugin.sources, row.format || '{{<content>}}');
      }

      // If its not an OOTB plugin, and no provided icon, use the default
      if (!ootb) plugin.icon = row.icon || DEF_ICON;
      acc.push(plugin);
    }
    return acc;
  }, []);
}

function mergeLibrary(da, assets) {
  // Attempt to push after templates
  let pushAfter = da.findIndex((library) => library.name === 'templates');
  // Attempt to push after blocks
  if (pushAfter === -1) pushAfter = da.findIndex((library) => library.name === 'blocks');
  if (pushAfter !== -1) {
    da.splice(pushAfter + 1, 0, assets);
  } else {
    // Give up and push to the end of DA libraries
    da.push(assets);
  }
}

export async function getLibraryList() {
  const { owner, repo } = getPathDetails();
  if (!owner || !repo) return [];

  // Fetch in parallel
  const aemAssets = getAssetsPlugin(owner, repo);
  const confLibrary = fetchLibraryConfig(owner, repo);
  const [assets, library] = await Promise.all([aemAssets, confLibrary]);

  // Order AEM Assets after blocks or templates
  if (assets) mergeLibrary(library, assets);

  if (library) setupBlockOptions(library);

  return library;
}

export function andMatch(inputStr, targetStr) {
  const terms = inputStr.split(' ');
  return terms.every((term) => targetStr.includes(term));
}

export const getMetadata = (el) => [...el.childNodes].reduce((rdx, row) => {
  if (row.children) {
    const key = row.children[0].textContent.trim().toLowerCase();
    const content = row.children[1];
    const text = content.textContent.trim().toLowerCase();
    if (key && content) rdx[key] = { content, text };
  }
  return rdx;
}, {});

export function getPreviewUrl(previewUrl) {
  try {
    const url = new URL(previewUrl);

    if (url.origin.includes('--')) return url.href;
    if (url.origin.includes('content.da.live')) {
      const [, org, site, ...split] = url.pathname.split('/');
      return `https://main--${site}--${org}.aem.page/${split.join('/')}`;
    }
    if (url.origin.includes('admin.da.live')) {
      const [, , org, site, ...split] = url.pathname.split('/');
      return `https://main--${site}--${org}.aem.page/${split.join('/')}`;
    }
  } catch {
    return false;
  }
  return false;
}

export function getAemUrlVars(url) {
  try {
    const urlObj = new URL(url);
    if (urlObj.origin.includes('--')) {
      const [branch, site, orgPlus] = urlObj.hostname.split('--');
      const [org] = orgPlus.split('.');
      return [org, site, branch];
    }

    if (urlObj.origin.includes('content.da.live')) {
      const [, org, site] = urlObj.pathname.split('/');
      return [org, site, 'main'];
    }
    if (urlObj.origin.includes('admin.da.live')) {
      const [, , org, site] = urlObj.pathname.split('/');
      return [org, site, 'main'];
    }
  } catch {
    return false;
  }
  return false;
}

export async function loadLibrary() {
  // Get the current org and site
  const { org, repo } = getPathDetails();
  const sitePath = `/${org}/${repo}`;

  LIBRARY_CACHE[sitePath] ??= getLibraryList();

  return LIBRARY_CACHE[sitePath];
}

export function getItemDetails(item) {
  // Blocks will be path, templates will be value
  const url = new URL(item.path || item.value);
  const { hostname, pathname } = url;

  // AEM Flavor
  if (hostname.includes('.aem.')) {
    const [org, site] = hostname.split('.')[0].split('--').reverse();
    return { org, site, pathname };
  }
  // DA Content Flavor
  if (hostname.includes('content.da.live')) {
    const [org, site, ...rest] = pathname.slice(1).split('/');
    return { org, site, pathname: `/${rest.join('/')}` };
  }
  // DA Admin Flavor
  const [, org, site, ...rest] = pathname.slice(1).split('/');
  return { org, site, pathname: `/${rest.join('/')}` };
}

export async function getPreviewStatus({ org, site, pathname }) {
  const path = `/${org}/${site}${pathname}`;
  try {
    const json = await aemAdmin(path, 'status', 'GET');
    return json.preview.status === 200;
  } catch (err) {
    console.log(`Could not get preview status for ${path}`, err);
    return null;
  }
}
