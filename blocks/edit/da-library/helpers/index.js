import { daFetch, getFirstSheet } from '../../../shared/utils.js';
import { getMetadata } from '../../utils/helpers.js';
import { parseDom } from './helpers.js';

const AEM_ORIGIN = ['hlx.page', 'hlx.live', 'aem.page', 'aem.live'];

function isHeading(element) {
  return ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].some((name) => element?.nodeName === name);
}

function decorateImages(element, path) {
  if (!element || !path) return;
  try {
    // eslint-disable-next-line no-unused-vars
    const url = new URL(path);
    element.querySelectorAll('img').forEach((img) => {
      if (img.getAttribute('src').startsWith('./')) {
        const srcSplit = img.src.split('/');
        const mediaPath = srcSplit.pop();
        img.src = `${url.origin}/${mediaPath}`;
      }
      const { width, height } = img;
      const ratio = width > 200 ? 200 / width : 1;
      img.width = width * ratio;
      img.height = height * ratio;
    });
  } catch (e) {
    // leave images as is
  }
}

function getBlockName(className) {
  const classes = className.split(' ');
  const name = classes.shift();
  const names = { name };
  if (classes.length > 0) {
    names.variants = classes.join(', ');
  }
  return names;
}

function getBlockTableHtml(block) {
  const { name, variants } = getBlockName(block.className);
  const rows = [...block.children];
  const maxCols = rows.reduce((cols, row) => (
    row.children.length > cols ? row.children.length : cols), 0);
  const table = document.createElement('table');
  table.setAttribute('border', 1);
  const headerRow = document.createElement('tr');

  const th = document.createElement('td');
  th.setAttribute('colspan', maxCols);
  th.textContent = variants ? `${name} (${variants})` : name;

  headerRow.append(th);
  table.append(headerRow);
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    [...row.children].forEach((col) => {
      const td = document.createElement('td');
      if (row.children.length < maxCols) {
        td.setAttribute('colspan', maxCols);
      }
      td.innerHTML = col.innerHTML;
      tr.append(td);
    });
    table.append(tr);
  });
  return table;
}

async function fetchAndParseHtml(path, isAemHosted) {
  const postfix = isAemHosted ? '.plain.html' : '';
  const resp = await daFetch(`${path}${postfix}`);
  if (!resp.ok) return null;

  const html = await resp.text();
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

function getSectionsAndBlocks(doc) {
  const sections = [...doc.querySelectorAll('body > div, main > div')];
  return sections.reduce((acc, section) => {
    const sectionEl = document.createElement('hr');
    sectionEl.dataset.issection = true;
    acc.push(sectionEl);
    acc.push(...section.querySelectorAll(':scope > *'));
    return acc;
  }, []);
}

function processGroupBlock(block) {
  const container = document.createElement('div');
  Array.from(block.children).forEach((child) => {
    container.appendChild(
      child.tagName === 'DIV'
        ? getBlockTableHtml(child)
        : child.cloneNode(true),
    );
  });
  return container;
}

function createGroup(block) {
  const container = document.createElement('div');
  const blockGroup = document.createElement('div');
  blockGroup.dataset.isgroup = true;

  if (isHeading(block.previousElementSibling)) {
    container.appendChild(block.previousElementSibling.cloneNode(true));
  }
  return { container, blockGroup };
}

function groupBlocks(blocks) {
  return blocks.reduce((state, block) => {
    if (block.classList.contains('library-container-start')) {
      state.currentGroup = createGroup(block);
    } else if (block.classList.contains('library-container-end') && state.currentGroup) {
      const { container, blockGroup } = state.currentGroup;
      container.appendChild(blockGroup);
      if (block.nextElementSibling?.classList.contains('library-metadata')) {
        container.appendChild(block.nextElementSibling.cloneNode(true));
      }
      state.blocks.push(blockGroup);
      state.currentGroup = null;
    } else if (state.currentGroup) {
      state.currentGroup.blockGroup.appendChild(block.cloneNode(true));
    } else if (block.nodeName === 'DIV'
      && !block.dataset.issection
      && !block.classList.contains('library-metadata')) {
      state.blocks.push(block);
    }
    return state;
  }, { blocks: [], currentGroup: null }).blocks;
}

function transformBlock(block) {
  const prevSib = block.previousElementSibling;
  const item = isHeading(prevSib) && prevSib.textContent
    ? { name: prevSib.textContent }
    : getBlockName(block.className);

  const dom = block.dataset.isgroup
    ? processGroupBlock(block)
    : getBlockTableHtml(block);

  item.parsed = parseDom(dom);

  if (block.nextElementSibling?.classList.contains('library-metadata')) {
    const md = getMetadata(block.nextElementSibling);
    item.tags = md?.searchtags || '';
    item.description = md?.description || '';
  }

  return item;
}

export async function getBlockVariants(path) {
  const { origin } = new URL(path);
  const isAemHosted = AEM_ORIGIN.some((aemOrigin) => origin.endsWith(aemOrigin));

  const doc = await fetchAndParseHtml(path, isAemHosted);
  if (!doc) return [];

  decorateImages(doc.body, path);

  const blocks = getSectionsAndBlocks(doc);
  const groupedBlocks = groupBlocks(blocks);
  return groupedBlocks.map(transformBlock);
}

const urlCache = new Map();
export async function getBlocks(sources) {
  try {
    const sourcesData = await Promise.all(
      sources.map(async (url) => {
        if (urlCache.has(url)) {
          return urlCache.get(url);
        }

        try {
          const resp = await daFetch(url, { noRedirect: true });
          if (!resp.ok) throw new Error('Something went wrong.');
          const data = await resp.json();
          urlCache.set(url, data);
          return data;
        } catch {
          return null;
        }
      }),
    );

    const blockList = [];
    sourcesData.forEach((blockData) => {
      if (!blockData) return;
      const data = getFirstSheet(blockData);
      if (!data) return;
      data.forEach((block) => {
        if (block.name && block.path) blockList.push(block);
      });
    });

    return blockList;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching blocks:', error);
    return [];
  }
}
