/* Scratch Wrangler processes: the real da-collab Worker and a loopback Source bridge. */
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');

async function unusedPorts(count) {
  const sockets = [];
  try {
    for (let i = 0; i < count; i += 1) {
      const socket = net.createServer();
      await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
      sockets.push(socket);
    }
    return sockets.map((socket) => socket.address().port);
  } finally {
    await Promise.all(sockets.map((socket) => new Promise((resolve) => socket.close(resolve))));
  }
}

function descendsFrom(pid, ancestor) {
  for (let i = 0; i < 10 && pid > 1; i += 1) {
    if (pid === ancestor) return true;
    pid = Number(execFileSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf8' }).trim());
  }
  return false;
}

async function waitForOwned(port, child, url) {
  for (let i = 0; i < 200; i += 1) {
    if (child.spawnError || child.exitCode !== null || child.signalCode !== null) throw new Error(`Wrangler exited before listening on ${port}: ${child.spawnError || child.exitCode || child.signalCode}`);
    let rows = [];
    try { rows = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim().split('\n'); } catch { /* not listening yet */ }
    if (rows.length === 2) {
      const owner = Number(rows[1].trim().split(/\s+/)[1]);
      if (!rows[1].includes(`127.0.0.1:${port} (LISTEN)`) || !descendsFrom(owner, child.pid)) throw new Error(`Unexpected listener: ${rows[1]}`);
      try { if (!url || (await fetch(url, { redirect: 'error' })).ok) return; } catch { /* still starting */ }
    }
    await new Promise((resolve) => { setTimeout(resolve, 100); });
  }
  throw new Error(`Owned loopback Wrangler listener did not become ready: ${port}`);
}

async function stop(child) {
  if (!child || child.spawnError || child.exitCode !== null || child.signalCode !== null) return;
  // Each Wrangler is its own process group; never signal any pre-existing service.
  try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  await new Promise((resolve) => child.once('exit', resolve));
}

async function startCollab({ workspace, scratch, sourcePort }) {
  const { startGate } = require('./late-gate.cjs');
  const gate = await startGate(sourcePort);
  if (gate.port === sourcePort) { await gate.dispose(); throw new Error('Colliding scratch ports'); }
  const [port, collabInspector] = await unusedPorts(2).catch(async (error) => { await gate.dispose(); throw error; });
  if ([port, collabInspector].includes(sourcePort)) { await gate.dispose(); throw new Error('Colliding scratch ports'); }
  const proxyName = `i2-source-${path.basename(scratch).toLowerCase()}`;
  const workerName = `i2-collab-${path.basename(scratch).toLowerCase()}`;
  const proxy = path.join(scratch, 'source-bridge.mjs');
  const proxyConfig = path.join(scratch, 'source-bridge.toml');
  const collabConfig = path.join(scratch, 'collab.toml');
  const collabLog = path.join(scratch, 'collab.log');
  try {
    fs.writeFileSync(proxy, `export default { async fetch(request) {
    const url = new URL(request.url);
    if (url.origin !== 'http://localhost:8787' || !url.pathname.startsWith('/source/') || !['HEAD','GET','PUT'].includes(request.method)) return new Response('blocked', { status: 403 });
    const headers = new Headers(request.headers);
    headers.set('x-i2-bridge', '${gate.nonce}');
    const options = { method: request.method, headers, redirect: 'manual' };
    if (request.method === 'PUT') options.body = request.body;
    const response = await fetch('http://127.0.0.1:${gate.port}' + url.pathname + url.search, options);
    console.log('SOURCE', request.method, url.pathname, 'match=' + (request.headers.get('if-match') || '-'), 'status=' + response.status, 'etag=' + (response.headers.get('etag') || '-'));
    return response;
  }};`);
    fs.writeFileSync(proxyConfig, `name = "${proxyName}"\nmain = "${proxy}"\ncompatibility_date = "2024-04-03"\n`);
    fs.writeFileSync(collabConfig, `name = "${workerName}"\nmain = "${workspace}/da-collab/src/edge.js"\ncompatibility_date = "2024-04-03"\nservices = [{ binding = "daadmin", service = "${proxyName}" }]\n[durable_objects]\nbindings = [{ name = "rooms", class_name = "DocRoom" }]\n[[migrations]]\ntag = "v1"\nnew_classes = ["DocRoom"]\n[vars]\nIS_HELIX = "false"\nRETURN_STACK_TRACES = "true"\n`);
  } catch (error) {
    await gate.dispose();
    throw error;
  }
  const wrangler = path.join(workspace, 'da-collab/node_modules/.bin/wrangler');
  const env = { PATH: process.env.PATH, HOME: scratch, TMPDIR: scratch, WRANGLER_SEND_METRICS: 'false', NO_PROXY: '*' };
  function launch(configs, servicePort, inspector, log, storage) {
    const fd = fs.openSync(log, 'w', 0o600);
    const configArgs = configs.flatMap((config) => ['--config', config]);
    const child = spawn(wrangler, ['dev', ...configArgs, '--local', '--ip', '127.0.0.1', '--port', String(servicePort), '--inspector-ip', '127.0.0.1', '--inspector-port', String(inspector), '--persist-to', path.join(scratch, storage), '--show-interactive-dev-session=false'], { cwd: scratch, env, detached: true, stdio: ['ignore', fd, fd] });
    child.on('error', (error) => { child.spawnError = error; });
    fs.closeSync(fd);
    return child;
  }
  let worker;
  const interrupt = () => {
    if (worker?.pid) {
      try { process.kill(-worker.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    worker = launch([collabConfig, proxyConfig], port, collabInspector, collabLog, 'collab-do');
    await waitForOwned(port, worker, `http://127.0.0.1:${port}/api/v1/ping`);
    await waitForOwned(collabInspector, worker);
    return { url: `http://127.0.0.1:${port}`, log: collabLog, gate, async dispose() { await stop(worker); await gate.dispose(); } };
  } catch (error) {
    await stop(worker);
    await gate.dispose();
    throw new Error(`${error.message}; inspect ${collabLog}`);
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

module.exports = { startCollab };
