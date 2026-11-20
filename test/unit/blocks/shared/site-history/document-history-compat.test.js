import { expect } from '@esm-bundle/chai';
import { formatVersions } from '../../../../../blocks/shared/version/helpers.js';
import { getVersionId } from '../../../../../blocks/shared/version/version-actions.js';

describe('log-backed per-document History compatibility', () => {
  it('keeps the existing version list and source lookup shape', () => {
    const raw = [{
      timestamp: 1715594886177,
      path: 'site/doc.html',
      users: [{ email: 'author@example.com' }],
      versionId: '2-0.html',
      url: '/versionsource/org/site/guid/2-0.html',
    }];
    const [entry] = formatVersions(raw);
    expect(entry.isVersion).to.be.true;
    expect(entry.users[0].email).to.equal('author@example.com');
    expect(getVersionId('/org/site/doc.html', entry)).to.equal('guid/2-0.html');
  });
});
