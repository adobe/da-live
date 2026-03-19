/* eslint-disable no-underscore-dangle */
import { OOTB_PLUGINS, andMatch } from './helpers.js';

function searchBlocks(searchStr, blocks) {
  return blocks.reduce((acc, block) => {
    block.variants?.forEach((variant) => {
      const searchable = `${block.name.toLowerCase()} ${variant.name?.toLowerCase() || ''} ${variant.tags?.toLowerCase() || ''} ${variant.description?.toLowerCase() || ''}`;
      if (andMatch(searchStr, searchable)) {
        acc.push({ ...variant, blockName: block.name, blockPath: block.path, icon: block.icon, type: 'blocks' });
      }
    });
    return acc;
  }, []);
}

function searchKv(searchStr, data) {
  return ['templates', 'icons', 'placeholders'].reduce((acc, type) => {
    const list = data[type];
    if (list?.length) {
      const matches = list.reduce((itemsAcc, item) => {
        const searchable = `${item.key?.toLowerCase() || ''} ${item.name?.toLowerCase() || ''} ${item.value?.toLowerCase() || ''}`;
        const matched = andMatch(searchStr, searchable);
        if (matched) itemsAcc.push({ type, ...item });
        return itemsAcc;
      }, []);
      if (matches.length) acc.push(...matches);
    }
    return acc;
  }, []);
}

function searchByoPlugins(searchStr, data) {
  return data.byoPlugins.reduce((acc, plugin) => {
    const isOotb = OOTB_PLUGINS.some((name) => plugin.name === name);
    // If it's BYO and the search term matches, add it
    if (!isOotb && andMatch(searchStr, plugin.name)) {
      acc.push(plugin);
    }
    return acc;
  }, []);
}

export default function search(_searchStr, data) {
  const searchStr = _searchStr.toLowerCase();

  // Blocks get special treatment since they have variations
  const blockResults = searchBlocks(searchStr, data.blocks);

  // Templates, Icons, Placeholders
  const kvResults = searchKv(searchStr, data);

  // BYO Plugins
  const pluginResults = searchByoPlugins(searchStr, data);

  // Determine the order of the search results
  return [...blockResults, ...kvResults, ...pluginResults].reduce((acc, result) => {
    if (result) acc.push(result);
    return acc;
  }, []);
}
