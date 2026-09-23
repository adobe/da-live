import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')));
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const nx = args.nx && await realpath(args.nx);
const plugin = args.plugin && await realpath(args.plugin);
const port = Number(args.port || 3010);
const iframePort = Number(args['iframe-port'] || 3011);
const mime = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2',
};

async function serve(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/test/fixtures/comparison.html';
    let mapping = [root, pathname];
    if (pathname.startsWith('/plugin/')) mapping = [plugin, pathname.slice(7)];
    else if (/^\/nx2?\//.test(pathname)) mapping = [nx, pathname];
    if (!mapping[0] || pathname.split('/').some((part) => part.startsWith('.'))) throw new Error('Not found');
    let file = path.resolve(mapping[0], `.${mapping[1]}`);
    if (!file.startsWith(`${mapping[0]}${path.sep}`)) throw new Error('Not found');
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': mime[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  }
}

for (const listenPort of new Set([port, iframePort])) {
  http.createServer(serve).listen(listenPort, '127.0.0.1', () => {
    // eslint-disable-next-line no-console
    console.log(`Comparison fixtures: http://localhost:${listenPort}/test/fixtures/comparison.html`);
  });
}
