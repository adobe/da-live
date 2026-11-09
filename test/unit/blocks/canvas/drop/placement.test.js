import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { resolvePlacement } = await import('../../../../../blocks/canvas/drop/placement.js');

describe('resolvePlacement while the preview is read-only', () => {
  const view = { state: { doc: {} } };
  const payload = { kind: 'html' };

  afterEach(() => canvasBus.mergeConflictsState.emit({ hasMergeConflicts: false }));

  it('refuses layout targets while conflicts exist', () => {
    canvasBus.mergeConflictsState.emit({ hasMergeConflicts: true });
    const target = { editor: 'wysiwyg', type: 'boundary' };
    expect(resolvePlacement({ view, target, payload })).to.deep.equal({ error: 'read-only' });
  });

  it('still accepts doc targets while conflicts exist', () => {
    canvasBus.mergeConflictsState.emit({ hasMergeConflicts: true });
    const target = { editor: 'doc', pos: 3 };
    expect(resolvePlacement({ view, target, payload })).to.include({ type: 'insert', pos: 3 });
  });
});
