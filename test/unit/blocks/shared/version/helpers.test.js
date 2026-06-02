import { expect } from '@esm-bundle/chai';
import { formatDate } from '../../../../../blocks/shared/utils.js';
import { formatVersions } from '../../../../../blocks/shared/version/helpers.js';

const TIME_OPTS = { hour: 'numeric', minute: '2-digit' };
const DATE_OPTS = { year: 'numeric', month: 'short', day: 'numeric' };

describe('Versions helper', () => {
  it('Format date', () => {
    const { date: d, time: t } = formatDate(1709205071123);

    expect(d).to.equal(new Date(1709205071123).toLocaleDateString([], DATE_OPTS));
    expect(t).to.equal(new Date(1709205071123).toLocaleTimeString([], TIME_OPTS));
  });

  it('Format date of now', () => {
    let before = formatDate();
    let now = new Date();
    let after = formatDate();

    if (JSON.stringify(before) !== JSON.stringify(after)) {
      // We just hit a point where there is a changeover, so try again
      before = formatDate();
      now = new Date();
      after = formatDate();
    }

    expect(before).to.deep.equal(after);
    const expectedDate = now.toLocaleDateString(undefined, DATE_OPTS);
    const expectedTime = now.toLocaleTimeString(undefined, TIME_OPTS);
    expect(expectedDate).to.equal(after.date);
    expect(expectedTime).to.equal(after.time);
  });

  it('Format versions', () => {
    const versions = [{
      url: '/versionsource/joey/abc.html',
      users: [{ email: 'anonymous' }],
      timestamp: 1715594886177,
      path: 'da-aem-boilerplate/blah7.html',
    }, {
      users: [{ email: 'furb@acme.com' }, { email: 'anonymous' }],
      timestamp: 1715766906908,
      path: 'da-aem-boilerplate/blah7.html',
    }, {
      users: [{ email: 'anonymous' }],
      timestamp: 1715701875589,
      path: 'da-aem-boilerplate/blah7.html',
    }, {
      users: [{ email: 'joe@acme.com' }],
      timestamp: 1715766405165,
      path: 'da-aem-boilerplate/blah7.html',
    }, {
      url: '/versionsource/joey/ghi.html',
      users: [{ email: 'joe@acme.com' }],
      timestamp: 1715766894180,
      path: 'da-aem-boilerplate/blah7.html',
      label: 'hello',
    }, {
      url: '/versionsource/joey/def.html',
      users: [{ email: 'anonymous' }],
      timestamp: 1715594902707,
      path: 'da-aem-boilerplate/blah7.html',
    }];

    const formatted = formatVersions(versions);

    const expected = [{
      // Audit AFTER the version (newer, same day)
      date: new Date(1715766906908).toLocaleDateString([], DATE_OPTS),
      audits: [{
        date: new Date(1715766906908).toLocaleDateString([], DATE_OPTS),
        time: new Date(1715766906908).toLocaleTimeString([], TIME_OPTS),
        users: [{ email: 'furb@acme.com' }, { email: 'anonymous' }],
        timestamp: 1715766906908,
        path: 'da-aem-boilerplate/blah7.html',
        isVersion: false,
      }],
    }, {
      date: new Date(1715766894180).toLocaleDateString([], DATE_OPTS),
      time: new Date(1715766894180).toLocaleTimeString([], TIME_OPTS),
      url: '/versionsource/joey/ghi.html',
      users: [{ email: 'joe@acme.com' }],
      timestamp: 1715766894180,
      path: 'da-aem-boilerplate/blah7.html',
      label: 'hello',
      isVersion: true,
    }, {
      // Audit BEFORE the version (older, same day — separate group)
      date: new Date(1715766405165).toLocaleDateString([], DATE_OPTS),
      audits: [{
        date: new Date(1715766405165).toLocaleDateString([], DATE_OPTS),
        time: new Date(1715766405165).toLocaleTimeString([], TIME_OPTS),
        users: [{ email: 'joe@acme.com' }],
        timestamp: 1715766405165,
        path: 'da-aem-boilerplate/blah7.html',
        isVersion: false,
      }],
    }, {
      date: new Date(1715701875589).toLocaleDateString([], DATE_OPTS),
      audits: [{
        date: new Date(1715701875589).toLocaleDateString([], DATE_OPTS),
        time: new Date(1715701875589).toLocaleTimeString([], TIME_OPTS),
        users: [{ email: 'anonymous' }],
        timestamp: 1715701875589,
        path: 'da-aem-boilerplate/blah7.html',
        isVersion: false,
      }],
    }, {
      date: new Date(1715594902707).toLocaleDateString([], DATE_OPTS),
      time: new Date(1715594902707).toLocaleTimeString([], TIME_OPTS),
      url: '/versionsource/joey/def.html',
      users: [{ email: 'anonymous' }],
      timestamp: 1715594902707,
      path: 'da-aem-boilerplate/blah7.html',
      isVersion: true,
    }, {
      date: new Date(1715594886177).toLocaleDateString([], DATE_OPTS),
      time: new Date(1715594886177).toLocaleTimeString([], TIME_OPTS),
      url: '/versionsource/joey/abc.html',
      users: [{ email: 'anonymous' }],
      timestamp: 1715594886177,
      path: 'da-aem-boilerplate/blah7.html',
      isVersion: true,
    }];

    expect(formatted).to.deep.equal(expected);
  });

  it('Does not group audit entries across a labelled version on the same day', () => {
    // All three entries are on 2024-05-18 UTC, but the version sits between the two audits:
    // ts_after (12:00) | ts_version (11:00, labelled) | ts_before (10:00)
    const TS_AFTER = 1716033600000;
    const TS_VERSION = 1716030000000;
    const TS_BEFORE = 1716026400000;

    const versions = [{
      users: [{ email: 'after@acme.com' }],
      timestamp: TS_AFTER,
      path: 'org/repo/doc.html',
    }, {
      url: '/versionsource/org/v1.html',
      users: [{ email: 'tagger@acme.com' }],
      timestamp: TS_VERSION,
      path: 'org/repo/doc.html',
      label: 'v1',
    }, {
      users: [{ email: 'before@acme.com' }],
      timestamp: TS_BEFORE,
      path: 'org/repo/doc.html',
    }];

    const formatted = formatVersions(versions);

    expect(formatted).to.have.length(3);

    // First block: audit group AFTER the version
    expect(formatted[0].isVersion).to.be.undefined;
    expect(formatted[0].audits).to.have.length(1);
    expect(formatted[0].audits[0].users[0].email).to.equal('after@acme.com');

    // Second block: the labelled version
    expect(formatted[1].isVersion).to.be.true;
    expect(formatted[1].label).to.equal('v1');

    // Third block: audit group BEFORE the version (same date, but separate group)
    expect(formatted[2].isVersion).to.be.undefined;
    expect(formatted[2].audits).to.have.length(1);
    expect(formatted[2].audits[0].users[0].email).to.equal('before@acme.com');
  });
});
