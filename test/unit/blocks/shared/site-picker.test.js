import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { createSitePicker, updateSitePicker, getSiteOptions } = await import('../../../../blocks/shared/site-picker.js');

describe('shared site picker', () => {
  it('deduplicates real site identifiers and preserves the current site outside recent history', () => {
    expect(getSiteOptions({
      current: 'adobe/current',
      recentSites: ['adobe/other', 'adobe/current', 'other/site', '/bad/path', 'adobe/.trash', null],
    })).to.deep.equal([
      { value: 'adobe/current', label: 'current (adobe)' },
      { value: 'adobe/other', label: 'other (adobe)' },
      { value: 'other/site', label: 'site (other)' },
    ]);
    expect(getSiteOptions({})).to.deep.equal([]);
  });

  it('renders the same item contract for any host without owning its navigation', () => {
    const selections = [];
    const additions = [];
    const picker = createSitePicker({
      onSelect: (value) => selections.push(value),
      onAdd: () => additions.push(true),
    });
    const sites = getSiteOptions({ recentSites: ['adobe/one', 'other/one'] });
    updateSitePicker({ picker, sites, value: 'adobe/one' });
    expect(picker.localName).to.equal('nx-picker');
    expect(picker.classList.contains('da-site-picker')).to.be.true;
    expect(picker.menuVariant).to.be.undefined;
    expect(picker.labelOverride).to.equal('one (adobe)');
    expect(picker.items[1]).to.include({ value: 'adobe/one', label: 'one', description: 'adobe/one', ariaLabel: 'one (adobe)' });
    expect(picker.items[2].description).to.equal('other/one');
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'other/one' } }));
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'add-site' } }));
    expect(selections).to.deep.equal(['other/one']);
    expect(additions).to.deep.equal([true]);
    expect(picker.value).to.equal('adobe/one');
  });

  it('replaces stale state and retains Add site when there are no available sites', () => {
    const picker = createSitePicker({ onSelect: () => {}, onAdd: () => {} });
    updateSitePicker({
      picker,
      sites: getSiteOptions({ current: 'adobe/one' }),
      value: 'adobe/one',
    });
    updateSitePicker({ picker });
    expect(picker.value).to.equal('');
    expect(picker.labelOverride).to.equal('');
    expect(picker.placeholder).to.equal('Choose a site');
    expect(picker.items.filter(({ value }) => value && value !== 'add-site')).to.have.length(0);
    expect(picker.items.at(-1)).to.include({ value: 'add-site', action: true });
  });
});
