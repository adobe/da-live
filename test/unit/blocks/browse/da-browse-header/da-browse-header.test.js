import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
await import('../../../../../blocks/browse/da-browse-header/da-browse-header.js');

describe('da-browse-header', () => {
  let header;

  beforeEach(async () => {
    header = document.createElement('da-browse-header');
    document.body.append(header);
    await header.updateComplete;
  });

  afterEach(() => header.remove());

  it('renders independently with default sort and no config or chat action', () => {
    const picker = header.shadowRoot.querySelector('nx-picker');
    expect(picker.labelOverride).to.equal('Sort: Default');
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
});
