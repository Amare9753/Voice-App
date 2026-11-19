import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist', import.meta.url));
const prefix = '/Voice-App';
const port = Number(process.env.PORT ?? 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.gz': 'application/octet-stream',
};

createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
  if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) {
    response.writeHead(404);
    response.end('This preview serves the app at /Voice-App/, the same path as GitHub Pages.');
    return;
  }
  let relative = decodeURIComponent(url.pathname.slice(prefix.length)) || '/';
  if (relative.endsWith('/')) relative += 'index.html';
  let file = join(root, relative);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Core Capture preview: http://127.0.0.1:${port}${prefix}/`);
});
