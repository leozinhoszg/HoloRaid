// Servidor estatico simples para o build web do Flutter (dev/preview).
// Uso: node tools/serve_web.mjs [porta]   (padrao 8899)
// Serve app/build/web com MIME correto + fallback SPA para index.html.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', 'build', 'web');
const PORT = Number(process.argv[2]) || 8899;

if (!existsSync(join(ROOT, 'index.html'))) {
  console.error(`[serve_web] build/web nao encontrado em ${ROOT}. Rode o build primeiro:`);
  console.error('  flutter build web --dart-define=API_BASE_URL=http://localhost:3010');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/') path = '/index.html';
    // Impede path traversal para fora do ROOT.
    const safe = normalize(join(ROOT, path));
    let filePath = safe.startsWith(ROOT) ? safe : join(ROOT, 'index.html');
    if (!existsSync(filePath)) filePath = join(ROOT, 'index.html'); // fallback SPA
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500);
    res.end(`Erro: ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`[serve_web] HoloRaid web em http://localhost:${PORT}  (Ctrl+C para parar)`);
});
