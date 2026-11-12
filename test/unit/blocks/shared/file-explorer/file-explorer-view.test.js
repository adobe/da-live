import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import createFileExplorerView, {
  FILE_EXPLORER_TAG,
  FILE_EXPLORER_VIEW_ID,
} from '../../../../../blocks/shared/file-explorer/file-explorer-view.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

describe('createFileExplorerView', () => {
  it('describes the Content view of the editor section', () => {
    const { load, ...view } = createFileExplorerView();
    expect(view).to.deep.equal({
      id: 'files',
      label: 'Content',
      section: 'Editor',
      firstParty: true,
    });
    expect(view.id).to.equal(FILE_EXPLORER_VIEW_ID);
    expect(load).to.be.a('function');
  });

  it('loads the file explorer element', async () => {
    const element = await createFileExplorerView().load();
    expect(element.localName).to.equal('da-file-explorer');
    expect(element).to.be.instanceOf(customElements.get(FILE_EXPLORER_TAG));
  });
});
