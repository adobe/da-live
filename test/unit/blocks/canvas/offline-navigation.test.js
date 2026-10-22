import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { syncCanvasEditorsToHash } = await import('../../../../blocks/canvas/canvas.js');

describe('canvas navigation with pending source saves', () => {
  let editor;
  let header;
  let mountRoot;
  let initialHash;

  beforeEach(() => {
    initialHash = window.location.hash;
    editor = {
      ctx: { path: 'org/site/current' },
      hasPendingSave: true,
      forceSave: sinon.stub().resolves({ ok: true }),
      remove: sinon.spy(),
    };
    header = { undoAvailable: true, redoAvailable: true };
    mountRoot = { querySelector: (selector) => (selector === 'ew-editor-doc' ? editor : null) };
  });

  afterEach(() => { window.location.hash = initialHash; });

  it('waits for pending saves before removing the current editor', async () => {
    let finishSave;
    editor.forceSave.returns(new Promise((resolve) => { finishSave = resolve; }));
    const navigation = syncCanvasEditorsToHash({ mountRoot, header, state: {} });
    expect(editor.remove.called).to.be.false;
    finishSave({ ok: true });
    await navigation;
    expect(editor.remove.calledOnce).to.be.true;
    expect(header.undoAvailable).to.be.false;
    expect(header.redoAvailable).to.be.false;
  });

  it('retains the editor and restores its hash after a failed save', async () => {
    editor.forceSave.resolves({ ok: false, error: 'Write denied' });
    await syncCanvasEditorsToHash({ mountRoot, header, state: { org: 'org', site: 'site', path: 'next' } });
    expect(editor.remove.called).to.be.false;
    expect(window.location.hash).to.equal('#/org/site/current');
    expect(header.undoAvailable).to.be.true;
  });

  it('does not reload unsaved content when the old hash is restored', async () => {
    await syncCanvasEditorsToHash({ mountRoot, header, state: { org: 'org', site: 'site', path: 'current' } });
    expect(editor.forceSave.called).to.be.false;
    expect(editor.remove.called).to.be.false;
    expect(header.undoAvailable).to.be.true;
  });
});
