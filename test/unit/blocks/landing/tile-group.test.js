import { expect } from '@esm-bundle/chai';
import '../../setup-nx.js';
import '../../../../blocks/landing/tile-group.js';
import { parseTileEntries } from '../../../../blocks/landing/tile-content.js';
import { getNx } from '../../../../scripts/utils.js';

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const content = await fetch('/test/fixtures/landing-tiles.html').then((response) => response.text());

describe('landing tile group', () => {
  let el;

  const getTiles = async () => {
    const tiles = [...el.shadowRoot.querySelectorAll('da-landing-tile')];
    await Promise.all(tiles.map((tile) => tile.updateComplete));
    return tiles;
  };

  beforeEach(async () => {
    hashChange._set({ org: 'org', site: 'site', fullpath: '/org/site' });
    el = document.createElement('da-landing-tiles');
    el.entries = parseTileEntries(new DOMParser().parseFromString(content, 'text/html').querySelector('.landing'));
    document.body.append(el);
    await el.updateComplete;
  });

  afterEach(() => el.remove());

  it('uses authored order, text and tone instead of tile titles or positions', async () => {
    el.entries = [
      { ...el.entries[1], heading: 'Write something', tone: 'purple' },
      { ...el.entries[0], heading: 'Open files', tone: 'orange' },
    ];
    await el.updateComplete;
    const tiles = await getTiles();
    expect(tiles.map((tile) => tile.heading)).to.deep.equal(['Write something', 'Open files']);
    expect(tiles[0].tone).to.equal('purple');
    expect(new URL(tiles[1].href).hash).to.equal('#/org/site');
  });

  it('updates Browse when the selected site changes', async () => {
    const [browse] = await getTiles();
    expect(new URL(browse.href).hash).to.equal('#/org/site');
    hashChange._set({ org: 'other', site: 'site', fullpath: '/other/site' });
    await el.updateComplete;
    expect(new URL(browse.href).hash).to.equal('#/other/site');
  });

  it('keeps Create a page as a disabled placeholder', async () => {
    const [, create] = await getTiles();
    expect(create.href).to.equal(undefined);
    expect(create.shadowRoot.querySelector('button').disabled).to.equal(true);
  });

  it('disables site tiles without a selected site', async () => {
    hashChange._set(undefined);
    await el.updateComplete;
    const [browse, , , , develop] = await getTiles();
    expect(browse.href).to.equal(undefined);
    expect(browse.shadowRoot.querySelector('button').disabled).to.equal(true);
    expect(develop.shadowRoot.querySelector('button').disabled).to.equal(true);
  });
});
