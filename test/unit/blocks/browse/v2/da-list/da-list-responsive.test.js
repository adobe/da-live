import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
await import('../../../../../../blocks/browse/v2/da-list/da-list.js');

async function loadStyles(path) {
  const response = await fetch(new URL(path, import.meta.url).href);
  expect(response.ok).to.be.true;
  const sheet = new CSSStyleSheet();
  await sheet.replace(await response.text());
  return sheet;
}

const [listStyles, itemStyles] = await Promise.all([
  loadStyles('../../../../../../blocks/browse/v2/da-list/da-list.css'),
  loadStyles('../../../../../../blocks/browse/v2/da-list-item/da-list-item.css'),
]);
const name = 'a-long-document-name-'.repeat(12);

describe('da-list responsive columns', () => {
  let container;
  let list;
  let item;

  beforeEach(async () => {
    container = document.createElement('div');
    container.style.width = '1000px';
    container.style.fontFamily = 'Arial';
    container.style.fontSize = '16px';
    container.style.setProperty('--s2-spacing-100', '8px');
    container.style.setProperty('--s2-spacing-200', '16px');
    container.style.setProperty('--s2-spacing-300', '24px');
    list = document.createElement('da-list');
    list.select = true;
    list.flattenFolders = true;
    list.listItems = [{
      name,
      path: `/org/site/${name}.html`,
      ext: 'html',
      lastModified: 1704067200000,
    }];
    container.append(list);
    document.body.append(container);
    await list.updateComplete;
    list.shadowRoot.adoptedStyleSheets = [listStyles];
    item = list.shadowRoot.querySelector('da-list-item');
    await item.updateComplete;
    item.shadowRoot.adoptedStyleSheets = [itemStyles];
  });

  afterEach(() => container.remove());

  it('hides type before modified at container thresholds and keeps name readable', () => {
    const viewportWidth = window.innerWidth;
    const header = list.shadowRoot.querySelector('.da-browse-table-header');
    const row = item.shadowRoot.querySelector('.da-item-list-item-inner');
    const nameText = row.querySelector('.da-item-list-item-name-text');
    const sizes = [
      { width: 900, columns: ['select', 'name', 'type', 'modified', 'actions'] },
      { width: 899, columns: ['select', 'name', 'modified', 'actions'] },
      { width: 600, columns: ['select', 'name', 'modified', 'actions'] },
      { width: 599, columns: ['select', 'name', 'modified', 'actions'] },
      { width: 500, columns: ['select', 'name', 'modified', 'actions'] },
      { width: 499, columns: ['select', 'name', 'actions'] },
      { width: 320, columns: ['select', 'name', 'actions'] },
      { width: 1000, columns: ['select', 'name', 'type', 'modified', 'actions'] },
    ];
    sizes.forEach(({ width, columns }) => {
      container.style.width = `${width}px`;
      expect(list.getBoundingClientRect().width).to.equal(width);
      expect(item.getBoundingClientRect().width).to.equal(width);
      expect(window.innerWidth).to.equal(viewportWidth);
      const visibleColumns = (element) => [...element.querySelectorAll('[data-column]')]
        .filter((cell) => getComputedStyle(cell).display !== 'none')
        .map((cell) => cell.dataset.column);
      expect(visibleColumns(header)).to.deep.equal(columns);
      expect(visibleColumns(row)).to.deep.equal(columns);
      expect(getComputedStyle(header).gridTemplateColumns)
        .to.equal(getComputedStyle(row).gridTemplateColumns);
      columns.forEach((column, index) => {
        const headerRect = header.querySelector(`[data-column="${column}"]`).getBoundingClientRect();
        const rowRect = row.querySelector(`[data-column="${column}"]`).getBoundingClientRect();
        expect(rowRect.left).to.be.closeTo(headerRect.left, 1);
        expect(rowRect.width).to.be.closeTo(headerRect.width, 1);
        if (index > 0) {
          const previous = row.querySelector(`[data-column="${columns[index - 1]}"]`);
          expect(previous.getBoundingClientRect().right).to.be.at.most(rowRect.left);
        }
      });
      const nameCell = row.querySelector('[data-column="name"]');
      expect(nameText.getBoundingClientRect().right)
        .to.be.at.most(nameCell.getBoundingClientRect().right + 1);
      expect(nameText.scrollWidth).to.be.greaterThan(nameText.clientWidth);
      expect(getComputedStyle(nameText).textOverflow).to.equal('ellipsis');
      expect(nameText.textContent).to.equal(name);
      expect(nameText.title).to.equal(name);
      expect(getComputedStyle(row.querySelector('[data-column="select"]')).display)
        .not.to.equal('none');
    });
  });

  it('keeps rename controls before the action column at every layout size', async () => {
    item.selectInput = () => {};
    item.rename = true;
    await item.updateComplete;
    const row = item.shadowRoot.querySelector('.da-item-list-item-inner');
    const form = row.querySelector('.da-item-list-item-rename');
    const actions = row.querySelector('[data-column="actions"]');
    [1000, 700, 500, 499, 400].forEach((width) => {
      container.style.width = `${width}px`;
      expect(item.getBoundingClientRect().width).to.equal(width);
      const formRect = form.getBoundingClientRect();
      const actionRect = actions.getBoundingClientRect();
      expect(formRect.right).to.be.at.most(actionRect.left);
      const input = form.querySelector('input');
      expect(input.getBoundingClientRect().width).to.be.greaterThan(0);
      form.querySelectorAll('button').forEach((button) => {
        expect(button.getBoundingClientRect().right).to.be.at.most(formRect.right + 1);
      });
    });
  });
});
