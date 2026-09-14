import { expect } from '@esm-bundle/chai';

let canvasBus;
let registerEditorSelectEnricher;

before(async () => {
  const mod = await import('../../../../../blocks/canvas/utils/canvas-bus.js');
  canvasBus = mod.canvasBus;
  registerEditorSelectEnricher = mod.registerEditorSelectEnricher;
});

// editorProseSelectState stands in for any plain (non-replay, non-enriched) channel —
// they're all built by the same factory, so this exercises that shared contract once
// rather than repeating it per channel name.
describe('canvasBus plain channel (emit/subscribe)', () => {
  it('delivers an emitted value to a subscriber', () => {
    let received;
    const unsub = canvasBus.editorProseSelectState.subscribe((d) => { received = d; });
    canvasBus.editorProseSelectState.emit({ proseIndex: 3, kind: 'paragraph' });
    unsub();
    expect(received).to.deep.equal({ proseIndex: 3, kind: 'paragraph' });
  });

  it('delivers to every independent subscriber', () => {
    const receivedA = [];
    const receivedB = [];
    const unsubA = canvasBus.editorProseSelectState.subscribe((d) => receivedA.push(d));
    const unsubB = canvasBus.editorProseSelectState.subscribe((d) => receivedB.push(d));
    canvasBus.editorProseSelectState.emit({ proseIndex: 1, kind: 'heading' });
    unsubA();
    unsubB();
    expect(receivedA).to.deep.equal([{ proseIndex: 1, kind: 'heading' }]);
    expect(receivedB).to.deep.equal([{ proseIndex: 1, kind: 'heading' }]);
  });

  it('stops delivering once unsubscribed', () => {
    let calls = 0;
    const unsub = canvasBus.editorProseSelectState.subscribe(() => { calls += 1; });
    canvasBus.editorProseSelectState.emit({ proseIndex: 1, kind: 'heading' });
    unsub();
    canvasBus.editorProseSelectState.emit({ proseIndex: 2, kind: 'paragraph' });
    expect(calls).to.equal(1);
  });

  it('does not replay a past emission to a subscriber that joins later', () => {
    canvasBus.undoState.emit({ canUndo: true, canRedo: false });
    let received = 'not-called';
    canvasBus.undoState.subscribe((d) => { received = d; });
    expect(received).to.equal('not-called');
  });
});

describe('canvasBus.editorHtmlState replay', () => {
  it('replays the last emitted value to a subscriber that joins later', () => {
    canvasBus.editorHtmlState.emit('<main>hello</main>');
    let received;
    canvasBus.editorHtmlState.subscribe((html) => { received = html; });
    expect(received).to.equal('<main>hello</main>');
  });

  it('does not replay an empty string, since it is falsy — matches ew-editor-doc.js emitting \'\' to mean "no doc"', () => {
    canvasBus.editorHtmlState.emit('');
    let received = 'not-called';
    canvasBus.editorHtmlState.subscribe((html) => { received = html; });
    expect(received).to.equal('not-called');
  });
});

describe('canvasBus.editorSelectState enrichment', () => {
  it('passes details through unchanged until an enricher is registered, applies it once registered, and rejects a second registration', () => {
    let received;
    const unsub = canvasBus.editorSelectState.subscribe((d) => { received = d; });

    canvasBus.editorSelectState.emit({ blockIndex: 1, source: 'doc' });
    expect(received).to.deep.equal({ blockIndex: 1, source: 'doc' });

    registerEditorSelectEnricher((detail) => ({ ...detail, blockName: 'hero' }));
    canvasBus.editorSelectState.emit({ blockIndex: 1, source: 'doc' });
    expect(received).to.deep.equal({ blockIndex: 1, source: 'doc', blockName: 'hero' });

    expect(() => registerEditorSelectEnricher((d) => d)).to.throw();
    canvasBus.editorSelectState.emit({ blockIndex: 2, source: 'outline' });
    expect(received).to.deep.equal({ blockIndex: 2, source: 'outline', blockName: 'hero' });

    unsub();
  });
});
