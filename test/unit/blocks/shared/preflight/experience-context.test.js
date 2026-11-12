import { expect } from '@esm-bundle/chai';
import createExperienceContextEvaluator from '../../../../../blocks/shared/preflight/experience-context.js';
import { adaptEvaluation } from '../../../../../blocks/shared/preflight/evaluation.js';

const PAGE = { org: 'org', site: 'site', path: '/a', fullpath: '/org/site/a.html' };

describe('createExperienceContextEvaluator', () => {
  let saved;
  let checkedUrls;
  let respond;

  beforeEach(() => {
    saved = { fetch: window.fetch, ims: window.adobeIMS, nxIms: localStorage.getItem('nx-ims') };
    localStorage.setItem('nx-ims', 'true');
    window.adobeIMS = { getAccessToken: () => ({ token: 'tok' }) };
    checkedUrls = [];
    respond = () => new Response('{}', { status: 200 });
    window.fetch = async (url, init) => {
      checkedUrls.push(JSON.parse(init.body).url);
      return respond();
    };
  });

  afterEach(() => {
    window.fetch = saved.fetch;
    window.adobeIMS = saved.ims;
    if (saved.nxIms === null) {
      localStorage.removeItem('nx-ims');
    } else {
      localStorage.setItem('nx-ims', saved.nxIms);
    }
  });

  it('requires a resolveBranch function', () => {
    expect(() => createExperienceContextEvaluator()).to.throw(TypeError, 'createExperienceContextEvaluator needs a resolveBranch function');
    expect(() => createExperienceContextEvaluator({ resolveBranch: 'main' })).to.throw(TypeError);
  });

  it('checks the preview of the page on its branch', async () => {
    const branchRequests = [];
    const evaluator = createExperienceContextEvaluator({
      resolveBranch: async (request) => {
        branchRequests.push(request);
        return 'Feat/One';
      },
    });
    await evaluator.evaluate(PAGE);
    expect(branchRequests).to.deep.equal([{ org: 'org', site: 'site', path: 'a' }]);
    expect(checkedUrls).to.have.lengthOf(1);
    expect(checkedUrls[0]).to.match(/^https:\/\/feat-one--site--org\.[^/]+\/a$/);
  });

  it('checks the site root when no page path is open', async () => {
    const branchRequests = [];
    const evaluator = createExperienceContextEvaluator({
      resolveBranch: async (request) => {
        branchRequests.push(request);
        return 'main';
      },
    });
    await evaluator.evaluate({ org: 'org', site: 'site', fullpath: '' });
    expect(branchRequests).to.deep.equal([{ org: 'org', site: 'site', path: undefined }]);
    expect(checkedUrls[0]).to.match(/^https:\/\/main--site--org\.[^/]+$/);
  });

  it('resolves to the renderer data of the response', async () => {
    const response = {
      site_code_evaluation: {
        evaluations: [{
          check_title: 'Page has exactly one H1',
          alignment: 'NO',
          reasoning: 'No H1 heading found.',
          suggestions: null,
          category: null,
        }],
      },
    };
    respond = () => new Response(JSON.stringify(response), { status: 200 });
    const data = await createExperienceContextEvaluator({ resolveBranch: async () => 'main' }).evaluate(PAGE);
    expect(data).to.deep.equal(adaptEvaluation(response));
    expect(data.failed).to.equal(1);
  });

  it('rejects with the reason instead of guessing a branch', async () => {
    const evaluator = createExperienceContextEvaluator({ resolveBranch: async () => undefined });
    const error = await evaluator.evaluate(PAGE).catch((e) => e);
    expect(error).to.be.instanceOf(Error);
    expect(error.detail).to.contain('preview branch');
    expect(checkedUrls).to.deep.equal([]);
  });

  it('rejects with the reason of the API when the checks cannot run', async () => {
    respond = () => new Response(JSON.stringify({ detail: 'Page not found' }), { status: 404 });
    const evaluator = createExperienceContextEvaluator({ resolveBranch: async () => 'main' });
    const error = await evaluator.evaluate(PAGE).catch((e) => e);
    expect(error.detail).to.equal('Page not found (404)');
  });
});
