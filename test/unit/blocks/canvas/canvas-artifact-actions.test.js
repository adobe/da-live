import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx, getNx, getNx2Api, getNxEWFlags } from '../../../../scripts/utils.js';
import { canvasBus } from '../../../../blocks/canvas/utils/canvas-bus.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { default: decorate } = await import('../../../../blocks/canvas/canvas.js');
const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { setPanelMocks } = await import(`${getNx()}/utils/panel.js`);
const { setChatAvailability } = await getNxEWFlags();
const { config: configApi, source: sourceApi } = await getNx2Api();

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
      request.resolve?.({ ok: true });
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
      expect(chat.artifactActionNames).to.deep.equal(['editor.viewDiff', 'editor.resetPage', 'editor.acceptChanges']);
      const event = { name: 'editor.viewDiff', context: { proposedPath: { path: '/proposals/page1' } } };
      const artifact = {
        id: 'proposal-artifact',
        dataModel: { proposals: { page1: '/allowed/site/.da/docs/page.html' } },
        components: [{ id: 'root', component: 'ActionButton', action: { event } }],
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

      const deleteDraft = sinon.stub(sourceApi, 'delete').resolves({ ok: true });
      const readDraft = sinon.stub(sourceApi, 'get').callsFake(async ({ path }) => (
        path.includes('/docs/page.html') ? { ok: false, status: 404 } : new Response('<p>Draft</p>')
      ));
      const saveOriginal = sinon.stub(sourceApi, 'save').resolves({ ok: true });
      chat.requestUpdate = sinon.spy();
      const reset = { name: 'editor.resetPage', context: { proposedPath: { path: '/proposals/page1' } } };
      const accept = { name: 'editor.acceptChanges', context: { proposals: { path: '/proposals' } } };
      const changes = {
        id: 'mounted-proposal',
        dataModel: { proposals: { page1: '/allowed/site/.da/docs/page.html', page2: '/allowed/site/.da/docs/next.html' } },
        components: [
          { id: 'root', component: 'Column', children: ['reset', 'accept'] },
          { id: 'reset', component: 'ActionButton', label: 'Reset page', action: { event: reset } },
          { id: 'accept', component: 'Button', label: 'Accept changes', action: { event: accept } },
        ],
      };
      await chat.onArtifactAction({ artifactId: changes.id, componentId: 'reset', ...reset }, changes);
      expect(deleteDraft.firstCall.args[0].path).to.equal('/.da/docs/page.html');
      expect(saveOriginal.called).to.equal(false);
      expect(changes.components[1].label).to.equal('Draft discarded');
      expect(changes.components[2].isDisabled).to.equal(false);
      await chat.onArtifactAction({ artifactId: changes.id, componentId: 'accept', ...accept }, changes);
      expect(readDraft.callCount).to.equal(1);
      expect(saveOriginal.firstCall.args[0]).to.deep.equal({ org: 'allowed', site: 'site', path: '/docs/next.html', body: '<p>Draft</p>' });
      expect(deleteDraft.secondCall.args[0].path).to.equal('/.da/docs/next.html');
      expect(changes.components[2].label).to.equal('Changes accepted');
      expect(chat.requestUpdate.callCount).to.equal(4);
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
