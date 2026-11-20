import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import createPreflightView, {
  PREFLIGHT_TAG,
  PREFLIGHT_VIEW_ID,
} from '../../../../../blocks/shared/preflight/preflight-view.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

describe('createPreflightView', () => {
  it('describes the Preflight view of the editor section', () => {
    const { load, ...view } = createPreflightView();
    expect(view).to.deep.equal({
      id: 'preflight',
      label: 'Preflight',
      section: 'Editor',
      firstParty: true,
    });
    expect(view.id).to.equal(PREFLIGHT_VIEW_ID);
    expect(load).to.be.a('function');
  });

  it('loads a Preflight element', async () => {
    const element = await createPreflightView().load();
    expect(element.localName).to.equal('da-preflight');
    expect(element).to.be.instanceOf(customElements.get(PREFLIGHT_TAG));
  });

  it('loads a new element each time', async () => {
    const view = createPreflightView();
    expect(await view.load()).to.not.equal(await view.load());
  });
});
