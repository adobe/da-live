/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx, getNx2Api } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

before(async () => {
  await import('../../../../../blocks/canvas/ew-editor-wysiwyg/ew-editor-wysiwyg.js');
});

describe('WYSIWYG shared canvas branch', () => {
  let el;
  beforeEach(() => {
    el = document.createElement('ew-editor-wysiwyg');
    document.body.append(el);
  });
  afterEach(() => {
    el.remove();
    sinon.restore();
  });

  it('consumes the canvas promise without fetching branch config again', async () => {
    const { config } = await getNx2Api();
    const get = sinon.spy(config, 'get');
    el.ctx = { org: 'org', repo: 'site', path: 'org/site/page', branchPromise: Promise.resolve('selected') };
    await el.updateComplete;
    await el.ctx.branchPromise;
    expect(el._wysiwygBranch).to.equal('selected');
    expect(get.called).to.be.false;
  });

  it('ignores an older branch promise after a context change', async () => {
    let finish;
    el.ctx = {
      org: 'org',
      repo: 'site',
      path: 'org/site/old',
      branchPromise: new Promise((resolve) => { finish = resolve; }),
    };
    await el.updateComplete;
    el.ctx = { org: 'org', repo: 'site', path: 'org/site/new', branchPromise: Promise.resolve('new') };
    await el.updateComplete;
    await el.ctx.branchPromise;
    finish('old');
    await Promise.resolve();
    expect(el._wysiwygBranch).to.equal('new');
  });

  it('shows a branch error instead of loading a main-branch iframe', async () => {
    let fail;
    el.ctx = {
      org: 'org',
      repo: 'site',
      path: 'org/site/page',
      branchPromise: new Promise((resolve, reject) => { fail = reject; }),
    };
    await el.updateComplete;
    fail(new Error('Config unavailable'));
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('iframe')).to.be.null;
    expect(el.shadowRoot.textContent).to.include('Unable to load preview.');
  });
});
