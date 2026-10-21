import { expect } from '@esm-bundle/chai';
import { setNx, getNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { hashChange } = await import(`${getNx()}/utils/utils.js`);
await import('../../../../../blocks/canvas/ew-block-library-modal/ew-block-library-modal.js');

describe('Block library preselection', () => {
  let modal;
  let cards;
  let hero;

  beforeEach(() => {
    hashChange._set({});
    cards = { name: 'Cards', path: 'https://example.com/library/cards', loadVariants: Promise.resolve([]) };
    hero = { name: 'Hero', path: 'https://example.com/library/hero', loadVariants: Promise.resolve([]) };
    modal = document.createElement('ew-block-library-modal');
    modal.blocks = [hero, cards];
  });

  afterEach(() => modal.remove());

  it('selects and expands the requested block rather than the first item', async () => {
    modal.initialBlockPath = cards.path;
    document.body.append(modal);
    await modal.updateComplete;
    await modal.updateComplete;
    expect(modal._selectedPath).to.equal(cards.path);
    expect(modal._expandedPath).to.equal(cards.path);
    const selected = modal.shadowRoot.querySelector('.is-selected');
    expect(selected.textContent.trim()).to.equal('Cards');
    expect(selected.closest('[role="treeitem"]').getAttribute('aria-expanded')).to.equal('true');
    expect(modal._previewBlock).to.equal(cards);
  });

  it('applies preselection when library data arrives after the initial render', async () => {
    modal.blocks = undefined;
    modal.initialBlockPath = cards.path;
    document.body.append(modal);
    await modal.updateComplete;
    modal.blocks = [hero, cards];
    await modal.updateComplete;
    expect(modal._selectedPath).to.equal(cards.path);
    expect(modal._expandedPath).to.equal(cards.path);
  });

  it('reports an unknown path and allows choosing another block', async () => {
    modal.initialBlockPath = 'https://example.com/library/missing';
    document.body.append(modal);
    await modal.updateComplete;
    expect(modal.shadowRoot.querySelector('.modal-preview-error').textContent)
      .to.include('not found');
    await modal._selectBlock(hero);
    await modal.updateComplete;
    expect(modal._selectedPath).to.equal(hero.path);
    expect(modal.shadowRoot.querySelector('.modal-preview-error')).not.to.exist;
  });

  it('does not preselect anything when opened without navigation options', async () => {
    document.body.append(modal);
    await modal.updateComplete;
    expect(modal._selectedPath).to.equal(undefined);
    expect(modal.shadowRoot.querySelector('.is-selected')).not.to.exist;
  });
});
