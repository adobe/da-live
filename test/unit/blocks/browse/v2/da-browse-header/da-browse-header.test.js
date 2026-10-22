import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
await import('../../../../../../blocks/browse/v2/da-browse-header/da-browse-header.js');

describe('da-browse-header', () => {
  let header;
  let container;

  beforeEach(async () => {
    container = document.createElement('div');
    header = document.createElement('da-browse-header');
    // da-browse always supplies these.
    Object.assign(header, {
      groupByType: false,
      view: 'list',
      typesFilterState: { open: false, hiddenCount: 0 },
      sortState: { property: null, direction: 'none', loading: false },
    });
    container.append(header);
    document.body.append(container);
    await header.updateComplete;
  });

  afterEach(() => container.remove());

  it('renders independently with default sort and no config or chat action', () => {
    const picker = header.shadowRoot.querySelector('nx-picker');
    expect(picker.labelOverride).to.equal('Sort');
    expect(picker.querySelector('svg')).to.be.null;
    expect(picker.value).to.equal('');
    expect(header.shadowRoot.querySelector('.browse-settings-link')).to.be.null;
    expect(header.shadowRoot.querySelector('.chat-btn')).to.be.null;
  });

  it('shows config only at org and site roots, not inside folders', async () => {
    header.details = { org: 'org', path: '' };
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('.browse-settings-link').getAttribute('href'))
      .to.equal('/config#/org/');

    header.details = { org: 'org', site: 'site', path: '' };
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('.browse-settings-link').getAttribute('href'))
      .to.equal('/config#/org/site/');

    header.details = { org: 'org', site: 'site', path: 'folder' };
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('.browse-settings-link')).to.be.null;

    header.details = { org: 'org', site: 'site', path: '' };
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('.browse-settings-link')).not.to.be.null;
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

  it('replaces the creation slot with a stable search status and restores it afterwards', async () => {
    const creation = document.createElement('button');
    creation.textContent = 'New';
    header.append(creation);
    const summary = header.shadowRoot.querySelector('[role="status"]');
    expect(summary.textContent).to.equal('');
    expect(summary.getAttribute('aria-atomic')).to.equal('true');
    expect(header.shadowRoot.querySelector('slot').assignedElements()).to.deep.equal([creation]);
    header.searchState = { loading: true, count: 0 };
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('[role="status"]')).to.equal(summary);
    expect(summary.textContent).to.equal('Searching...');
    expect(header.shadowRoot.querySelector('slot')).to.be.null;
    expect(creation.isConnected).to.be.true;
    header.searchState = { loading: true, count: 1 };
    await header.updateComplete;
    expect(summary.textContent).to.equal('Searching...');
    const visual = header.shadowRoot.querySelector('.browse-search-summary');
    expect(visual.querySelector('.browse-search-progress').textContent).to.equal('Searching... \u00b7 1 found');
    expect(visual.getAttribute('aria-hidden')).to.equal('true');
    header.searchState = { loading: true, count: 2 };
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('[role="status"]')).to.equal(summary);
    expect(summary.textContent).to.equal('Searching...');
    expect(visual.querySelector('.browse-search-progress').textContent).to.equal('Searching... \u00b7 2 found');
    header.searchState = { loading: false, count: 1 };
    await header.updateComplete;
    expect(summary.textContent).to.equal('1 result found');
    expect(summary.querySelector('span')).to.be.null;
    header.searchState = { loading: false, count: 2 };
    await header.updateComplete;
    expect(summary.textContent).to.equal('2 results found');
    header.searchState = { loading: false, count: 0 };
    await header.updateComplete;
    expect(summary.textContent).to.equal('No results found');
    header.searchState = undefined;
    await header.updateComplete;
    expect(summary.textContent).to.equal('');
    expect(header.shadowRoot.querySelector('slot').assignedElements()).to.deep.equal([creation]);
  });

  it('does not report an unsuccessful search as no matches', async () => {
    header.searchState = { loading: false, count: 0, error: 'Search failed' };
    await header.updateComplete;
    expect(header.shadowRoot.querySelector('[role="status"]').textContent).to.equal('');
    expect(header.shadowRoot.querySelector('slot')).to.be.null;
  });

  it('reflects supplied sort state and disables sorting while loading', async () => {
    header.sortState = { property: 'lastModified', direction: 'descending', loading: true };
    await header.updateComplete;
    const picker = header.shadowRoot.querySelector('nx-picker');
    expect(picker.labelOverride).to.equal('Sort');
    expect(picker.title).to.equal('Sorted by Modified (newest first)');
    expect(picker.querySelector('svg')).to.be.null;
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
    const button = header.shadowRoot.querySelectorAll('.browse-toolbar-control')[0];
    button.click();
    expect(event.detail.anchor).to.equal(button);
    expect(event.composed).to.be.true;
  });

  it('retains compact control descriptions and filter and sort actions', async () => {
    header.groupByType = true;
    header.typesFilterState = { open: false, hiddenCount: 2 };
    header.sortState = { property: 'name', direction: 'descending', loading: false };
    await header.updateComplete;
    container.style.width = '600px';
    expect(header.getBoundingClientRect().width).to.equal(600);
    const controls = header.shadowRoot.querySelectorAll('.browse-toolbar-control');
    expect(controls[0].title).to.equal('2 types hidden');
    expect(controls[0].querySelector('.browse-control-label').textContent)
      .to.equal('2 types hidden');
    const picker = header.shadowRoot.querySelector('nx-picker');
    expect(picker.title).to.equal('Sorted by Name (Z-A)');
    let filterRequest;
    let sortRequest;
    header.addEventListener('typesfilterrequest', (event) => { filterRequest = event.detail; });
    header.addEventListener('sortrequest', (event) => { sortRequest = event.detail; });
    controls[0].click();
    expect(filterRequest.anchor).to.equal(controls[0]);
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'name:ascending' } }));
    expect(sortRequest).to.deep.equal({ property: 'name', direction: 'ascending' });
    header.groupByType = false;
    header.typesFilterState = { open: false, hiddenCount: 0 };
    await header.updateComplete;
    expect(controls[0].title).to.equal('Show All');
  });

  it('emits viewchange from the view segmented control', async () => {
    const control = header.shadowRoot.querySelector('nx-segmented-btn');
    expect(control.value).to.equal('list');
    expect(control.items.map(({ value }) => value)).to.deep.equal(['list', 'card']);
    let detail;
    header.addEventListener('viewchange', (e) => { detail = e.detail; });
    control.dispatchEvent(new CustomEvent('change', { detail: { value: 'card' } }));
    expect(detail).to.deep.equal({ view: 'card' });
  });
});
