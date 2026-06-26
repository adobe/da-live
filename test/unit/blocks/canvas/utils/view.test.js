import { expect } from '@esm-bundle/chai';

const SESSION_KEY = 'nx-canvas-editor-view';
let normalizeCanvasEditorView;
let persistCanvasEditorView;
let readInitialCanvasEditorView;

const flagsLoader = (sheet) => {
  const map = {};
  for (const { key, value } of sheet?.data ?? []) map[key] = value;
  return async () => map;
};

const ctx = () => ({ org: 'org', site: 'site' });

before(async () => {
  const mod = await import('../../../../../blocks/canvas/utils/view.js');
  normalizeCanvasEditorView = mod.normalizeCanvasEditorView;
  persistCanvasEditorView = mod.persistCanvasEditorView;
  readInitialCanvasEditorView = mod.readInitialCanvasEditorView;
});

describe('normalizeCanvasEditorView', () => {
  it('returns content for content', () => {
    expect(normalizeCanvasEditorView('content')).to.equal('content');
  });

  it('returns split for split', () => {
    expect(normalizeCanvasEditorView('split')).to.equal('split');
  });

  it('returns layout for layout', () => {
    expect(normalizeCanvasEditorView('layout')).to.equal('layout');
  });

  it('returns layout for unknown values', () => {
    expect(normalizeCanvasEditorView('unknown')).to.equal('layout');
    expect(normalizeCanvasEditorView('')).to.equal('layout');
    expect(normalizeCanvasEditorView(undefined)).to.equal('layout');
  });
});

describe('persistCanvasEditorView', () => {
  afterEach(() => {
    sessionStorage.removeItem(SESSION_KEY);
  });

  it('writes the normalized view to session storage', () => {
    persistCanvasEditorView('content');
    expect(sessionStorage.getItem(SESSION_KEY)).to.equal('content');
  });

  it('normalizes the value before writing', () => {
    persistCanvasEditorView('unknown');
    expect(sessionStorage.getItem(SESSION_KEY)).to.equal('layout');
  });
});

describe('readInitialCanvasEditorView', () => {
  afterEach(() => {
    sessionStorage.removeItem(SESSION_KEY);
  });

  it('returns persisted session storage value when present', async () => {
    sessionStorage.setItem(SESSION_KEY, 'content');
    const view = await readInitialCanvasEditorView(ctx(), flagsLoader({ data: [] }));
    expect(view).to.equal('content');
  });

  it('session storage value wins over config flag', async () => {
    sessionStorage.setItem(SESSION_KEY, 'split');
    const view = await readInitialCanvasEditorView(
      ctx(),
      flagsLoader({ data: [{ key: 'ew.canvasDefaultView', value: 'content' }] }),
    );
    expect(view).to.equal('split');
  });

  it('returns content from config flag when session storage is empty', async () => {
    const view = await readInitialCanvasEditorView(
      ctx(),
      flagsLoader({ data: [{ key: 'ew.canvasDefaultView', value: 'content' }] }),
    );
    expect(view).to.equal('content');
  });

  it('returns split from config flag when session storage is empty', async () => {
    const view = await readInitialCanvasEditorView(
      ctx(),
      flagsLoader({ data: [{ key: 'ew.canvasDefaultView', value: 'split' }] }),
    );
    expect(view).to.equal('split');
  });

  it('returns layout when config flag has an invalid value', async () => {
    const view = await readInitialCanvasEditorView(
      ctx(),
      flagsLoader({ data: [{ key: 'ew.canvasDefaultView', value: 'unknown' }] }),
    );
    expect(view).to.equal('layout');
  });

  it('returns layout when config has no canvasDefaultView flag', async () => {
    const view = await readInitialCanvasEditorView(
      ctx(),
      flagsLoader({ data: [{ key: 'other.flag', value: 'true' }] }),
    );
    expect(view).to.equal('layout');
  });

  it('returns layout when config has no flags sheet', async () => {
    const view = await readInitialCanvasEditorView(ctx(), flagsLoader(undefined));
    expect(view).to.equal('layout');
  });
});
