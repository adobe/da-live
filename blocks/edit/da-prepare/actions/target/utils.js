import { DOMParser as ProseParser } from 'da-y-wrapper';
import { aemAdmin, etcFetch, getFirstSheet } from '../../../../shared/utils.js';
import { daApi } from '../../../../shared/da-api.js';
import { deleteOffer, getAccessToken, getOffer, saveOffer } from './api.js';

const TARGET_CONFIG_PATH = '/.da/adobe-target.json';

function parseHtml(schema, html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return ProseParser.fromSchema(schema).parse(div);
}

function findMetadataTable(doc) {
  let result = null;
  doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      const firstCell = node.firstChild?.firstChild;
      if (firstCell?.textContent.toLowerCase().trim() === 'metadata') {
        result = { node, pos };
        return false;
      }
    }
    return true;
  });
  return result;
}

function findMetadataRow(doc, key) {
  const metadata = findMetadataTable(doc);
  if (!metadata) return null;

  const { node: table, pos: tablePos } = metadata;
  let rowOffset = 1; // Start after the table opening

  for (let i = 0; i < table.childCount; i += 1) {
    const row = table.child(i);
    const firstCell = row.firstChild;
    if (firstCell?.textContent.trim() === key) {
      const secondCell = row.childCount > 1 ? row.child(1) : null;
      return {
        row,
        pos: tablePos + rowOffset,
        value: secondCell?.textContent.trim() || null,
      };
    }
    rowOffset += row.nodeSize;
  }
  return null;
}

function getOfferId() {
  const { view } = window;
  if (!view) return null;
  const result = findMetadataRow(view.state.doc, 'adobe.target.offerId');
  return result?.value || null;
}

function setOfferId(offerId) {
  const { view } = window;
  const { state } = view;
  const { schema, tr } = state;

  const tableHtml = `
    <table>
      <tr><td colspan="2"><p>metadata</p></td></tr>
      <tr>
        <td><p>adobe.target.offerId</p></td>
        <td><p>${offerId}</p></td>
      </tr>
    </table>
  `;

  const metadata = findMetadataTable(state.doc);
  const existingRow = findMetadataRow(state.doc, 'adobe.target.offerId');

  if (existingRow) {
    // Replace existing row
    const parsedTable = parseHtml(schema, tableHtml).firstChild;
    const newRow = parsedTable.child(1);
    tr.replaceWith(existingRow.pos, existingRow.pos + existingRow.row.nodeSize, newRow);
  } else if (metadata) {
    // Add new row to existing metadata table
    const parsedTable = parseHtml(schema, tableHtml).firstChild;
    const newRow = parsedTable.child(1);
    const insertPos = metadata.pos + metadata.node.nodeSize - 1;
    tr.insert(insertPos, newRow);
  } else {
    // Create new metadata table
    const newTable = parseHtml(schema, tableHtml).firstChild;
    tr.insert(state.doc.content.size, newTable);
  }

  view.dispatch(tr);
}

export function removeOfferId() {
  const { view } = window;
  const { state } = view;
  const { tr } = state;

  const existingRow = findMetadataRow(state.doc, 'adobe.target.offerId');
  if (!existingRow) return;

  const metadata = findMetadataTable(state.doc);
  if (metadata && metadata.node.childCount === 2) {
    // Only header row + this row, delete the entire table
    tr.delete(metadata.pos, metadata.pos + metadata.node.nodeSize);
  } else {
    tr.delete(existingRow.pos, existingRow.pos + existingRow.row.nodeSize);
  }
  view.dispatch(tr);
}

/**
 * Fetch and cache the Adobe Target DA file config
 */
export const fetchTargetConfig = (() => {
  const configCache = {};

  const fetchConfig = async (location) => {
    const resp = await daApi.getSource(`${location}${TARGET_CONFIG_PATH}`);
    if (!resp.ok) return { error: 'Couldn\'t fetch Adobe Target config.' };
    const json = await resp.json();
    const data = getFirstSheet(json);

    const baseConfig = data.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    const { clientId, clientSecret } = baseConfig;

    if (!(clientId || clientSecret)) {
      return { error: 'No clientId or clientSecret available.' };
    }
    const { error, token } = await getAccessToken(clientId, clientSecret);
    if (error) return { error };

    return { ...baseConfig, token };
  };

  return (org, site) => {
    const location = site ? `/${org}/${site}` : `/${org}`;
    configCache[location] = fetchConfig(`/${org}/${site}`);
    return configCache[location];
  };
})();

export async function savePreview(org, site, path) {
  const fullpath = `/${org}/${site}${path}`;
  const json = await aemAdmin(fullpath, 'preview');
  if (!json) return { error: 'Couldn\'t preview.' };
  return json;
}

export async function sendToTarget(org, site, name, aemPath, displayName, existingOfferId) {
  const aemResp = await etcFetch(`${aemPath}?nocache=${Date.now()}`, 'cors');
  if (!aemResp.ok) return { error: 'Could not fetch from AEM.' };
  const html = await aemResp.text();
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const content = dom.querySelector('main').innerHTML;
  const config = await fetchTargetConfig(org, site);
  const result = await saveOffer(config, name, content, aemPath, displayName, existingOfferId);
  if (result.offerId) setOfferId(result.offerId);
  return result;
}

export async function deleteFromTarget(org, site, offerId) {
  const config = await fetchTargetConfig(org, site);

  const result = await deleteOffer(config, offerId);
  if (result.error && !result.notFound) return result;

  removeOfferId();
  return result;
}

export async function getOfferDetails(org, site) {
  // Get from the page
  const offerId = getOfferId();
  if (!offerId) return {};

  const config = await fetchTargetConfig(org, site);
  if (!config || config.error) return { id: offerId };

  const result = await getOffer(config, offerId);
  if (result.error) return { id: offerId };

  return { id: result.id, name: result.name };
}
