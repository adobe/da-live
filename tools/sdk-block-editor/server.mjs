import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const liveRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const nxRoot = resolve(liveRoot, '../da-nx');
const extensionRoot = resolve(liveRoot, '../ew-extensions');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};

function serve(port, defaultRoot, mappings = []) {
  const server = createServer(async (request, response) => {
    const origins = ['http://localhost:3001', 'http://localhost:3002'];
    if (origins.includes(request.headers.origin)) {
      response.setHeader('Access-Control-Allow-Origin', request.headers.origin);
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-content-source-authorization');
      response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      response.setHeader('Vary', 'Origin');
    }
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    const url = new URL(request.url, `http://localhost:${port}`);
    const mapping = mappings.find(([prefix]) => url.pathname.startsWith(prefix));
    const root = mapping ? mapping[1] : defaultRoot;
    let relative;
    try {
      relative = decodeURIComponent(mapping ? url.pathname.slice(mapping[0].length) : url.pathname);
    } catch {
      response.writeHead(400);
      response.end('Invalid path');
      return;
    }
    if (relative.endsWith('/')) relative += 'index.html';
    if (relative.split('/').some((part) => part.startsWith('.'))) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    const path = resolve(root, relative.replace(/^\/+/, ''));
    if (path !== root && !path.startsWith(`${root}${sep}`)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    try {
      const data = await readFile(path);
      response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
      response.end(data);
    } catch (err) {
      const status = ['ENOENT', 'ENOTDIR'].includes(err.code) ? 404 : 500;
      if (status === 500) process.stderr.write(`${err.stack}\n`);
      response.writeHead(status);
      response.end(status === 404 ? 'Not found' : 'Unable to read file');
    }
  });
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`SDK prototype: http://localhost:${port}\n`);
  });
  server.on('error', (err) => {
    process.stderr.write(`${err.stack}\n`);
    process.exitCode = 1;
  });
  return server;
}

const servers = [
  serve(3001, liveRoot, [['/nx/', resolve(nxRoot, 'nx')], ['/nx2/', resolve(nxRoot, 'nx2')]]),
  serve(3002, extensionRoot),
];
process.on('SIGTERM', () => servers.forEach((server) => server.close()));
process.on('SIGINT', () => servers.forEach((server) => server.close()));
