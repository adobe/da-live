import { DA_ORIGIN } from '../../../shared/constants.js';
import { daFetch } from '../../../shared/utils.js';

function getURL(url, path) {
  const parts = /#\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\//.exec(url);
  return `${DA_ORIGIN}/source/${parts[1]}/${parts[2]}/${path}`;
}

export async function readCustomPlugins(url, path) {
  const resp = await daFetch(getURL(url, path));
  const pluginJSON = await resp.json();

  const list = [];
  pluginJSON.data.forEach((e) => {
    list.push(e);
  });

  return list;
}

function getField(data, key) {
  if (!data) return null;

  for (const e of data) {
    if (e.Key.toUpperCase() === key.toUpperCase()) return e.Value;
  }
  return null;
}

export async function getSelectValues(url, path) {
  const resp = await daFetch(getURL(url, path));
  const pluginJSON = await resp.json();

  const title = getField(pluginJSON?.md?.data, 'Title') ?? 'Select';

  // Get the data from the correct place which depends on sheet/multi-sheet
  const data = pluginJSON[':type'] === 'sheet' ? pluginJSON.data : pluginJSON.data.data;
  const items = data.map((e) => Object.values(e)[0]);

  return { title, items };
}
