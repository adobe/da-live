/* Fresh, isolated local services. This runner never targets an existing store. */
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { startWorker, ports } = require('./worker.cjs');
const { startNotificationGate } = require('./notification-gate.cjs');

const workspace = path.resolve(__dirname, '../../../..');
const approved = '/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode';
const root = process.env.H6_SCRATCH_ROOT;
if (process.argv.length !== 2 || !root || !path.isAbsolute(root) || fs.realpathSync(root) !== fs.realpathSync(approved)) throw new Error('Set H6_SCRATCH_ROOT to the approved scratch root; no arguments accepted');
for (const repo of ['da-rs', 'da-live', 'da-collab']) {
  if (execFileSync('git', ['-C', path.join(workspace, repo), 'branch', '--show-current'], { encoding: 'utf8' }).trim() !== 'rs-poc') throw new Error(`${repo} is not on rs-poc`);
}
const scratch = fs.mkdtempSync(path.join(fs.realpathSync(root), 'helix6-h5-'));
fs.chmodSync(scratch, 0o700);
const baseline = process.env.H6_BASELINE === '1';
if (baseline && (process.env.H6_LIVE || process.env.H6_FULL || process.env.H6_EARLY_FULL)) throw new Error('Baseline and live/full modes cannot be combined');
if (!baseline && process.env.H6_LIVE !== '1') throw new Error('Set H6_BASELINE=1 for the frozen baseline; H6_LIVE=1 is reserved for the coordinated live checkpoint');
if (!baseline && process.env.H6_BASELINE_NO_UPGRADE) throw new Error('Baseline discovery shim is forbidden in live mode');
if (process.env.H6_EARLY_FULL && process.env.H6_FULL) throw new Error('Choose early diagnostic or final full mode, not both');
if (process.env.H6_DIAGNOSTIC_BUILD && (baseline || process.env.H6_FULL)) throw new Error('Diagnostic build cannot run baseline or final full suite');
if (process.env.H6_CASE && process.env.H6_EARLY_FULL !== '1') throw new Error('Filtered cases are early diagnostics only');
const branch = process.env.H6_BRANCH === '1';
const branchOff = process.env.H6_BRANCH_GATE_OFF === '1';
if (branch && (baseline || process.env.H6_FULL || process.env.H6_EARLY_FULL || process.env.H6_CASE || process.env.H6_DIAGNOSTIC_BUILD)) throw new Error('B5 cannot be combined with baseline, H5 full, filters or diagnostic builds');
if ((process.env.H6_BRANCH_FULL || branchOff) && !branch) throw new Error('B5 modes require H6_BRANCH=1');
if (branchOff && process.env.H6_BRANCH_FULL) throw new Error('Gate-off is a separate B5 run');
const runtimeWorkspace = path.join(scratch, baseline ? 'baseline' : 'live');
const rs = path.join(runtimeWorkspace, 'da-rs');
const oak = path.join(scratch, 'oak');
fs.mkdirSync(oak, { mode: 0o700 });
console.log(`Scratch retained: ${scratch}`);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: workspace, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.status ?? result.error}`);
}

function archive(repo, revision) {
  const destination = path.join(runtimeWorkspace, repo);
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  const archivePath = path.join(scratch, `${repo}.tar`);
  const fd = fs.openSync(archivePath, 'w', 0o600);
  try {
    const result = spawnSync('git', ['-C', path.join(workspace, repo), 'archive', '--format=tar', revision], { stdio: ['ignore', fd, 'inherit'] });
    if (result.status !== 0) throw new Error(`Cannot archive ${repo} ${revision}`);
  } finally { fs.closeSync(fd); }
  run('tar', ['-xf', archivePath, '-C', destination]);
}

async function main() {
  if (process.env.H6_EARLY_FULL === '1') console.log(`EARLY ${process.env.H6_CASE ? `FILTERED ${process.env.H6_CASE}` : 'FULL'} DIAGNOSTIC: review gates remain open; this is not final H5 acceptance`);
  if (baseline) {
    archive('da-rs', '529232b');
    archive('da-live', '4265d3b4');
    archive('da-collab', '8219727');
  } else {
    fs.mkdirSync(runtimeWorkspace, { recursive: true, mode: 0o700 });
    for (const repo of ['da-rs', 'da-live', 'da-collab']) {
      const source = path.join(workspace, repo);
      const names = execFileSync('git', ['-C', source, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8').split('\0').filter((name) => {
        if (!name || name.split('/').some((part) => part.startsWith('.env') || part.startsWith('.dev.vars'))) return false;
        try { fs.lstatSync(path.join(source, name)); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
      });
      const fileList = path.join(scratch, `${repo}.files`);
      fs.writeFileSync(fileList, `${names.join('\0')}\0`, { mode: 0o600 });
      const exclusions = ['--exclude=node_modules', '--exclude=target', '--exclude=.env*', '--exclude=.dev.vars*'];
      if (repo === 'da-rs') exclusions.push('--exclude=/data', '--exclude=/demo-data');
      run('rsync', ['-a', '--from0', `--files-from=${fileList}`, ...exclusions, `${source}/`, `${runtimeWorkspace}/${repo}/`]);
    }
  }
  fs.symlinkSync(path.join(workspace, 'da-collab/node_modules'), path.join(runtimeWorkspace, 'da-collab/node_modules'));
  const buildArgs = ['-o', '-B', '-ntp', 'package', '-DskipTests', '-Dquarkus.analytics.disabled=true'];
  if (process.env.H6_DIAGNOSTIC_BUILD === '1') {
    console.log('Diagnostic scratch build: Spotless skipped; this is not an acceptance receipt');
    buildArgs.push('-Dspotless.skip=true');
  }
  const build = spawnSync('mvn', buildArgs, { cwd: rs, stdio: 'inherit' });
  if (build.status !== 0) throw new Error(`Scratch Maven build failed: ${build.status ?? build.error}`);
  const [port] = await ports(1);
  const restartKey = randomBytes(24).toString('hex');
  let restart;
  const importMap = '<script type="importmap">{"imports":{"da-lit":"/deps/lit/dist/index.js","da-y-wrapper":"/deps/da-y-wrapper/dist/index.js","da-parser":"/deps/da-parser/dist/index.js","hast-util-from-html":"/test/fixtures/hast-stub.js"}}</script>';
  const ui = http.createServer((request, response) => {
    const route = new URL(request.url, 'http://localhost').pathname;
    if (route === '/__restart' && request.method === 'POST') {
      if (request.headers['x-h6-restart'] !== restartKey || !restart) { response.writeHead(403).end(); return; }
      restart().then(() => response.writeHead(204).end(), () => response.writeHead(500).end());
      return;
    }
    if (!['/', '/browse', '/canvas', '/__empty'].includes(route)) { response.writeHead(404).end(); return; }
    if (route === '/__empty') { response.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><title>Local H6 CORS</title>${importMap}`); return; }
    response.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><meta charset="utf-8"><main><div id="route"></div></main>${importMap}<script type="module" src="/h6-shell.js"></script>`);
  });
  await new Promise((resolve, reject) => ui.once('error', reject).listen(0, '127.0.0.1', resolve));
  const uiOrigin = `http://127.0.0.1:${ui.address().port}`;
  const source = `http://localhost:${port}`;
  const token = randomBytes(24).toString('hex');
  const secret = randomBytes(24).toString('hex');
  let worker;
  let notifications;
  let child;
  let playwright;
  let log;
  const signal = () => { process.exitCode = 130; playwright?.kill('SIGTERM'); child?.kill('SIGTERM'); };
  process.on('SIGINT', signal);
  process.on('SIGTERM', signal);
  try {
    worker = await startWorker({ workspace: runtimeWorkspace, scratch, sourcePort: port, secret, diagnostic: process.env.H6_DIAGNOSTIC_BUILD === '1' });
    if (process.exitCode === 130) return;
    notifications = await startNotificationGate(worker.origin, source, secret);
    log = fs.openSync(path.join(scratch, 'da-rs.log'), 'w', 0o600);
    const identities = JSON.stringify({ [token]: { email: 'author@example.test', orgs: [] } });
    const javaArgs = ['-Dquarkus.http.host=127.0.0.1', `-Dquarkus.http.port=${port}`, '-Dda-rs.oak.type=segment', `-Dda-rs.oak.directory=${oak}`, `-Dda-rs.oak.blob-directory=${oak}/blobs`, '-Dda-rs.security.enabled=true', '-Dda-rs.security.identity-provider=local', `-Dda-rs.security.local-identities=${identities}`, `-Dda-rs.cors.allowed-origins=${uiOrigin}`, '-Dda-rs.helix6.enabled=true', ...(branchOff ? ['-Dda-rs.helix6.branching.enabled=false'] : []), `-Dda-rs.collab.origin=${notifications.origin}`, `-Dda-rs.collab.shared-secret=${secret}`, `-Dda-rs.admin.public-origin=${source}`, '-jar', path.join(rs, 'target/quarkus-app/quarkus-run.jar')];
    async function startSource() {
      child = spawn('java', javaArgs, { cwd: rs, stdio: ['ignore', log, log] });
      child.on('error', (error) => { child.spawnError = error; });
      console.log(`da-rs PID ${child.pid}; ${source}; UI ${uiOrigin}; Worker ${worker.origin}; logs ${scratch}`);
      let ready = false;
      for (let i = 0; i < 150; i += 1) {
        if (child.spawnError || child.exitCode !== null || child.signalCode !== null) throw new Error('da-rs exited; see da-rs.log');
        try {
          const rows = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim().split('\n');
          if (rows.length === 2) {
            if (!new RegExp(`\\s${child.pid}\\s`).test(rows[1]) || !rows[1].includes(`127.0.0.1:${port} (LISTEN)`)) throw new Error(`Unexpected Source listener: ${rows[1]}`);
            if ((await fetch(`${source}/q/health`, { redirect: 'error' })).ok) { ready = true; break; }
          }
        } catch (error) { if (error.message.startsWith('Unexpected')) throw error; }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!ready) throw new Error('da-rs did not become ready');
      fs.writeFileSync(path.join(scratch, 'owner.json'), JSON.stringify({ pid: child.pid }), { mode: 0o600 });
    }
    await startSource();
    let restarted = false;
    restart = async () => {
      if (restarted || child.exitCode !== null || child.signalCode !== null) throw new Error('Restart unavailable');
      restarted = true;
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
      await startSource();
    };
    const env = { ...process.env, H6_PORT: String(port), H6_RS_PID: String(child.pid), H6_RUN_PID: String(process.pid), H6_STORE: oak, H6_SCRATCH: scratch, H6_OUTPUT_DIR: path.join(scratch, 'results'), H6_UI_ORIGIN: uiOrigin, H6_UI_REPO: path.join(runtimeWorkspace, 'da-live'), H6_COLLAB_ORIGIN: worker.origin, H6_NOTICE_ORIGIN: notifications.origin, H6_NOTICE_NONCE: notifications.nonce, H6_PROBE_ORIGIN: worker.probeOrigin, H6_GATE_PORT: String(worker.gate.port), H6_GATE_NONCE: worker.gate.nonce, H6_RESTART_KEY: restartKey, H6_TOKEN: token };
    delete env.TEST_PASSWORD;
    for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'NODE_USE_ENV_PROXY']) delete env[key];
    env.NO_PROXY = '*';
    playwright = spawn(process.execPath, [path.join(__dirname, '../node_modules/@playwright/test/cli.js'), 'test', '-c', path.join(__dirname, branch ? 'playwright.branch.config.cjs' : 'playwright.config.cjs')], { cwd: __dirname, stdio: 'inherit', env });
    const result = await new Promise((resolve, reject) => { playwright.once('error', reject); playwright.once('exit', (code) => resolve(code ?? 1)); });
    if (process.exitCode !== 130) process.exitCode = result;
  } finally {
    if (child && !child.spawnError && child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await new Promise((resolve) => child.once('exit', resolve)); }
    if (log !== undefined) fs.closeSync(log);
    if (notifications) await notifications.dispose();
    if (worker) await worker.dispose();
    await new Promise((resolve) => ui.close(resolve));
    process.off('SIGINT', signal);
    process.off('SIGTERM', signal);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
