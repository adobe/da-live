import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

before(async () => {
  await import('../../../../../blocks/canvas/ew-editor-wysiwyg/ew-editor-wysiwyg.js');
});

describe('WYSIWYG merge conflict banner', () => {
  let el;
  const banner = () => el.shadowRoot.querySelector('.ew-editor-wysiwyg-conflicts');
  const buttonFor = (label) => [...(banner()?.querySelectorAll('button') ?? [])]
    .find((b) => b.textContent.trim() === label);

  beforeEach(async () => {
    canvasBus.editorViewState.emit({ view: 'layout' });
    el = document.createElement('ew-editor-wysiwyg');
    document.body.append(el);
    await el.updateComplete;
  });

  afterEach(() => {
    canvasBus.mergeConflictsState.emit({ hasMergeConflicts: false });
    el.remove();
  });

  it('shows no banner without conflicts', () => {
    expect(banner()).to.be.null;
  });

  it('offers split and content views while conflicts exist', async () => {
    canvasBus.mergeConflictsState.emit({ hasMergeConflicts: true });
    await el.updateComplete;
    expect(banner().textContent).to.contain('Resolve conflicts to edit.');

    const requested = [];
    const unsub = canvasBus.editorViewRequest.subscribe(({ view }) => requested.push(view));
    buttonFor('Split view').click();
    buttonFor('Content view').click();
    unsub();
    expect(requested).to.deep.equal(['split', 'content']);
  });

  it('drops the split button when already in split view', async () => {
    canvasBus.mergeConflictsState.emit({ hasMergeConflicts: true });
    canvasBus.editorViewState.emit({ view: 'split' });
    await el.updateComplete;
    expect(buttonFor('Split view')).to.be.undefined;
    expect(buttonFor('Content view')).to.exist;
  });

  it('removes the banner once conflicts are resolved', async () => {
    canvasBus.mergeConflictsState.emit({ hasMergeConflicts: true });
    await el.updateComplete;
    canvasBus.mergeConflictsState.emit({ hasMergeConflicts: false });
    await el.updateComplete;
    expect(banner()).to.be.null;
  });
});
