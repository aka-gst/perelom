/**
 * Различимость двух бойцов в масштабе карточки сайта.
 *
 *   node tools/contrast.mjs
 *   node tools/contrast.mjs --одинаковые   # отрицательный контроль, exit 1
 *
 * Карточка шириной 272 px показывает холст шириной 960 px. Поэтому меряем
 * не исходные PNG, а то, что остаётся после box-уменьшения в 272 / 960.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { HEAD, PIECES } from '../src/sprites.js';
import { readPng } from './png.mjs';

const ART = 'assets/art';
const CARD = 272;
const ARENA = 960;
const SCALE = CARD / ARENA;
const BACKDROP = [35, 21, 28];
const RGB_NOTICEABLE = 24;
const GRAY_NOTICEABLE = 18;
const MIN_GRAY_MEAN = 18;

function rgbaAt(png, x, y) {
    const i = (y * png.width + x) * png.channels;
    if (png.channels === 4) return [png.pixels[i], png.pixels[i + 1], png.pixels[i + 2], png.pixels[i + 3]];
    if (png.channels === 3) return [png.pixels[i], png.pixels[i + 1], png.pixels[i + 2], 255];
    if (png.channels === 2) return [png.pixels[i], png.pixels[i], png.pixels[i], png.pixels[i + 1]];
    return [png.pixels[i], png.pixels[i], png.pixels[i], 255];
}

/** Box-фильтр: усредняем исходные точки, которые реально схлопнутся в одну. */
function shrink(png) {
    const width = Math.max(1, Math.round(png.width * SCALE));
    const height = Math.max(1, Math.round(png.height * SCALE));
    const pixels = [];
    for (let dy = 0; dy < height; dy += 1) {
        const y0 = Math.floor(dy * png.height / height);
        const y1 = Math.max(y0 + 1, Math.ceil((dy + 1) * png.height / height));
        for (let dx = 0; dx < width; dx += 1) {
            const x0 = Math.floor(dx * png.width / width);
            const x1 = Math.max(x0 + 1, Math.ceil((dx + 1) * png.width / width));
            let pr = 0, pg = 0, pb = 0, alpha = 0, count = 0;
            for (let y = y0; y < y1; y += 1) {
                for (let x = x0; x < x1; x += 1) {
                    const [r, g, b, a8] = rgbaAt(png, x, y);
                    const a = a8 / 255;
                    pr += r * a; pg += g * a; pb += b * a; alpha += a; count += 1;
                }
            }
            const a = alpha / count;
            const r = (pr / count) + BACKDROP[0] * (1 - a);
            const g = (pg / count) + BACKDROP[1] * (1 - a);
            const b = (pb / count) + BACKDROP[2] * (1 - a);
            pixels.push({ r, g, b, a });
        }
    }
    return { width, height, pixels };
}

function load(name) {
    const png = readPng(readFileSync(join(ART, name)));
    if (png.error) throw new Error(`${name}: ${png.error}`);
    return shrink(png);
}

function luminance({ r, g, b }) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function compare(first, second) {
    if (first.width !== second.width || first.height !== second.height) throw new Error('размеры пары не совпадают');
    let rgbSum = 0;
    let graySum = 0;
    let rgbNoticeable = 0;
    let grayNoticeable = 0;
    let visible = 0;
    for (let i = 0; i < first.pixels.length; i += 1) {
        const a = first.pixels[i];
        const b = second.pixels[i];
        if (Math.max(a.a, b.a) < 0.08) continue;
        const rgb = Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b) / Math.sqrt(3);
        const gray = Math.abs(luminance(a) - luminance(b));
        rgbSum += rgb;
        graySum += gray;
        if (rgb >= RGB_NOTICEABLE) rgbNoticeable += 1;
        if (gray >= GRAY_NOTICEABLE) grayNoticeable += 1;
        visible += 1;
    }
    return {
        rgbMean: rgbSum / visible,
        grayMean: graySum / visible,
        rgbShare: rgbNoticeable / visible,
        grayShare: grayNoticeable / visible,
        visible,
    };
}

const same = process.argv.includes('--одинаковые');
const rows = [...PIECES, HEAD].map(({ id }) => {
    const first = load(`part-zhila-${id}.png`);
    const second = load(`part-${same ? 'zhila' : 'kostolom'}-${id}.png`);
    return { id, ...compare(first, second) };
});

const byGray = [...rows].sort((a, b) => a.grayMean - b.grayMean);
const worsened = rows.filter((row) => row.grayShare + 1e-9 < row.rgbShare).length;
console.log('РАЗЛИЧИМОСТЬ БОЙЦОВ');
console.log(`масштаб: ${CARD} / ${ARENA} = ${SCALE.toFixed(3)}`);
for (const row of rows) {
    console.log(`  ${row.id}: RGB ${row.rgbMean.toFixed(1)} (${(row.rgbShare * 100).toFixed(0)}% точек),`
        + ` серый ${row.grayMean.toFixed(1)} (${(row.grayShare * 100).toFixed(0)}% точек)`);
}
console.log(`худшая в сером: ${byGray[0].id} — ${byGray[0].grayMean.toFixed(1)}`);
console.log(`лучшая в сером: ${byGray.at(-1).id} — ${byGray.at(-1).grayMean.toFixed(1)}`);
console.log(`в сером ухудшились: ${worsened} из ${rows.length}`);

const failed = rows.filter((row) => row.grayMean < MIN_GRAY_MEAN);
if (failed.length) {
    console.error(`НЕ РАЗЛИЧАЮТСЯ: ${failed.map((row) => row.id).join(', ')} (серый < ${MIN_GRAY_MEAN})`);
    process.exit(1);
}
