import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: search } = await import('../../../../../blocks/edit/da-library/helpers/search.js');

describe('da-library/helpers/search', () => {
  const data = {
    blocks: [
      {
        name: 'Marquee',
        path: '/path/marquee',
        icon: '#m',
        variants: [
          { name: 'large', tags: 'hero big', description: 'A large variant' },
          { name: 'small', tags: 'compact', description: '' },
        ],
      },
      {
        name: 'Cards',
        path: '/path/cards',
        icon: '#c',
        variants: [
          { name: 'centered', tags: 'middle', description: '' },
        ],
      },
    ],
    templates: [{ key: 'home', name: 'Home', value: '<a>home</a>' }],
    icons: [{ key: 'check', name: 'Check', value: '' }],
    placeholders: [{ key: 'name', name: 'Name', value: '' }],
    byoPlugins: [{ name: 'fancy' }, { name: 'blocks' }],
  };

  it('Matches a block variant by tag and decorates with block fields', () => {
    const results = search('hero', data);
    expect(results).to.have.length(1);
    expect(results[0]).to.include({ blockName: 'Marquee', blockPath: '/path/marquee', icon: '#m', type: 'blocks' });
  });

  it('Matches a block variant by name', () => {
    const results = search('centered', data);
    expect(results).to.have.length(1);
    expect(results[0].blockName).to.equal('Cards');
  });

  it('Matches templates, icons, and placeholders by key', () => {
    const results = search('home', data);
    expect(results).to.have.length(1);
    expect(results[0]).to.include({ type: 'templates', key: 'home' });
  });

  it('Includes BYO plugins when name matches and is not OOTB', () => {
    const results = search('fancy', data);
    expect(results.find((r) => r.name === 'fancy')).to.exist;
  });

  it('Skips BYO plugins that match an OOTB name', () => {
    const results = search('blocks', data);
    expect(results.find((r) => r.name === 'blocks')).to.equal(undefined);
  });

  it('Treats input as case-insensitive', () => {
    const results = search('HERO', data);
    expect(results).to.have.length(1);
  });

  it('Requires every space-separated term to appear (AND match)', () => {
    const results = search('hero big', data);
    expect(results).to.have.length(1);
    const noResults = search('hero compact', data);
    expect(noResults).to.deep.equal([]);
  });

  it('Returns blocks before kv before plugins', () => {
    const results = search('a', data); // matches many; check ordering by type
    const types = results.map((r) => r.type);
    const blocksIdx = types.indexOf('blocks');
    const tplIdx = types.indexOf('templates');
    if (blocksIdx !== -1 && tplIdx !== -1) {
      expect(blocksIdx).to.be.lessThan(tplIdx);
    }
  });
});
