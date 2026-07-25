// Minimal static file server for the e2e harness on lovable-main.
//
// main's e2e harness spawns the full multiplayer `server.js`; lovable-main has
// no such file (it serves via Vite + Supabase in production). The daily-reward
// feature is 100% client-side (localStorage), so plain static hosting of the
// project root is all its e2e needs. Prints "running at" so lib.mjs can await boot.
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PORT = Number(process.env.PORT || 8555);
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.gif': 'image/gif', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon',
};

http
  .createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const full = normalize(join(ROOT, p));
    if (!full.startsWith(ROOT) || !existsSync(full) || !statSync(full).isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(full)] || 'application/octet-stream' });
    createReadStream(full).pipe(res);
  })
  .listen(PORT, () => console.log(`static running at http://localhost:${PORT}`));
