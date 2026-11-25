import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname } from 'node:path';

const ROOT = new URL('../public/', import.meta.url);
const PORT = 4747;
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html');
  const file = new URL(`.${path}`, ROOT);
  if (!file.href.startsWith(ROOT.href)) return response.writeHead(403).end();

  try {
    const body = await readFile(file);
    const type = TYPES[extname(path)] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' }).end(body);
  } catch (error) {
    const missing = error.code === 'ENOENT' || error.code === 'EISDIR';
    response.writeHead(missing ? 404 : 500).end(missing ? 'Not found' : error.message);
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Refurb Radar on http://localhost:${PORT}`));
