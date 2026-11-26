import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { createConditionalSheetSession } from '../../../../blocks/sheet/utils/conditional-save.js';
import { lockBranchEditing, unlockBranchEditing } from '../../../../blocks/shared/branch-conflicts/editing-lock.js';

const INSTANCE = '71bb4b72-b604-4cc7-99c8-c3e288223a89';
const OTHER = '6a5a58e0-2884-4941-b232-8b2e4a462e03';
const DETAILS = { org: 'demo', site: 'work~draft', path: '/a sheet.json', view: 'sheet' };

function response(status, tag = '"one"', instance = INSTANCE) {
  const headers = { 'content-branch': 'draft', 'x-da-source-mode': 'helix6', 'x-da-branch-instance': instance };
  if (tag) headers.ETag = tag;
  const resp = new Response('', { status, headers });
  resp.permissions = ['read', 'write'];
  return resp;
}

describe('conditional Sheet save session', () => {
  let href;
  beforeEach(() => {
    href = window.location.href;
    window.history.replaceState(null, '', '/sheet#/demo/work~draft/a%20sheet');
  });
  afterEach(() => {
    unlockBranchEditing();
    window.history.replaceState(null, '', href);
  });

  it('uses the captured branch and strong ETag and advances the validator', async () => {
    const replace = sinon.stub();
    replace.onFirstCall().resolves(response(201, '"two"'));
    replace.onSecondCall().resolves(response(201, '"three"'));
    const session = await createConditionalSheetSession({
      details: DETAILS,
      branch: 'draft',
      response: response(200),
      source: {},
      getApi: async () => ({ source: { replace } }),
    });
    await session.save('{"a":1}');
    await session.save('{"a":2}');
    expect(replace.firstCall.args).to.deep.equal([
      { org: 'demo', site: 'work~draft', path: '/a sheet.json' },
      { body: '{"a":1}', ifMatch: '"one"', branchInstance: INSTANCE },
    ]);
    expect(replace.secondCall.args[1]).to.deep.equal({ body: '{"a":2}', ifMatch: '"two"', branchInstance: INSTANCE });
  });

  it('pins the branch before creating a missing Sheet', async () => {
    const source = { getMetadata: sinon.stub().resolves(response(200, null)) };
    const replace = sinon.stub().resolves(response(201, '"created"'));
    const session = await createConditionalSheetSession({
      details: DETAILS,
      branch: 'draft',
      response: response(404, null),
      source,
      getApi: async () => ({ source: { replace } }),
    });
    await session.save('{}');
    expect(source.getMetadata.firstCall.args[0]).to.deep.equal({ org: 'demo', site: 'work~draft', path: '/' });
    expect(replace.firstCall.args[1]).to.deep.equal({ body: '{}', ifNoneMatch: '*', branchInstance: INSTANCE });
  });

  it('retains the edit and blocks retry after a stale precondition', async () => {
    const replace = sinon.stub().resolves(response(412));
    const session = await createConditionalSheetSession({
      details: DETAILS,
      branch: 'draft',
      response: response(200),
      source: {},
      getApi: async () => ({ source: { replace } }),
    });
    let error = await session.save('{}').catch((e) => e);
    expect(error.message).to.contain('412');
    error = await session.save('{}').catch((e) => e);
    expect(error.message).to.contain('locked');
    expect(replace.calledOnce).to.equal(true);
  });

  it('fails closed for missing or weak validators, wrong branch and replaced instances', async () => {
    for (const bad of [response(200, null), response(200, 'W/"weak"'), response(200, '"x"', 'bad')]) {
      let error;
      try {
        // eslint-disable-next-line no-await-in-loop
        await createConditionalSheetSession({ details: DETAILS, branch: 'draft', response: bad, source: {} });
      } catch (e) { error = e; }
      expect(error).to.be.instanceOf(Error);
    }
    const replace = sinon.stub().resolves(response(201, '"next"', OTHER));
    const session = await createConditionalSheetSession({
      details: DETAILS,
      branch: 'draft',
      response: response(200),
      source: {},
      getApi: async () => ({ source: { replace } }),
    });
    let error = await session.save('{}').catch((e) => e);
    expect(error.message).to.contain('could not be verified');
    error = await session.save('{}').catch((e) => e);
    expect(error.message).to.contain('locked');
    expect(replace.calledOnce).to.equal(true);
  });

  it('does not save after navigation or while branch sync is active', async () => {
    const replace = sinon.stub().resolves(response(201, '"next"'));
    const session = await createConditionalSheetSession({
      details: DETAILS,
      branch: 'draft',
      response: response(200),
      source: {},
      getApi: async () => ({ source: { replace } }),
    });
    lockBranchEditing();
    let error = await session.save('{}').catch((e) => e);
    expect(error.message).to.contain('locked');
    unlockBranchEditing();
    window.history.replaceState(null, '', '/sheet#/demo/work~draft/other');
    error = await session.save('{}').catch((e) => e);
    expect(error.message).to.contain('context changed');
    expect(replace.called).to.equal(false);
  });
});
