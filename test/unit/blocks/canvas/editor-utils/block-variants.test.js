import { expect } from '@esm-bundle/chai';
import {
  getBlockVariantOptions,
  normalizeBlockName,
} from '../../../../../blocks/canvas/editor-utils/block-variants.js';

describe('block variant options shared by the toolbar and properties panel', () => {
  it('normalizes spaces, underscores, hyphens and case', () => {
    expect(normalizeBlockName('  Card_List ')).to.equal('card list');
    expect(normalizeBlockName('card-list')).to.equal('card list');
    expect(normalizeBlockName()).to.equal('');
  });

  it('matches both library variant formats and deduplicates options', async () => {
    const blocks = [{
      loadVariants: Promise.resolve([
        { name: 'Card List', variants: 'wide' },
        { name: 'card_list (dark)' },
        { name: 'Card-List', variants: 'wide' },
        { name: 'Card List' },
        { name: 'Hero', variants: 'dark' },
      ]),
    }];
    expect(await getBlockVariantOptions(blocks, 'card-list')).to.deep.equal(['wide', 'dark']);
  });

  it('returns no options for blocks without variants', async () => {
    expect(await getBlockVariantOptions([], 'hero')).to.deep.equal([]);
    expect(await getBlockVariantOptions([{ loadVariants: Promise.resolve([]) }], 'hero'))
      .to.deep.equal([]);
  });
});
