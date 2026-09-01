/**
 * Второй боец перекраской первого.
 *
 *   node tools/recolor.mjs
 *
 * Почему не поворот тона. Замер исходного набора: средняя светлота 0.091,
 * то есть боец — почти чёрный силуэт с еле различимой деталью, и 39%
 * непрозрачных точек вообще серые. Повернуть на таком тон — значит не
 * изменить ничего: в размере карточки (272 точки) оба остались бы
 * одинаковыми тёмными пятнами, а именно из-за неразличимости у ПЕРЕЛОМА и
 * не было петли на витрине.
 *
 * Поэтому разводим по **светлоте**, а тон берём вторым голосом. Арена
 * закатно-красная, игрок тёмный и тёплый — противник делается холодным и
 * светлее фона. Это ещё и продолжает язык самой игры: полоса здоровья
 * противника голубая, и проволочный силуэт, который игроки видели до сих
 * пор, был голубым же.
 *
 * Подъём светлоты идёт долей от недостающего до единицы: чёрное встаёт на
 * ПОДЪЁМ, а светлое почти не двигается — иначе блики выгорают в белые
 * пятна и деталь пропадает.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPng, writePng } from './png.mjs';

const ART = 'assets/art';
const ОТКУДА = 'zhila';
const КУДА = 'kostolom';

/** Куда тянем тон: холодная сталь, тон полосы противника. */
const ТОН = 196;
/** Насколько слушаться исходного тона — чтобы материал остался материалом. */
const СВОЙ_ТОН = 0.25;
/** Доля недостающей светлоты, которую добираем. */
const ПОДЪЁМ = 0.3;
/** Насыщенность: холодный, но не мультяшный. */
const НАСЫЩЕННОСТЬ = 0.45;

function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [ТОН, 0, l];
    const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
}

function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const к = (t) => {
        t = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    return [к(h + 1 / 3), к(h), к(h - 1 / 3)].map((v) => Math.round(v * 255));
}

/** Кратчайший поворот от одного тона к другому — через 360, а не сквозь. */
function свести(своё, цель, доля) {
    let d = ((цель - своё + 540) % 360) - 180;
    return своё + d * (1 - доля);
}

let сделано = 0;
for (const имя of readdirSync(ART).filter((n) => n.startsWith(`part-${ОТКУДА}-`))) {
    const png = readPng(readFileSync(join(ART, имя)));
    if (png.error) throw new Error(`${имя}: ${png.error}`);

    const { width, height, channels: ch } = png;
    const out = Buffer.alloc(width * height * 4);
    for (let i = 0, o = 0; i < png.pixels.length; i += ch, o += 4) {
        const a = ch === 4 ? png.pixels[i + 3] : 255;
        if (!a) { out[o + 3] = 0; continue; }
        const [h, s, l] = rgb2hsl(png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]);
        const [r, g, b] = hsl2rgb(
            свести(h, ТОН, СВОЙ_ТОН),
            Math.min(1, НАСЫЩЕННОСТЬ + s * 0.3),
            l + (1 - l) * ПОДЪЁМ,
        );
        out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
    }

    writeFileSync(join(ART, имя.replace(`part-${ОТКУДА}-`, `part-${КУДА}-`)), writePng(width, height, out));
    сделано += 1;
}
console.log(`перекрашено частей: ${сделано}`);
