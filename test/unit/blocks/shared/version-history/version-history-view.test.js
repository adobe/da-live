import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import createVersionHistoryView, {
  VERSION_HISTORY_TAG,
  VERSION_HISTORY_VIEW_ID,
} from '../../../../../blocks/shared/version-history/version-history-view.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const noop = () => {};

const createEditor = () => ({
  canWrite: () => false,
  subscribe: () => noop,
  fetchVersion: async () => null,
  getCurrentHtml: () => null,
  restore: async () => false,
  getCompareArea: () => [],
});

describe('createVersionHistoryView', () => {
  it('describes the Versions view of the editor section', () => {
    const { load, ...view } = createVersionHistoryView({ editor: createEditor() });
    expect(view).to.deep.equal({
      id: 'versions',
      label: 'Versions',
      section: 'Editor',
      firstParty: true,
    });
    expect(view.id).to.equal(VERSION_HISTORY_VIEW_ID);
    expect(load).to.be.a('function');
  });

  it('loads a version history element with the editor', async () => {
    const editor = createEditor();
    const element = await createVersionHistoryView({ editor }).load();
    expect(element.localName).to.equal('da-version-history');
    expect(element).to.be.instanceOf(customElements.get(VERSION_HISTORY_TAG));
    expect(element.editor).to.equal(editor);
  });

  it('requires the editor port', () => {
    expect(() => createVersionHistoryView()).to.throw(TypeError, 'createVersionHistoryView needs editor.canWrite');
  });

  it('names the editor functions that are missing', () => {
    const editor = { ...createEditor(), restore: 'yes', getCompareArea: undefined };
    expect(() => createVersionHistoryView({ editor }))
      .to.throw(TypeError, 'createVersionHistoryView needs editor.restore, editor.getCompareArea');
  });
});
