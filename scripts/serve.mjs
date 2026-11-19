// Minimal static server for dist/ (used by the poster and e2e scripts).
// Runs in-process, so closing it is guaranteed when the script exits.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL(`../${process.env.DIST_DIR ?? 'dist'}/`, import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

export async function startServer(port = 4621) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const rel = normalize(path).replace(/^([/\\])+/, '');
    const file = join(dist, extname(rel) ? rel : join(rel, 'index.html'));
    if (!file.startsWith(dist)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      const type = TYPES[extname(file)] ?? 'application/octet-stream';
      const cache = /\/_astro\/|\/fonts\//.test(file.replace(/\\/g, '/')) ? 'public, max-age=31536000, immutable' : 'no-cache';
      res.writeHead(200, { 'content-type': type, 'cache-control': cache }).end(body);
    } catch {
      try {
        const body = await readFile(join(dist, '404.html'));
        res.writeHead(404, { 'content-type': TYPES['.html'] }).end(body);
      } catch {
        res.writeHead(404).end('Not found');
      }
    }
  });
  // Prefer the project port (4621); if another script holds it, fall back to a free one.
  await new Promise((resolve, reject) => {
    server.once('error', (err) => {
      if (err.code !== 'EADDRINUSE') return reject(err);
      server.listen(0, '127.0.0.1', resolve);
    });
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  const actual = typeof address === 'object' && address ? address.port : port;
  return { url: `http://127.0.0.1:${actual}`, close: () => new Promise((r) => server.close(r)) };
}
