/**
 * Эталон скелета для заказа графики.
 *
 *   node tools/reference.mjs > assets/reference/skeleton.svg
 *
 * Картинка рисуется из тех же поз, по которым живёт игра, поэтому она не
 * может разойтись с кодом. Если позы поменяются — эталон надо пересобрать
 * этой же командой, иначе художник рисует под старые пропорции.
 */

import { POSES } from '../src/poses.js';
import { STICKS } from '../src/physics.js';
import { PIECES, anchorsOf } from './art-spec.mjs';

/** Толщина звена в мировых пикселях — из render.js. */
const WIDTH = { spine: 30, ribs: 26, skull: 18, arm: 13, leg: 16 };

/* ─────────────────────────── рисование ─────────────────────────── */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const out = [];
const push = (s) => out.push(s);

const COLS = 6;
const CELL_W = 300;
const CELL_H = 340;
const names = Object.keys(POSES);
const rows = Math.ceil(names.length / COLS);
const sheetH = rows * CELL_H + 60;
const diagramY = sheetH + 40;
const totalH = diagramY + 400;

push(`<svg xmlns="http://www.w3.org/2000/svg" width="${COLS * CELL_W}" height="${totalH}" viewBox="0 0 ${COLS * CELL_W} ${totalH}">`);
push(`<rect width="100%" height="100%" fill="#f4efe9"/>`);
push(`<text x="24" y="40" font-family="monospace" font-size="26" font-weight="700" fill="#111">ПЕРЕЛОМ — эталон скелета. Все кости одной длины во всех позах.</text>`);

names.forEach((name, i) => {
    const cx = (i % COLS) * CELL_W + CELL_W / 2;
    const cy = Math.floor(i / COLS) * CELL_H + 60;
    const ground = cy + 250;
    push(`<g>`);
    for (const [a, b, , bone] of STICKS) {
        if (!bone) continue;
        const pa = POSES[name][a];
        const pb = POSES[name][b];
        push(`<line x1="${(cx + pa[0]).toFixed(1)}" y1="${(ground - 78 - pa[1]).toFixed(1)}"`
            + ` x2="${(cx + pb[0]).toFixed(1)}" y2="${(ground - 78 - pb[1]).toFixed(1)}"`
            + ` stroke="#1a1a1f" stroke-width="${WIDTH[bone]}" stroke-linecap="round"/>`);
    }
    const head = POSES[name].head;
    push(`<circle cx="${(cx + head[0]).toFixed(1)}" cy="${(ground - 78 - head[1]).toFixed(1)}" r="15" fill="#1a1a1f"/>`);
    for (const id of Object.keys(POSES[name])) {
        const p = POSES[name][id];
        push(`<circle cx="${(cx + p[0]).toFixed(1)}" cy="${(ground - 78 - p[1]).toFixed(1)}" r="3" fill="#d81e3c"/>`);
    }
    push(`<line x1="${cx - 110}" y1="${ground}" x2="${cx + 110}" y2="${ground}" stroke="#c3b8ab" stroke-width="2"/>`);
    push(`<text x="${cx}" y="${ground + 26}" text-anchor="middle" font-family="monospace" font-size="18" fill="#5c5148">${esc(name)}</text>`);
    push(`</g>`);
});

/* Схема крепления спрайта: главное правило заказа, и его легче показать. */
const dx = 60;
const dy = diagramY;
const sample = PIECES.find((p) => p.id === 'arm-fore');
const anchor = anchorsOf(sample);
push(`<text x="24" y="${dy - 10}" font-family="monospace" font-size="24" font-weight="700" fill="#111">Как крепится спрайт части тела (пример: предплечье с кистью)</text>`);
push(`<rect x="${dx}" y="${dy + 30}" width="${sample.w}" height="${sample.h}" fill="#fff" stroke="#8c8078" stroke-width="2" stroke-dasharray="6 6"/>`);
push(`<path d="M ${dx + anchor.a[0]} ${dy + 30 + anchor.a[1]} L ${dx + anchor.b[0]} ${dy + 30 + anchor.b[1]}" stroke="#8c8078" stroke-width="2" stroke-dasharray="4 5"/>`);
push(`<path d="M ${dx + anchor.a[0]} ${dy + 30 + anchor.a[1] - 24} L ${dx + anchor.b[0]} ${dy + 30 + anchor.b[1] - 17} L ${dx + anchor.b[0]} ${dy + 30 + anchor.b[1] + 17} L ${dx + anchor.a[0]} ${dy + 30 + anchor.a[1] + 24} Z" fill="#1a1a1f" opacity="0.85"/>`);
push(`<circle cx="${dx + anchor.a[0]}" cy="${dy + 30 + anchor.a[1]}" r="7" fill="#d81e3c"/>`);
push(`<circle cx="${dx + anchor.b[0]}" cy="${dy + 30 + anchor.b[1]}" r="7" fill="#d81e3c"/>`);
push(`<text x="${dx + anchor.a[0]}" y="${dy + 30 + anchor.a[1] + 60}" text-anchor="middle" font-family="monospace" font-size="18" fill="#d81e3c">A — локоть (${anchor.a[0]}, ${anchor.a[1]})</text>`);
push(`<text x="${dx + anchor.b[0]}" y="${dy + 30 + anchor.b[1] + 84}" text-anchor="middle" font-family="monospace" font-size="18" fill="#d81e3c">B — запястье (${anchor.b[0]}, ${anchor.b[1]})</text>`);
push(`<text x="${dx}" y="${dy + 30 + sample.h + 40}" font-family="monospace" font-size="17" fill="#333">Кость лежит горизонтально: сустав A слева, сустав B справа, оба на середине высоты.</text>`);
push(`<text x="${dx}" y="${dy + 30 + sample.h + 64}" font-family="monospace" font-size="17" fill="#333">Кость идёт от края до края: предплечье кончается запястьем. Кисть — отдельный файл.</text>`);
push(`<text x="${dx}" y="${dy + 30 + sample.h + 88}" font-family="monospace" font-size="17" fill="#333">Код поворачивает спрайт так, чтобы A и B легли на суставы скелета. Больше он ничего не двигает.</text>`);

push(`</svg>`);
console.log(out.join('\n'));
