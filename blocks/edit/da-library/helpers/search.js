/* eslint-disable no-underscore-dangle */
import { html } from 'da-lit';
import { andMatch } from './helpers.js';

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
  const matches = [...blocks.entries()].reduce((acc, [, items]) => {
    items.forEach((item) => {
      const blockStr = `${item.name.toLowerCase()} ${item.variants?.toLowerCase() || ''} ${item.tags?.toLowerCase() || ''}`;
      if (andMatch(searchStr, blockStr)) {
        acc.push(item);
      }
    });
    return acc;
  }, []);
  return matches.length
    ? html`${matches.map((item) => renderCallback(item, true))}`
    : '';
}

function searchTemplates(searchStr, templates, renderCallback) {
  if (!templates) return '';
  const matches = templates.filter((item) => andMatch(searchStr, item.key.toLowerCase()));
  return matches.length
    ? html`${matches.map((item) => renderCallback(item, true))}`
    : '';
}

function searchPlaceholders(searchStr, placeholders, renderCallback) {
  if (!placeholders) return '';
  const matches = placeholders.filter((item) => andMatch(
    searchStr,
    `${item.key.toLowerCase()} ${item.value.toLowerCase()}`,
  ));
  return matches.length
    ? html`${renderCallback(matches, 'placeholder', 'placeholders')}`
    : '';
}

function searchPlugins(searchStr, plugins, renderCallback) {
  if (!plugins) return '';
  const matches = plugins.filter((item) => {
    if (!item.url) return false;
    return andMatch(searchStr, item.name.toLowerCase());
  });
  return matches.length
    ? html`${matches.map((item) => renderCallback(item, true))}`
    : '';
}

function searchOtherItems(searchStr, data, renderCallback) {
  const excludedKeys = ['blocks', 'blockDetailItems', 'placeholders', 'templateItems'];
  const otherItems = Object.entries(data)
    .filter(([key]) => !excludedKeys.includes(key));

  const matches = otherItems.reduce((acc, [, items]) => {
    const itemMatches = items.filter((item) => {
      if (item.url) return false;
      return andMatch(searchStr, item.key?.toLowerCase() || '');
    });
    return [...acc, ...itemMatches];
  }, []);

  return matches.length
    ? html`${renderCallback(matches, 'search')}`
    : '';
}

export default function search(_searchStr, data, daLib) {
  const searchStr = _searchStr.toLowerCase();

  let blockResults = '';
  let templateResults = '';
  let otherResults = '';
  let pluginResults = '';
  let placeholderResults = '';

  // Only search non-placeholder items if not starting with '{{'
  if (!searchStr.startsWith('{{')) {
    blockResults = searchBlocks(
      searchStr,
      data.blockDetailItems,
      daLib.renderBlockItem.bind(daLib),
    );

    templateResults = searchTemplates(
      searchStr,
      data.templateItems,
      daLib.renderTemplateItem.bind(daLib),
    );

    otherResults = searchOtherItems(
      searchStr,
      data,
      daLib.renderItems.bind(daLib),
    );

    pluginResults = searchPlugins(
      searchStr,
      daLib._libraryList,
      daLib.renderPluginItem.bind(daLib),
    );
  }

  // Search placeholders with or without '{{'
  const placeholderSearchStr = searchStr.startsWith('{{')
    ? searchStr.replace('{{', '')
    : searchStr;

  if (placeholderSearchStr) {
    placeholderResults = searchPlaceholders(
      placeholderSearchStr,
      data.placeholders,
      daLib.renderItems.bind(daLib),
    );
  }

  // This determines the order of the search results
  const results = [
    blockResults,
    templateResults,
    placeholderResults,
    otherResults,
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
