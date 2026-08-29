/**
 * Локальный статик-сервер: игра собрана из ES-модулей, а их браузер не
 * грузит с file://. Ни сборки, ни зависимостей проекту не нужно.
 *
 *   npm start            → http://localhost:4191
 *   npm start -- 5000    → другой порт
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 4191);

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
};

createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const target = join(ROOT, normalize(decodeURIComponent(path)));
    if (!target.startsWith(ROOT)) {
        res.writeHead(403).end('Forbidden');
        return;
    }
    try {
        const info = await stat(target);
        if (info.isDirectory()) throw new Error('directory');
        res.writeHead(200, {
            'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream',
            'Content-Length': info.size,
            'Cache-Control': 'no-cache',
        });
        createReadStream(target).pipe(res);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    }
}).listen(PORT, () => console.log(`ПЕРЕЛОМ → http://localhost:${PORT}`));
