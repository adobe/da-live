/* eslint-disable no-underscore-dangle */
import { html } from 'da-lit';
import { andMatch } from './helpers.js';

function wrapInSection(content) {
  return html`
    <div class="da-library-search-section">
      ${content}
    </div>
  `;
}

function searchBlocks(searchStr, blocks, renderCallback) {
  if (!blocks?.items) return '';
  const matches = blocks.items.filter((item) => {
    const blockStr = `${item.name.toLowerCase()} ${item.variants?.toLowerCase() || ''} ${item.tags?.toLowerCase() || ''}`;
    return andMatch(searchStr, blockStr);
  });
  return matches.length
    ? html`${matches.map((item) => renderCallback(item, true))}`
    : '';
}

function searchTemplates(searchStr, templates, renderCallback) {
  if (!templates?.items) return '';
  const matches = templates.items.filter((item) => andMatch(searchStr, item.key.toLowerCase()));
  return matches.length
    ? html`${matches.map((item) => renderCallback(item, true))}`
    : '';
}

function searchPlaceholders(searchStr, placeholders, renderCallback) {
  if (!placeholders?.items) return '';
  const matches = placeholders.items.filter((item) => andMatch(
    searchStr,
    `${item.key.toLowerCase()} ${item.value.toLowerCase()}`,
  ));
  return matches.length
    ? html`${renderCallback(matches, 'placeholder', 'placeholders')}`
    : '';
}

function searchOtherItems(searchStr, data, renderCallback) {
  const excludedKeys = ['blocks', 'templates', 'placeholders'];
  const matches = Object.entries(data)
    .filter(([key]) => !excludedKeys.includes(key))
    .flatMap(([, category]) => category.items?.filter((item) => andMatch(searchStr, item.key?.toLowerCase() || '')) || []);

  return matches.length
    ? html`${renderCallback(matches, 'search')}`
    : '';
}

export default function search(_searchStr, data, daLib) {
  const searchStr = _searchStr.toLowerCase();

  let blockResults = '';
  let templateResults = '';
  let otherResults = '';
  let placeholderResults = '';

  // Only search non-placeholder items if not starting with '{{'
  if (!searchStr.startsWith('{{')) {
    blockResults = searchBlocks(searchStr, data.blocks, daLib.renderBlockItem.bind(daLib));
    templateResults = searchTemplates(searchStr, data.templates, daLib.renderItems.bind(daLib));
    otherResults = searchOtherItems(searchStr, data, daLib.renderItems.bind(daLib));
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

  const results = [
    blockResults,
    templateResults,
    placeholderResults,
    otherResults,
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
