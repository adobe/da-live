module.exports = {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
    ['@semantic-release/npm', { npmPublish: false }],
    ['@semantic-release/git', {
      assets: ['package.json', 'package-lock.json', 'CHANGELOG.md'],
      message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    }],
    // Opens a no-impact change request in Adobe change management (iPaaS) for every release.
    // Credentials and instances come from the shared Helix AWS secret. The coordinator and the
    // approver mapping/defaults come from the DA_CHG_LDAP_MAP repo secret; approvers are resolved
    // from the release PRs by .github/scripts/chg-people.mjs (release job in .github/workflows/main.yaml).
    ['@adobe/semantic-release-ipaas-chg', { serviceId: 620732 /* DA */ }],
    '@semantic-release/github',
  ],
};
