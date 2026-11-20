/* Local-only runner. Every invocation gets a new source copy and empty Oak store. */
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');

const workspace = path.resolve(__dirname, '../../../..');
const tempRoot = process.env.POC_SCRATCH_ROOT;
const approvedRoot = '/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode';
if (process.argv.length > 2 || (process.env.POC_MODE && !['collab', 'product'].includes(process.env.POC_MODE))) {
  throw new Error('No Playwright arguments are accepted; POC_MODE must be collab or product');
}
if (!tempRoot || !path.isAbsolute(tempRoot) || fs.realpathSync(tempRoot) !== fs.realpathSync(approvedRoot)) {
  throw new Error('Set POC_SCRATCH_ROOT to the approved opencode scratch directory');
}
const scratch = fs.mkdtempSync(path.join(fs.realpathSync(tempRoot), 'branching-i2-'));
fs.chmodSync(scratch, 0o700);
const rs = path.join(scratch, 'rs');
const oak = path.join(scratch, 'oak');
fs.mkdirSync(oak, { mode: 0o700 });
console.log(`Scratch (retained): ${scratch}`);

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.status ?? result.error}`);
}

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function main() {
  for (const repo of ['da-rs', 'da-live', 'da-collab']) {
    const branch = execFileSync('git', ['-C', path.join(workspace, repo), 'branch', '--show-current'], { encoding: 'utf8' }).trim();
    if (branch !== 'rs-poc') throw new Error(`${repo} is not on rs-poc`);
  }
  run('rsync', ['-a', '--exclude=.git', '--exclude=target', '--exclude=data', '--exclude=.idea', '--exclude=demo-data', '--exclude=.env*', '--exclude=.dev.vars*', `${workspace}/da-rs/`, `${rs}/`], workspace);
  run('mvn', ['-o', '-B', '-ntp', 'package', '-DskipTests', '-Dquarkus.analytics.disabled=true'], rs);
  const port = await unusedPort();
  const collabMode = ['collab', 'product'].includes(process.env.POC_MODE);
  let sink;
  let collab;
  let notificationOrigin;
  if (collabMode) {
    const { startCollab } = require('./collab-host.cjs');
    collab = await startCollab({ workspace, scratch, sourcePort: port });
    notificationOrigin = collab.url;
  } else {
    // This sink is not collab and cannot validate room invalidation.
    sink = http.createServer((request, response) => { response.writeHead(503); response.end(); });
    await new Promise((resolve, reject) => sink.once('error', reject).listen(0, '127.0.0.1', resolve));
    notificationOrigin = `http://127.0.0.1:${sink.address().port}`;
  }
  const log = fs.openSync(path.join(scratch, 'da-rs.log'), 'w', 0o600);
  const javaArgs = [
    '-Dquarkus.http.host=127.0.0.1', `-Dquarkus.http.port=${port}`,
    '-Dda-rs.oak.type=segment', `-Dda-rs.oak.directory=${oak}`,
    `-Dda-rs.oak.blob-directory=${oak}/blobs`, '-Dda-rs.security.enabled=false',
    `-Dda-rs.collab.origin=${notificationOrigin}`,
    '-Dda-rs.admin.public-origin=http://localhost:8787',
    '-jar', path.join(rs, 'target/quarkus-app/quarkus-run.jar'),
  ];
  const child = spawn('java', javaArgs, { cwd: rs, stdio: ['ignore', log, log] });
  let childError;
  child.on('error', (error) => { childError = error; });
  let playwright;
  const interrupt = () => {
    process.exitCode = 130;
    playwright?.kill('SIGTERM');
    child.kill('SIGTERM');
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  console.log(`da-rs PID ${child.pid}; 127.0.0.1:${port}; notifications ${notificationOrigin}; log ${scratch}/da-rs.log`);
  if (collab) console.log(`Real collab Worker Source bridge log: ${collab.log}`);
  try {
    let ready = false;
    for (let i = 0; i < 100; i += 1) {
      if (childError || child.exitCode !== null || child.signalCode !== null) throw new Error(`da-rs exited; see log: ${childError || child.exitCode || child.signalCode}`);
      try {
        const pids = execFileSync('lsof', ['-t', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim();
        if (pids === String(child.pid)) {
          const response = await fetch(`http://127.0.0.1:${port}/q/health`, { redirect: 'error' });
          if (response.ok) { ready = true; break; }
        } else if (pids) throw new Error(`Port ${port} is owned by ${pids}, not child ${child.pid}`);
      } catch (error) {
        if (error.message.includes('is owned by')) throw error;
      }
      await new Promise((resolve) => { setTimeout(resolve, 100); });
    }
    if (!ready) throw new Error('Owned loopback da-rs did not become ready; see log');
    const env = { ...process.env, POC_PORT: String(port), POC_RS_PID: String(child.pid), POC_RUN_PID: String(process.pid), POC_STORE: oak, POC_SCRATCH: scratch, POC_OUTPUT_DIR: path.join(scratch, 'results'), POC_COLLAB_ORIGIN: collab?.url || '', POC_GATE_PORT: String(collab?.gate.port || ''), POC_GATE_NONCE: collab?.gate.nonce || '' };
    delete env.TEST_PASSWORD;
    for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'NODE_USE_ENV_PROXY']) delete env[key];
    env.NO_PROXY = '*';
    const config = process.env.POC_MODE === 'product' ? 'playwright.product.config.cjs'
      : collabMode ? 'playwright.collab.config.cjs' : 'playwright.config.cjs';
    playwright = spawn(process.execPath, [path.join(__dirname, '../node_modules/@playwright/test/cli.js'), 'test', '-c', path.join(__dirname, config)], { cwd: __dirname, stdio: 'inherit', env });
    const result = await new Promise((resolve, reject) => {
      playwright.once('error', reject);
      playwright.once('exit', (code) => resolve(code ?? 1));
    });
    if (process.exitCode !== 130) process.exitCode = result;
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      if (childError || child.exitCode !== null || child.signalCode !== null) resolve();
      else child.once('exit', resolve);
    });
    fs.closeSync(log);
    if (sink) await new Promise((resolve) => sink.close(resolve));
    if (collab) await collab.dispose();
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
