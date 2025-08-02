// eslint-disable-next-line import/no-unresolved
import { DOMParser } from 'da-y-wrapper';
import { getDaAdmin } from '../../../shared/constants.js';
import getPathDetails from '../../../shared/pathDetails.js';
import { daFetch, getFirstSheet } from '../../../shared/utils.js';
import { getConfKey, openAssets } from '../../da-assets/da-assets.js';
import { fetchKeyAutocompleteData } from '../../prose/plugins/slashMenu/keyAutocomplete.js';
import { sanitiseRef } from '../../../scripts/utils.js';
const DA_ORIGIN = getDaAdmin();
const REPLACE_CONTENT = '<content>';
const DA_CONFIG = '/.da/config.json';
const DA_PLUGINS = [
  'blocks',
  'templates',
  'aem-assets',
  'icons',
  'placeholders',
];

const ref = sanitiseRef(new URLSearchParams(window.location.search).get('ref')) || 'main';

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

function calculateClass(title) {
  const lowerName = title.trim().replaceAll(' ', '-').toLowerCase();
  const isDaPlugin = DA_PLUGINS.some((plugin) => plugin === lowerName);
  return `${lowerName}${isDaPlugin ? '' : ' is-plugin'}`;
}

function setupBlockOptions(library) {
  const blockJsonUrl = library.filter((v) => v.name === 'blocks')?.[0]?.sources?.[0];
  if (blockJsonUrl) fetchKeyAutocompleteData(blockJsonUrl);
}

export async function getItems(sources, listType, format) {
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

let currOwner;
let currRepo;
let libraries;

async function getDaLibraries(owner, repo) {
  const resp = await daFetch(`${DA_ORIGIN}/source/${owner}/${repo}${DA_CONFIG}`);
  if (!resp.ok) return [];

  const json = await resp.json();

  const blockData = getFirstSheet(json);
  const daLibraries = blockData.reduce((acc, item) => {
    const keySplit = item.key.split('-');
    if (keySplit[0] === 'library') {
      acc.push({
        name: keySplit[1],
        class: keySplit[1],
        sources: item.value.replaceAll(' ', '').split(','),
        format: item.format,
      });
    }
    return acc;
  }, []);

  setupBlockOptions(daLibraries);

  return daLibraries;
}

async function getAemPlugins(owner, repo) {
  const origin = ref === 'local' ? 'http://localhost:3000' : `https://${ref}--${repo}--${owner}.aem.live`;
  const confUrl = ref === 'local' ? 'http://localhost:3000/tools/sidekick/config.json' : `https://admin.hlx.page/sidekick/${owner}/${repo}/${ref}/config.json`;
  const resp = await daFetch(confUrl);
  if (!resp.ok) return [];
  const json = await resp.json();
  if (!json || !json.plugins) return [];
  if (json?.plugins?.length === 0) return [];
  return json.plugins.reduce((acc, plugin) => {
    const { environments, path, url: plugUrl, daLibrary } = plugin;
    const url = path ? `${origin}${path}` : plugUrl;
    if (environments?.some((env) => env === 'da-edit') || daLibrary) {
      acc.push({
        name: plugin.title,
        icon: plugin.icon,
        class: `${plugin.title.toLowerCase().replaceAll(' ', '-')} is-plugin`,
        experience: plugin.experience || 'inline',
        url,
      });
    }
    return acc;
  }, []);
}

async function getAssetsPlugin(owner, repo) {
  const repoId = await getConfKey(owner, repo, 'aem.repositoryId');
  if (!repoId) return null;
  return {
    name: 'AEM Assets',
    class: 'aem-assets',
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

async function getConfigLibraries(org, repo) {
  const resp = await daFetch(`${DA_ORIGIN}/config/${org}/${repo}/`);
  if (!resp.ok) return null;
  const { library } = await resp.json();
  if (!library) return null;
  return library.data.reduce((acc, plugin) => {
    const allowed = getIsPluginAllowed(plugin.ref);
    if (allowed) {
      const libPlugin = {
        title: plugin.title.trim(),
        name: plugin.title.trim().toLowerCase().replaceAll(' ', '-'),
        class: calculateClass(plugin.title),
        sources: calculateSources(org, repo, plugin.path),
        ref: plugin.ref || 'main',
        experience: plugin.experience || 'inline',
      };
      if (plugin.format) libPlugin.format = plugin.format;
      if (plugin.icon) libPlugin.icon = plugin.icon;
      acc.push(libPlugin);
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

  if (currOwner === owner
    && currRepo === repo
    && libraries) {
    return libraries;
  }
  currOwner = owner;
  currRepo = repo;

  // Attempt config-based library
  const aemAssets = getAssetsPlugin(owner, repo);
  const confLibrary = getConfigLibraries(owner, repo);
  const [assets, library] = await Promise.all([aemAssets, confLibrary]);
  if (library) {
    setupBlockOptions(library);
    if (assets) mergeLibrary(library, assets);
    return library;
  }

  // Fallback to file-based libary
  const daLibraries = getDaLibraries(owner, repo);
  const aemPlugins = getAemPlugins(owner, repo);

  const [da, aem] = await Promise.all([daLibraries, aemPlugins]);

  if (assets) mergeLibrary(da, assets);
  return [...da, ...aem];
}

export function andMatch(inputStr, targetStr) {
  const terms = inputStr.split(' ');
  return terms.every((term) => targetStr.includes(term));
}

export function delay(ms) {
  // eslint-disable-next-line no-promise-executor-return
  return new Promise((resolve) => setTimeout(resolve, ms));
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
