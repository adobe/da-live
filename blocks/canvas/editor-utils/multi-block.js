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

function variantBaseName(variant) {
  if (variant?.variants) return variant.name || '';
  const match = (variant?.name || '').match(/^(.*\S)\s*\(([^)]+)\)\s*$/);
  return match ? match[1].trim() : (variant?.name || '');
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

/** The library block's first item row (the row after the header), or null. */
export async function findTemplateRow(blocks, blockName) {
  const target = normalize(blockName);
  const matches = await Promise.all((blocks || []).map(async (block) => {
    const variants = (await block.loadVariants) || [];
    return variants.find((v) => v.dom && normalize(variantBaseName(v)) === target) || null;
  }));
  const match = matches.find(Boolean);
  if (!match) return null;
  const table = match.dom.tagName === 'TABLE' ? match.dom : match.dom.querySelector?.('table');
  return table?.rows?.[1] ?? null;
}

export async function getMultiBlockTemplateRow(org, site, blockName) {
  const { blocks } = await loadBlockLibrary(org, site);
  return findTemplateRow(blocks, blockName);
}
