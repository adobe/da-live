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
    // Credentials, coordinator, approvers and instances come from the shared Helix AWS secret
    // (see the release jobs in .github/workflows/lint_test.yaml).
    ['@adobe/semantic-release-ipaas-chg', { serviceId: 620732 /* DA */ }],
    '@semantic-release/github',
  ],
};
