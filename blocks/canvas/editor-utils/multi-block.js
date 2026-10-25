import { loadBlockLibrary, loadBlockEditor } from '../ew-panel-extensions/helpers.js';

/**
 * "Multi blocks" — blocks (e.g. cards) whose body is a repeating list of item rows.
 * Marked in the block library's "editor" sheet with `property: 'multi'`. For these,
 * the block toolbar offers an "Add item" button that appends a copy of the library
 * block's first item row.
 */

function normalize(name) {
  return (name || '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

function tableBlockName(table) {
  const header = table.rows?.[0]?.cells?.[0]?.textContent || '';
  return header.replace(/\s*\([^)]*\)\s*$/, '');
}

function templateRowIn(dom, target) {
  if (!dom) return null;
  const tables = dom.tagName === 'TABLE' ? [dom] : [...(dom.querySelectorAll?.('table') || [])];
  const table = tables.find((t) => t.rows?.[1] && normalize(tableBlockName(t)) === target);
  return table?.rows[1] ?? null;
}

/** Pure check: does the "editor" sheet mark `blockName` as a multi block? */
export function isMultiBlockConfigured(rows, blockName) {
  const target = normalize(blockName);
  return (rows || []).some((r) => normalize(r.block) === target
    && r.property?.toLowerCase().trim() === 'multi');
}

export async function isMultiBlock(org, site, blockName) {
  return isMultiBlockConfigured(await loadBlockEditor(org, site), blockName);
}

/** First item row (the row after the header) of a library table for `blockName`, or null. */
export async function findTemplateRow(blocks, blockName) {
  const target = normalize(blockName);
  const rows = await Promise.all((blocks || []).map(async (block) => {
    const variants = (await block.loadVariants) || [];
    return variants.reduce((row, v) => row || templateRowIn(v.dom, target), null);
  }));
  return rows.find(Boolean) ?? null;
}

export async function getMultiBlockTemplateRow(org, site, blockName) {
  const { blocks } = await loadBlockLibrary(org, site);
  return findTemplateRow(blocks, blockName);
}
