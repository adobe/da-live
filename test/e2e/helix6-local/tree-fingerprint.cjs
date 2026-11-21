/* Non-secret fingerprints for the frozen inputs of the unchanged legacy runner. */
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '../../../..');
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 128 * 1024 * 1024 });

function fingerprint(repo) {
  const root = path.join(workspace, repo);
  const branch = git(root, ['branch', '--show-current']).toString('utf8').trim();
  if (branch !== 'rs-poc') throw new Error(`${repo} is not on rs-poc`);
  const head = git(root, ['rev-parse', 'HEAD']).toString('utf8').trim();
  const hash = createHash('sha256');
  hash.update(`head\0${head}\0`);
  hash.update(git(root, ['diff', '--no-ext-diff', '--binary', 'HEAD', '--']));
  const names = git(root, ['ls-files', '--others', '--exclude-standard', '-z']).toString('utf8')
    .split('\0').filter((name) => name && !(repo === 'da-live' && name.startsWith('test/e2e/helix6-local/'))
      && !name.split('/').some((part) => part.startsWith('.env') || part.startsWith('.dev.vars'))).sort();
  const buffer = Buffer.allocUnsafe(64 * 1024);
  for (const name of names) {
    const file = path.join(root, name);
    const stat = fs.lstatSync(file);
    hash.update(`\0path\0${name}\0mode\0${stat.mode}\0size\0${stat.size}\0`);
    if (stat.isSymbolicLink()) { hash.update(`link\0${fs.readlinkSync(file)}\0`); continue; }
    if (!stat.isFile()) throw new Error(`Unsupported untracked path in ${repo}`);
    const fd = fs.openSync(file, 'r');
    try {
      let size;
      while ((size = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, size));
    } finally { fs.closeSync(fd); }
  }
  return { repo, branch, head, fingerprint: hash.digest('hex') };
}

console.log(JSON.stringify(['da-rs', 'da-live', 'da-collab'].map(fingerprint), null, 2));
