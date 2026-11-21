// Real Wrangler Worker and local service binding; bridge logs no authorization.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { startGate } = require('./gate.cjs');

async function ports(count) {
  const sockets = [];
  try {
    for (let i = 0; i < count; i += 1) {
      const socket = net.createServer();
      await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
      sockets.push(socket);
    }
    return sockets.map((socket) => socket.address().port);
  } finally { await Promise.all(sockets.map((s) => new Promise((resolve) => s.close(resolve)))); }
}

function descendsFrom(pid, ancestor) {
  for (let i = 0; i < 10 && pid > 1; i += 1) {
    if (pid === ancestor) return true;
    pid = Number(execFileSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf8' }).trim());
  }
  return false;
}

async function waitOwned(port, child, url) {
  for (let i = 0; i < 200; i += 1) {
    if (child.spawnError || child.exitCode !== null || child.signalCode !== null) throw new Error('Wrangler exited before ready');
    let rows = [];
    try { rows = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim().split('\n'); } catch { /* not listening */ }
    if (rows.length === 2) {
      const pid = Number(rows[1].trim().split(/\s+/)[1]);
      if (!rows[1].includes(`127.0.0.1:${port} (LISTEN)`) || !descendsFrom(pid, child.pid)) throw new Error(`Unexpected listener ${rows[1]}`);
      try { if (!url || (await fetch(url, { redirect: 'error' })).ok) return; } catch { /* starting */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Wrangler did not listen on owned loopback port ${port}`);
}

async function startWorker({ workspace, scratch, sourcePort, secret, diagnostic }) {
  const gate = await startGate(sourcePort);
  let selected;
  try { selected = await ports(diagnostic ? 4 : 2); } catch (error) { await gate.dispose(); throw error; }
  const [port, inspector, probePort, probeInspector] = selected;
  if (new Set([sourcePort, gate.port, ...selected]).size !== selected.length + 2) { await gate.dispose(); throw new Error('Port collision'); }
  const origin = `http://localhost:${sourcePort}`;
  const id = path.basename(scratch).toLowerCase();
  const bridgeName = `h6-bridge-${id}`;
  const legacyName = `h6-legacy-${id}`;
  const bridge = path.join(scratch, 'bridge.mjs');
  const bridgeConfig = path.join(scratch, 'bridge.toml');
  const legacyConfig = path.join(scratch, 'legacy.toml');
  const config = path.join(scratch, 'worker.toml');
  const log = path.join(scratch, 'collab.log');
  const probeLog = path.join(scratch, 'binding-probe.log');
  fs.writeFileSync(bridge, `export default { async fetch(request) {
    const url = new URL(request.url);
    console.log('SOURCE-IN', request.method, url.pathname);
    if (url.origin !== ${JSON.stringify(origin)} || !(/^\\/(?:source\\/h6test\\/(?:work|control)\\/|h6test\\/sites\\/work\\/source\\/)/.test(url.pathname)) || !['HEAD','GET','PUT'].includes(request.method)) return new Response('blocked', {status: 403});
    const headers = new Headers(request.headers); headers.set('x-h6-bridge', ${JSON.stringify(gate.nonce)});
    const options = {method: request.method, headers, redirect: 'manual'};
    if (request.method === 'PUT') options.body = request.body;
    let response;
    try { response = await fetch('http://127.0.0.1:${gate.port}' + url.pathname + url.search, options); }
    catch (error) { console.log('SOURCE-BRIDGE-ERROR', request.method, url.pathname, error.name); throw error; }
    console.log('SOURCE', request.method, url.pathname, 'match=' + (request.headers.get('if-match') || '-'), 'status=' + response.status, 'etag=' + (response.headers.get('etag') || '-'), 'type=' + JSON.stringify(request.headers.get('content-type') || ''), 'initiator=' + (request.headers.get('x-da-initiator') || '-'), 'auth=' + (request.headers.has('authorization') ? 'present' : 'absent'));
    return response;
  }};`);
  fs.writeFileSync(bridgeConfig, `name = "${bridgeName}"\nmain = "${bridge}"\ncompatibility_date = "2024-04-03"\n`);
  fs.writeFileSync(legacyConfig, `name = "${legacyName}"\nmain = "${bridge}"\ncompatibility_date = "2024-04-03"\n`);
  fs.writeFileSync(config, `name = "h6-worker-${id}"\nmain = "${workspace}/da-collab/src/edge.js"\ncompatibility_date = "2024-04-03"\nservices = [{ binding = "daadmin", service = "${legacyName}" }, { binding = "dars", service = "${bridgeName}" }]\n[durable_objects]\nbindings = [{ name = "rooms", class_name = "DocRoom" }]\n[[migrations]]\ntag = "v1"\nnew_classes = ["DocRoom"]\n[vars]\nIS_HELIX = "false"\nDA_RS_ORIGIN = "${origin}"\nRETURN_STACK_TRACES = "true"\n`);
  fs.writeFileSync(path.join(scratch, '.dev.vars'), `COLLAB_SHARED_SECRET=${secret}\n`, { mode: 0o600 });
  if (diagnostic) {
    const probe = path.join(scratch, 'binding-probe.mjs');
    const probeConfig = path.join(scratch, 'binding-probe.toml');
    fs.writeFileSync(probe, `export default { async fetch(request, env) {
      if (new URL(request.url).pathname !== '/probe' || request.headers.get('x-h6-gate') !== ${JSON.stringify(gate.nonce)}) return new Response('blocked', {status: 403});
      const auth = request.headers.get('authorization') || '';
      if (!auth.startsWith('Bearer ')) return new Response('blocked', {status: 403});
      const results = [];
      for (const redirect of ['manual', 'error']) {
        try { const response = await env.dars.fetch(${JSON.stringify(`${origin}/h6test/sites/work/source/page.html`)}, {method:'HEAD', headers:{authorization:auth}, redirect}); results.push({redirect, status:response.status, mode:response.headers.get('x-da-source-mode')}); }
        catch (error) { results.push({redirect, error:error.name, message:String(error.message).replaceAll(auth, '[redacted]').replaceAll(auth.slice(7), '[redacted]')}); }
      }
      return Response.json(results);
    }};`);
    fs.writeFileSync(probeConfig, `name = "h6-probe-${id}"\nmain = "${probe}"\ncompatibility_date = "2024-04-03"\nservices = [{ binding = "dars", service = "${bridgeName}" }]\n`);
  }
  const fd = fs.openSync(log, 'w', 0o600);
  const child = spawn(path.join(workspace, 'da-collab/node_modules/.bin/wrangler'), ['dev', '--config', config, '--config', bridgeConfig, '--config', legacyConfig, '--local', '--ip', '127.0.0.1', '--port', String(port), '--inspector-ip', '127.0.0.1', '--inspector-port', String(inspector), '--persist-to', path.join(scratch, 'collab-do'), '--show-interactive-dev-session=false'], { cwd: scratch, env: { PATH: process.env.PATH, HOME: scratch, TMPDIR: scratch, WRANGLER_SEND_METRICS: 'false', NO_PROXY: '*' }, detached: true, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  child.on('error', (error) => { child.spawnError = error; });
  let probeChild;
  const interrupt = () => {
    for (const processChild of [child, probeChild]) {
      if (processChild?.pid && processChild.exitCode === null && processChild.signalCode === null) {
        try { process.kill(-processChild.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
    }
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  const dispose = async () => {
    for (const processChild of [probeChild, child]) {
      if (processChild && !processChild.spawnError && processChild.exitCode === null && processChild.signalCode === null) {
        try { process.kill(-processChild.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
        await new Promise((resolve) => processChild.once('exit', resolve));
      }
    }
    await gate.dispose();
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  };
  try {
    await waitOwned(port, child, `http://127.0.0.1:${port}/api/v1/ping`);
    await waitOwned(inspector, child);
    if (diagnostic) {
      const probeFd = fs.openSync(probeLog, 'w', 0o600);
      probeChild = spawn(path.join(workspace, 'da-collab/node_modules/.bin/wrangler'), ['dev', '--config', path.join(scratch, 'binding-probe.toml'), '--config', bridgeConfig, '--local', '--ip', '127.0.0.1', '--port', String(probePort), '--inspector-ip', '127.0.0.1', '--inspector-port', String(probeInspector), '--persist-to', path.join(scratch, 'probe-do'), '--show-interactive-dev-session=false'], { cwd: scratch, env: { PATH: process.env.PATH, HOME: scratch, TMPDIR: scratch, WRANGLER_SEND_METRICS: 'false', NO_PROXY: '*' }, detached: true, stdio: ['ignore', probeFd, probeFd] });
      fs.closeSync(probeFd);
      probeChild.on('error', (error) => { probeChild.spawnError = error; });
      await waitOwned(probePort, probeChild);
      await waitOwned(probeInspector, probeChild);
    }
    return { origin: `http://127.0.0.1:${port}`, probeOrigin: diagnostic ? `http://127.0.0.1:${probePort}` : '', gate, log, dispose };
  } catch (error) { await dispose(); throw new Error(`${error.message}; inspect ${log}`); }
}
module.exports = { startWorker, ports };
