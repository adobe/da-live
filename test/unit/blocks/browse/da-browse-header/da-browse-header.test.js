import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
await import('../../../../../blocks/browse/da-browse-header/da-browse-header.js');

const response = await fetch(new URL(
  '../../../../../blocks/browse/da-browse-header/da-browse-header.css',
  import.meta.url,
).href);
expect(response.ok).to.be.true;
const styles = new CSSStyleSheet();
await styles.replace(await response.text());

describe('da-browse-header', () => {
  let header;
  let container;

  beforeEach(async () => {
    container = document.createElement('div');
    container.style.width = '1000px';
    header = document.createElement('da-browse-header');
    container.append(header);
    document.body.append(container);
    await header.updateComplete;
    header.shadowRoot.adoptedStyleSheets = [styles];
  });

  afterEach(() => container.remove());

  it('renders independently with default sort and no config or chat action', () => {
    const picker = header.shadowRoot.querySelector('nx-picker');
    expect(picker.labelOverride).to.equal('Sort: Default');
    const icon = picker.querySelector('svg[slot="prefix"]');
    expect(icon).to.not.be.null;
    expect(icon.getAttribute('aria-hidden')).to.equal('true');
    expect(picker.value).to.equal('');
    expect(header.shadowRoot.querySelector('.da-browse-settings-link')).to.be.null;
    expect(header.shadowRoot.querySelector('.chat-btn')).to.be.null;
  });

  it('requests sorting without changing the supplied sort state', () => {
    let event;
    header.addEventListener('sortrequest', (e) => { event = e; });
    const picker = header.shadowRoot.querySelector('nx-picker');
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'name:ascending' } }));
    expect(event.detail).to.deep.equal({ property: 'name', direction: 'ascending' });
    expect(event.bubbles).to.be.true;
    expect(event.composed).to.be.true;
    expect(header.sortState.property).to.be.null;
  });

  it('reflects supplied sort state and disables sorting while loading', async () => {
    header.sortState = { property: 'lastModified', direction: 'descending', loading: true };
    await header.updateComplete;
    const picker = header.shadowRoot.querySelector('nx-picker');
    expect(picker.labelOverride).to.equal('Sorted by Modified (newest first)');
    expect(picker.querySelector('svg[slot="prefix"]')).to.not.be.null;
    expect(picker.getAttribute('aria-busy')).to.equal('true');
    expect(picker.inert).to.be.true;
    expect(picker.value).to.equal('lastModified:descending');
    expect(picker.items.map(({ value }) => value)).to.deep.equal([
      'name:ascending', 'name:descending', 'lastModified:descending', 'lastModified:ascending',
    ]);
    let requests = 0;
    header.addEventListener('sortrequest', () => { requests += 1; });
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'name:ascending' } }));
    expect(requests).to.equal(0);
  });

  it('passes the actual type-filter button as the popover anchor', () => {
    let event;
    header.addEventListener('typesfilterrequest', (e) => { event = e; });
    const button = header.shadowRoot.querySelectorAll('.da-browse-toolbar-control')[1];
    button.click();
    expect(event.detail.anchor).to.equal(button);
    expect(event.composed).to.be.true;
  });

  it('compacts labels based on parent width without changing the viewport', () => {
    const viewportWidth = window.innerWidth;
    const picker = header.shadowRoot.querySelector('nx-picker');
    const trigger = document.createElement('button');
    const pickerLabel = document.createElement('span');
    pickerLabel.part = 'label';
    pickerLabel.textContent = picker.labelOverride;
    trigger.append(pickerLabel);
    picker.attachShadow({ mode: 'open' }).append(trigger);
    const labels = [
      ...header.shadowRoot.querySelectorAll('.da-browse-control-label'),
      pickerLabel,
    ];
    container.style.width = '900px';
    expect(header.getBoundingClientRect().width).to.equal(900);
    labels.forEach((label) => {
      expect(getComputedStyle(label).position).to.equal('static');
    });
    container.style.width = '899px';
    expect(header.getBoundingClientRect().width).to.equal(899);
    expect(window.innerWidth).to.equal(viewportWidth);
    labels.forEach((label) => {
      const style = getComputedStyle(label);
      expect(style.position).to.equal('absolute');
      expect(style.width).to.equal('1px');
      expect(style.clipPath).to.equal('inset(50%)');
      expect(style.display).not.to.equal('none');
      expect(style.visibility).to.equal('visible');
    });
    expect(labels.map((label) => label.textContent)).to.deep.equal([
      'View Options', 'Show All types', 'Sort: Default',
    ]);
    expect(picker.title).to.equal('Sort: Default');
    container.style.width = '900px';
    expect(header.getBoundingClientRect().width).to.equal(900);
    labels.forEach((label) => {
      expect(getComputedStyle(label).position).to.equal('static');
    });
  });

  it('retains compact control descriptions and filter and sort actions', async () => {
    header.flattenFolders = false;
    header.typesFilterState = { open: false, hiddenCount: 2 };
    header.sortState = { property: 'name', direction: 'descending', loading: false };
    await header.updateComplete;
    container.style.width = '600px';
    expect(header.getBoundingClientRect().width).to.equal(600);
    const controls = header.shadowRoot.querySelectorAll('.da-browse-toolbar-control');
    expect(controls[0].title).to.equal('View Options');
    expect(controls[1].title).to.equal('2 types hidden');
    expect(controls[1].querySelector('.da-browse-control-label').textContent)
      .to.equal('2 types hidden');
    const picker = header.shadowRoot.querySelector('nx-picker');
    expect(picker.title).to.equal('Sorted by Name (Z-A)');
    let filterRequest;
    let sortRequest;
    header.addEventListener('typesfilterrequest', (event) => { filterRequest = event.detail; });
    header.addEventListener('sortrequest', (event) => { sortRequest = event.detail; });
    controls[1].click();
    expect(filterRequest.anchor).to.equal(controls[1]);
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'name:ascending' } }));
    expect(sortRequest).to.deep.equal({ property: 'name', direction: 'ascending' });
    header.flattenFolders = true;
    header.typesFilterState = { open: false, hiddenCount: 0 };
    await header.updateComplete;
    expect(controls[0].title).to.equal('View Options');
    expect(controls[1].title).to.equal('Show All types');
  });

  it('keeps view options anchored and expandable in compact mode', async () => {
    container.style.width = '600px';
    const popover = header.shadowRoot.querySelector('.da-browse-view-options-popover');
    let anchor;
    popover.open = false;
    popover.show = (options) => {
      anchor = options.anchor;
      popover.open = true;
    };
    popover.close = () => { popover.open = false; };
    const button = header.shadowRoot.querySelector('.da-browse-toolbar-control');
    button.click();
    await header.updateComplete;
    expect(anchor).to.equal(button);
    expect(button.getAttribute('aria-expanded')).to.equal('true');
    button.click();
    await header.updateComplete;
    expect(button.getAttribute('aria-expanded')).to.equal('false');
  });
});
