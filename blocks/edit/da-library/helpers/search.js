/* eslint-disable no-underscore-dangle */
import { html } from 'da-lit';
import { OOTB_PLUGINS, andMatch } from './helpers.js';

// Helper functions for specific search types
function wrapInSection(content) {
  return html`
    <div class="da-library-search-section">
      ${content}
    </div>
  `;
}

function searchBlocks(searchStr, blocks, renderCallback) {
  if (!blocks) return '';
  const matches = blocks.reduce((acc, block) => {
    block.variants?.forEach((variant) => {
      const searchable = `${block.name.toLowerCase()} ${variant.name?.toLowerCase() || ''} ${variant.tags?.toLowerCase() || ''} ${variant.description?.toLowerCase() || ''}`;
      if (andMatch(searchStr, searchable)) {
        acc.push({ ...variant, blockName: block.name, blockPath: block.path });
      }
    });
    return acc;
  }, []);
  return matches.length
    ? html`${matches.map((item) => renderCallback(item, true))}`
    : '';
}

function searchKv(searchStr, data, renderCallback) {
  return ['templates', 'icons', 'placeholders'].reduce((acc, type) => {
    const list = data[type];
    if (list?.length) {
      const matches = list.filter((item) => andMatch(searchStr, item.key.toLowerCase()));
      if (matches.length) acc.push(matches.map((item) => renderCallback(type, item)));
    }
    return acc;
  }, []);
}

function searchByoPlugins(searchStr, data, renderCallback) {
  if (!data.byoPlugins) return '';
  return data.byoPlugins.reduce((acc, plugin) => {
    const isOotb = OOTB_PLUGINS.some((name) => plugin.name === name);
    // If it's BYO and the search term matches, add it
    if (!isOotb && andMatch(searchStr, plugin.name)) {
      acc.push(renderCallback(plugin));
    }
    return acc;
  }, []);
}

export default function search(_searchStr, data, daLib) {
  const searchStr = _searchStr.toLowerCase();

  // Blocks get special treatment
  // since they have variations
  const blockResults = searchBlocks(
    searchStr,
    data.blocks,
    daLib.renderBlockItem.bind(daLib),
  );

  // Templates, Icons, Placeholders
  const kvResults = searchKv(
    searchStr,
    data,
    daLib.renderItem.bind(daLib),
  );

  // BYO Plugins
  const pluginResults = searchByoPlugins(
    searchStr,
    data,
    daLib.renderMainMenuItem.bind(daLib),
  );

  // Determine the order of the search results
  const results = [
    blockResults,
    ...kvResults,
    pluginResults,
  ].reduce((acc, result) => {
    if (result) acc.push(wrapInSection(result));
    return acc;
  }, []);

  return html`
    <ul class="da-library-search-results ${daLib._searchHasFocus ? 'disable-hover' : ''}"
        @keydown=${daLib.handleSearchKeydown}>
      ${results}
    </ul>`;
}
