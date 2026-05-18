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
});
