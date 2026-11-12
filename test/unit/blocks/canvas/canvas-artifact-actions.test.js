import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx, getNx, getNx2Api, getNxEWFlags } from '../../../../scripts/utils.js';
import { canvasBus } from '../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { default: decorate } = await import('../../../../blocks/canvas/canvas.js');
const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { setPanelMocks } = await import(`${getNx()}/utils/panel.js`);
const { setChatAvailability } = await getNxEWFlags();
const { config: configApi } = await getNx2Api();

describe('mounted canvas artifact actions', () => {
  it('passes the full comparison route context and tracks navigation', async () => {
    const wrapper = document.createElement('div');
    const block = document.createElement('div');
    wrapper.append(block);
    document.body.append(wrapper);
    hashChange._set({});
    const subscribe = sinon.spy(hashChange, 'subscribe');
    sinon.stub(configApi, 'get').resolves({ ok: true, permissions: [], json: async () => ({}) });
    const requests = [];
    sinon.stub(canvasBus.comparisonRequest, 'emit').callsFake((request) => {
      requests.push(request);
      request.resolve({ ok: true });
    });
    const registered = new Promise((resolve) => {
      setPanelMocks({ register: (section, options) => { if (section === 'chat') resolve(options); } });
    });
    setChatAvailability(async ({ org }) => org === 'allowed');
    try {
      await decorate(block);
      const context = { org: 'allowed', site: 'site', path: 'docs/page' };
      hashChange._set(context);
      const options = await registered;
      const chat = await options.getContent();
      const event = { name: 'editor.viewDiff', context: { proposedPath: { path: '/components/proposal/text' } } };
      const artifact = {
        id: 'proposal-artifact',
        components: [
          { id: 'root', component: 'ActionButton', action: { event } },
          { id: 'proposal', component: 'Text', text: '/allowed/site/.da/docs/page.html', visible: false },
        ],
      };
      await chat.onArtifactAction({ artifactId: artifact.id, componentId: 'root', ...event }, artifact);
      expect(requests).to.have.length(1);
      expect(requests[0].context).to.deep.equal(context);
      expect(requests[0].context.path).to.equal('docs/page');
      expect(requests[0].details.baseline).to.equal('source');

      const nextContext = { ...context, path: 'docs/next' };
      hashChange._set(nextContext);
      await chat.onArtifactAction({ artifactId: artifact.id, componentId: 'root', ...event }, artifact);
      expect(requests[1].context).to.deep.equal(nextContext);
    } finally {
      subscribe.returnValues.forEach((unsubscribe) => unsubscribe());
      setPanelMocks();
      setChatAvailability(async () => false);
      hashChange._set({});
      sinon.restore();
      wrapper.remove();
    }
  });
});
