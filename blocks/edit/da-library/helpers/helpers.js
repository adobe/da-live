// eslint-disable-next-line import/no-unresolved
import { DOMParser } from 'da-y-wrapper';
import { CON_ORIGIN, AEM_ORIGIN, getDaAdmin } from '../../../shared/constants.js';
import getPathDetails from '../../../shared/pathDetails.js';

const DA_ORIGIN = getDaAdmin();
const REPLACE_CONTENT = '{{content}}';

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
  return data.reduce((acc, item) => {
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
      const resp = await fetch(source);
      const json = await resp.json();
      if (json.data) {
        items.push(...formatData(json.data, format));
      } else if (listType === 'assets') {
        items.push(...fixAssets(json));
      } else {
        items.push(...json);
      }
    } catch(e) {
      console.warn('could not fetch source', source, e);
    }
  }
  return items;
}

const defaultPlugins = {
  blocks: {
    "id": "blocks",
    "title": "Blocks",
    "environments": [ "edit" ],
    "type": "blocks",
    "url": "./docs/library/blocks.json",
    "includePaths": [ "/edit#/**" ]
  },
  icons: {
    "id": "icons",
    "title": "Icons",
    "environments": [ "edit" ],
    "type": "items",
    "format": ":{{content}}:",
    "url": "./docs/library/icons.json",
    "includePaths": [ "/edit#/**" ]
  },
  assets: {
    "id": "assets",
    "title": "Assets",
    "environments": [ "edit" ],
    "type": "assets",
    "url": "./assets",
    "includePaths": [ "/edit#/**" ]
  },
};

let currOwner;
let currRepo;
let libraries;

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

  const response = await fetch(`${AEM_ORIGIN}/sidekick/${owner}/${repo}/main/config.json`);
  const configJson = response.ok && await response.json();
  libraries = configJson && configJson.plugins
    ? configJson.plugins.map((plugin) => ({
        ...(defaultPlugins[plugin.id] || {}),
        ...plugin
      }))
      // TODO filter list by environment, include and exclude paths
    : Object.values(defaultPlugins);
  libraries.forEach(config => {
    if(config.url.startsWith('./')) {
      switch (config.type) {
        case 'assets':
          config.url = config.url.replace('./', `https://admin.da.live/list/${owner}/${repo}/`);
          break;
        default:
          config.url = config.url.replace('./', `https://content.da.live/${owner}/${repo}/`);
          break;
      }
    }
  });
  return libraries;
}

