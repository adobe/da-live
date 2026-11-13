import { expect } from '@esm-bundle/chai';
import {
  getDaAdmin,
  COLLAB_ORIGIN,
  DA_ORIGIN,
  CON_ORIGIN,
  LIVE_PREVIEW_DOMAIN,
  DA_ETC_ORIGIN,
  AEM_ORIGIN,
  SUPPORTED_FILES,
  getLivePreviewUrl,
  getPreviewOrigin,
  getRenderableSrc,
  normalizeBranch,
} from '../../../../blocks/shared/constants.js';

import '../../milo.js';

describe('DA Admin', () => {
  it('Sets DA admin default', () => {
    const env = getDaAdmin();
    expect(env).to.equal('https://admin.da.live');
  });

  it('Sets DA admin stage', () => {
    const env = getDaAdmin({ href: 'http://localhost:3000/?da-admin=stage' });
    expect(env).to.equal('https://stage-admin.da.live');
  });

  it('Gets cached DA admin stage', () => {
    const env = getDaAdmin();
    expect(env).to.equal('https://stage-admin.da.live');
  });

  it('Resets DA admin', () => {
    const env = getDaAdmin({ href: 'http://localhost:3000/?da-admin=reset' });
    expect(env).to.equal('https://admin.da.live');
  });
});

describe('Other origins', () => {
  it('Sets DA Origin', () => {
    expect(DA_ORIGIN).to.equal('https://admin.da.live');
  });

  it('Sets Content Origin', () => {
    expect(CON_ORIGIN).to.equal('https://content.da.live');
  });

  it('Sets Live Preview Domain', () => {
    expect(LIVE_PREVIEW_DOMAIN).to.equal('preview.da.live');
  });

  it('Sets DA Etc Origin', () => {
    expect(DA_ETC_ORIGIN).to.equal('https://da-etc.adobeaem.workers.dev');
  });

  it('Sets AEM Origin', () => {
    expect(AEM_ORIGIN).to.equal('https://admin.hlx.page');
  });
});

describe('DA Collab', () => {
  it('Gets DA Collab default', () => {
    expect(COLLAB_ORIGIN).to.equal('wss://collab.da.live');
  });
});

describe('SUPPORTED_FILES', () => {
  it('Maps common content types', () => {
    expect(SUPPORTED_FILES.html).to.equal('text/html');
    expect(SUPPORTED_FILES.json).to.equal('application/json');
    expect(SUPPORTED_FILES.svg).to.equal('image/svg+xml');
    expect(SUPPORTED_FILES.mp4).to.equal('video/mp4');
    expect(SUPPORTED_FILES.pdf).to.equal('application/pdf');
  });
});

describe('getLivePreviewUrl', () => {
  it('Builds a https URL for the prod preview domain', () => {
    expect(getLivePreviewUrl('adobecom', 'da-bacom')).to.equal(
      'https://main--da-bacom--adobecom.preview.da.live',
    );
  });

  it('Builds a URL using the given branch instead of main', () => {
    expect(getLivePreviewUrl('adobecom', 'da-bacom', 'feature-branch')).to.equal(
      'https://feature-branch--da-bacom--adobecom.preview.da.live',
    );
  });
});

describe('normalizeBranch', () => {
  it('uses main by default', () => {
    expect(normalizeBranch()).to.equal('main');
  });

  it('lowercases the branch and replaces characters a hostname cannot hold', () => {
    expect(normalizeBranch('Feat/My_Branch.2')).to.equal('feat-my-branch-2');
  });

  it('keeps a branch that is already a hostname label', () => {
    expect(normalizeBranch('feature-1')).to.equal('feature-1');
  });
});

describe('getPreviewOrigin', () => {
  it('uses main branch by default', () => {
    const origin = getPreviewOrigin('myorg', 'myrepo');
    expect(origin).to.include('main--myrepo--myorg');
  });

  it('uses the provided branch', () => {
    const origin = getPreviewOrigin('myorg', 'myrepo', 'feature');
    expect(origin).to.include('feature--myrepo--myorg');
  });

  it('uses the same hostname normalization as Send for slash and mixed-case branches', () => {
    expect(getPreviewOrigin('myorg', 'myrepo', 'Feat/My_Branch'))
      .to.include('feat-my-branch--myrepo--myorg');
  });

  it('uses main when branch is explicitly main', () => {
    const origin = getPreviewOrigin('myorg', 'myrepo', 'main');
    expect(origin).to.include('main--myrepo--myorg');
  });
});

const mediaCtx = { org: 'org', repo: 'repo', path: '/org/repo/page' };

describe('getRenderableSrc', () => {
  // the same origin the canvas fetches its preview cookie from, which is stage off da.live
  it('rewrites a relative media src to the origin the canvas logged into', () => {
    expect(getRenderableSrc('./media_123.png', mediaCtx)).to.equal(
      'https://main--repo--org.stage-preview.da.live/media_123.png',
    );
  });

  it('answers null for a src that is not on the media bus', () => {
    expect(getRenderableSrc('https://example.com/foo.png', mediaCtx)).to.equal(null);
    expect(getRenderableSrc('/media_123.png', mediaCtx)).to.equal(null);
    expect(getRenderableSrc(null, mediaCtx)).to.equal(null);
  });

  it('answers null when the ctx names no site', () => {
    expect(getRenderableSrc('./media_123.png', { org: 'org' })).to.equal(null);
    expect(getRenderableSrc('./media_123.png', null)).to.equal(null);
  });
});
