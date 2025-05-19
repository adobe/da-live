// eslint-disable-next-line import/no-unresolved
import { DOMParser } from 'da-y-wrapper';
import { CON_ORIGIN, getDaAdmin } from '../../../shared/constants.js';
import getPathDetails from '../../../shared/pathDetails.js';
import { daFetch, getFirstSheet } from '../../../shared/utils.js';
import { getConfKey, openAssets } from '../../da-assets/da-assets.js';
import { fetchKeyAutocompleteData } from '../../prose/plugins/slashMenu/keyAutocomplete.js';
import { Host } from '../../../../../../../../../deps/uix-host/dist/index.js';
import { createExtensionManagerExtensionsProvider } from '../../../../../../../../../deps/uix-host/dist/extension-manager.js';

const { getNx } = await import('../../../../scripts/utils.js');

const DA_ORIGIN = getDaAdmin();
const REPLACE_CONTENT = '<content>';
const DA_CONFIG = '/.da/config.json';

export function parseDom(dom) {
  const { schema } = window.view.state;
  return DOMParser.fromSchema(schema).parse(dom);
}

function fixAssets(json) {
  return json.reduce((acc, item) => {
    if (item.ext) {
      const parsed = window.view.state.schema.nodes.image.create({ src: `${CON_ORIGIN}${item.path}` });
      acc.push({ ...item, path: `${CON_ORIGIN}${item.path}`, parsed });
    }
    return acc;
  }, []);
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

export async function getItems(sources, listType, format) {
  const items = [];
  for (const source of sources) {
    try {
      const resp = await daFetch(source);
      const json = await resp.json();
      if (json.data) {
        items.push(...formatData(json.data, format));
      } else if (listType === 'media') {
        items.push(...fixAssets(json));
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
let uixHost;

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
        sources: item.value.replaceAll(' ', '').split(','),
        format: item.format,
      });
    }
    return acc;
  }, []);

  const blockJsonUrl = daLibraries.filter((v) => v.name === 'blocks')?.[0]?.sources?.[0];
  if (blockJsonUrl) {
    fetchKeyAutocompleteData(blockJsonUrl);
  }

  return daLibraries;
}

async function getExtensionList() {
  const { getConfig } = await import(`${getNx()}/scripts/nexter.js`);
  const { env } = getConfig();

  const { initIms } = await import('../../../shared/utils.js');
  const imsInfo = (await initIms()) || {};

  const extProvider = createExtensionManagerExtensionsProvider({
    experienceShellEnvironment: env === 'stage' ? 'stage' : 'prod',
    scope: {
      programId: 77504,
      envId: 175976,
    },
  }, {
    apiKey: 'exc_app',
    imsOrg: imsInfo.ownerOrg,
    imsToken: imsInfo.accessToken.token,
  }, {}, {
    service: 'da',
    name: 'ui',
    version: '1',
  });
  return extProvider();
}

export async function getUixHost() {
  if (uixHost) return uixHost;
  uixHost = new Host({ hostName: 'Dark Alley', debug: true });

  const urlParams = new URLSearchParams(window.location.search);
  const extUrl = urlParams.get('ext');
  if (extUrl) {
    await uixHost.load({ 0: extUrl});
  }

  //await uixHost.load({ 0: 'https://localhost.corp.adobe.com:9080/', ...await getExtensionList() });
  //await uixHost.load({ 0: 'https://localhost:8080/resources/da.html'});
  return uixHost;
}

async function getUixExtensions() {
  const host = await getUixHost();
  const extensions = await host.getLoadedGuests({ da: ['getLibraryItems'] });

  const data = await Promise.all(extensions.map(async (extension) => {
    const manifests = await extension.apis.da.getLibraryItems();

    return manifests.map((manifest) => ({
      ...manifest,
      url: new URL(manifest.url, extension.url).href,
      extensionId: extension.id,
    }));
  }));

  return data.flat();
}

async function getAemPlugins(owner, repo) {
  const ref = new URLSearchParams(window.location.search).get('ref') || 'main';
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

  const daLibraries = getDaLibraries(owner, repo);
  const aemAssets = getAssetsPlugin(owner, repo);
  const aemPlugins = getAemPlugins(owner, repo);
  const uiExtensions = getUixExtensions();

  const [da, assets, aem, uix] = await Promise.all([
    daLibraries, aemAssets, aemPlugins, uiExtensions,
  ]);

  if (assets) {
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
  libraries = [...da, ...aem, ...uix];
  return libraries;
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
