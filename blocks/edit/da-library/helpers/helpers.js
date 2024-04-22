// eslint-disable-next-line import/no-unresolved
import { DOMParser } from 'da-y-wrapper';
import { CON_ORIGIN, getDaAdmin } from '../../../shared/constants.js';
import getPathDetails from '../../../shared/pathDetails.js';

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

  const resp = await fetch(`${DA_ORIGIN}/source/${owner}/${repo}${DA_CONFIG}`);
  if (!resp.ok) return [];

  const { data } = await resp.json();

  libraries = data.reduce((acc, item) => {
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

  return libraries;
}
