import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';
import createPreflightView, {
  PREFLIGHT_TAG,
  PREFLIGHT_VIEW_ID,
} from '../../../../../blocks/shared/preflight/preflight-view.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const noop = () => {};

const createPage = () => ({ subscribeActiveView: () => noop });

const createEvaluator = () => ({ evaluate: async () => ({ failed: 0 }) });

function createPublishHook() {
  return { subscribeRunRequest: () => noop, takePendingRunRequest: () => null, reportStatus: noop };
}

// The ports every Preflight view needs.
const requiredPorts = () => ({ page: createPage(), evaluator: createEvaluator() });

describe('createPreflightView', () => {
  it('describes the Preflight view of the editor section', () => {
    const { load, ...view } = createPreflightView(requiredPorts());
    expect(view).to.deep.equal({
      id: 'preflight',
      label: 'Preflight',
      section: 'Editor',
      firstParty: true,
    });
    expect(view.id).to.equal(PREFLIGHT_VIEW_ID);
    expect(load).to.be.a('function');
  });

  it('loads a Preflight element with all ports', async () => {
    const ports = { ...requiredPorts(), publishHook: createPublishHook() };
    const element = await createPreflightView(ports).load();
    expect(element.localName).to.equal('da-preflight');
    expect(element).to.be.instanceOf(customElements.get(PREFLIGHT_TAG));
    expect(element.page).to.equal(ports.page);
    expect(element.evaluator).to.equal(ports.evaluator);
    expect(element.publishHook).to.equal(ports.publishHook);
  });

  it('loads a Preflight element without a publish hook', async () => {
    const ports = requiredPorts();
    const element = await createPreflightView(ports).load();
    expect(element.page).to.equal(ports.page);
    expect(element.publishHook).to.equal(undefined);
  });

  it('loads a new element each time', async () => {
    const view = createPreflightView(requiredPorts());
    expect(await view.load()).to.not.equal(await view.load());
  });

  describe('validation', () => {
    it('requires the page port', () => {
      expect(() => createPreflightView()).to.throw(TypeError, 'createPreflightView needs page.subscribeActiveView');
      expect(() => createPreflightView({ evaluator: createEvaluator() })).to.throw(TypeError, 'page.subscribeActiveView');
    });

    it('requires the evaluator port', () => {
      expect(() => createPreflightView({ page: createPage() })).to.throw(TypeError, 'createPreflightView needs evaluator.evaluate');
      const evaluator = { evaluate: 'remote' };
      expect(() => createPreflightView({ page: createPage(), evaluator })).to.throw(TypeError, 'evaluator.evaluate');
    });

    it('names the publish hook functions that are missing', () => {
      const publishHook = { subscribeRunRequest: () => noop };
      expect(() => createPreflightView({ ...requiredPorts(), publishHook }))
        .to.throw(TypeError, 'publishHook.takePendingRunRequest, publishHook.reportStatus');
    });

    it('treats a missing publish hook as no hook', () => {
      const ports = requiredPorts();
      expect(() => createPreflightView({ ...ports, publishHook: undefined })).to.not.throw();
      expect(() => createPreflightView({ ...ports, publishHook: null })).to.not.throw();
    });
  });
});
