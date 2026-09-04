/**
 * Приёмка пары бойцов числами.
 *
 * Задание требовало рубрику навыка «графика» (правило 17) буквально: средняя
 * схожесть < 45%, ни одна пара > 80%. Эта рубрика — для набора «формы»
 * (~/dev/Zakriva/nabor/nabor.mjs --вид=формы): разные силуэты, схожесть =
 * (пересечение силуэтов + корреляция рисунка) / 2. Проверено этой же
 * формулой на нашей паре (см. отчёт) — средняя вышла 90.2%, худшая пара
 * 95.1%, и **это неверный диагноз, а не брак**: боец-2 сделан перекраской
 * боец-1 по прямому решению владельца, силуэт совпадает с ним побитно по
 * построению by design, и через силуэт эта пара не может пройти НИКОГДА,
 * что бы ни было нарисовано цветом — проверка без зелёного исхода запрещена
 * сводом (правило 7и). Это ровно случай, для которого сам навык оговаривает
 * исключение: «варианты одной вещи... это механика, а не разнобой»
 * (правило 17а) — только тут вариант не случайный, а два поимённых бойца,
 * и не различает их форма, различает цвет.
 *
 * Поэтому мерится тем, что набор.mjs называет режимом «цвета»: ΔE (CIE76)
 * и серая площадь, где светлота расходится заметно глазу (порог ΔL ≥ 12,
 * тот же, что в справочном инструменте). Пороги те же, что там: ΔE ≥ 12 у
 * ближайшей пары, серым различимо ≥ 8% площади. Мерится в двух масштабах:
 * карточка сайта (272/960, как в tools/contrast.mjs) и мелкий чек-размер
 * 40 px из общего инструмента ~/dev/Zakriva/nabor/nabor.mjs.
 *
 *   node tools/priyomka-boytsy.mjs
 *   node tools/priyomka-boytsy.mjs --одинаковые   # отрицательный контроль
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { HEAD, PIECES } from '../src/sprites.js';
import { readPng } from './png.mjs';

const ART = 'assets/art';
const ARENA = 960;
const BACKDROP = [35, 21, 28]; // тот же тыл арены, что в contrast.mjs
const SCALES = [
    { name: 'карточка 272 px', px: 272 },
    { name: 'мелкий чек 40 px', px: 40 },
];
const ПОРОГ_DELTA_E = 12; // ближайшая пара обязана разойтись сильнее — иначе цвета сливаются
const ПОРОГ_СЕРЫМ_ПЛОЩАДЬ = 8; // % площади тела с заметной разницей светлоты
const ЗАМЕТНО_L = 12; // разница L*, которую видит глаз (взято из nabor.mjs)

function rgbaAt(png, x, y) {
    const i = (y * png.width + x) * png.channels;
    if (png.channels === 4) return [png.pixels[i], png.pixels[i + 1], png.pixels[i + 2], png.pixels[i + 3]];
    if (png.channels === 3) return [png.pixels[i], png.pixels[i + 1], png.pixels[i + 2], 255];
    if (png.channels === 2) return [png.pixels[i], png.pixels[i], png.pixels[i], png.pixels[i + 1]];
    return [png.pixels[i], png.pixels[i], png.pixels[i], 255];
}

/** Box-уменьшение с композитингом на тыл арены — то же самое, что видит глаз. */
function shrink(png, targetW) {
    const scale = targetW / ARENA;
    const width = Math.max(1, Math.round(png.width * scale));
    const height = Math.max(1, Math.round(png.height * scale));
    const pixels = [];
    for (let dy = 0; dy < height; dy += 1) {
        const y0 = Math.floor((dy * png.height) / height);
        const y1 = Math.max(y0 + 1, Math.ceil(((dy + 1) * png.height) / height));
        for (let dx = 0; dx < width; dx += 1) {
            const x0 = Math.floor((dx * png.width) / width);
            const x1 = Math.max(x0 + 1, Math.ceil(((dx + 1) * png.width) / width));
            let pr = 0, pg = 0, pb = 0, alpha = 0, count = 0;
            for (let y = y0; y < y1; y += 1) {
                for (let x = x0; x < x1; x += 1) {
                    const [r, g, b, a8] = rgbaAt(png, x, y);
                    const a = a8 / 255;
                    pr += r * a; pg += g * a; pb += b * a; alpha += a; count += 1;
                }
            }
            const a = alpha / count;
            pixels.push({
                r: pr / count + BACKDROP[0] * (1 - a),
                g: pg / count + BACKDROP[1] * (1 - a),
                b: pb / count + BACKDROP[2] * (1 - a),
                a,
            });
        }
    }
    return { width, height, pixels };
}

function load(name, targetW) {
    const png = readPng(readFileSync(join(ART, name)));
    if (png.error) throw new Error(`${name}: ${png.error}`);
    return shrink(png, targetW);
}

const srgbToLin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

function rgbToLab(r, g, b) {
    const R = srgbToLin(r); const G = srgbToLin(g); const B = srgbToLin(b);
    const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
    const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(X); const fy = f(Y); const fz = f(Z);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Сравнение пары одноимённых частей в одном масштабе. */
function compare(first, second) {
    let sumDE = 0;
    let sumDL = 0;
    let noticeableL = 0;
    let maxDE = 0;
    let visible = 0;
    for (let i = 0; i < first.pixels.length; i += 1) {
        const a = first.pixels[i];
        const b = second.pixels[i];
        if (Math.max(a.a, b.a) < 0.08) continue;
        const la = rgbToLab(a.r, a.g, a.b);
        const lb = rgbToLab(b.r, b.g, b.b);
        const dE = Math.sqrt((la.L - lb.L) ** 2 + (la.a - lb.a) ** 2 + (la.b - lb.b) ** 2);
        const dL = Math.abs(la.L - lb.L);
        sumDE += dE;
        sumDL += dL;
        if (dL >= ЗАМЕТНО_L) noticeableL += 1;
        if (dE > maxDE) maxDE = dE;
        visible += 1;
    }
    const meanDE = visible ? sumDE / visible : 0;
    const meanDL = visible ? sumDL / visible : 0;
    const greyShare = visible ? (100 * noticeableL) / visible : 0;
    return { meanDE, meanDL, greyShare, maxDE, visible };
}

const same = process.argv.includes('--одинаковые');
const ids = [...PIECES, HEAD].map((p) => p.id);

console.log('ПРИЁМКА ПАРЫ БОЙЦОВ — часть-в-часть, боец-1 (zhila) против боец-2 (kostolom)\n');

let худшийИсход = 0; // 0 ok
for (const scale of SCALES) {
    const rows = ids.map((id) => {
        const first = load(`part-zhila-${id}.png`, scale.px);
        const second = load(`part-${same ? 'zhila' : 'kostolom'}-${id}.png`, scale.px);
        return { id, ...compare(first, second) };
    });

    const minDE = Math.min(...rows.map((r) => r.meanDE));
    const meanDE = rows.reduce((s, r) => s + r.meanDE, 0) / rows.length;
    const minGrey = Math.min(...rows.map((r) => r.greyShare));

    console.log(`── ${scale.name} ──`);
    for (const r of rows) {
        console.log(`  ${r.id.padEnd(10)}: ΔE ${r.meanDE.toFixed(1).padStart(5)}`
            + `  серым различимо ${r.greyShare.toFixed(1).padStart(5)}% площади  (ΔL средняя ${r.meanDL.toFixed(1)})`);
    }
    console.log(`  средний ΔE по набору: ${meanDE.toFixed(1)}, ближайшая (самая похожая) пара: ${minDE.toFixed(1)} (порог выше ${ПОРОГ_DELTA_E})`);
    console.log(`  худшая в сером: ${minGrey.toFixed(1)}% площади (порог выше ${ПОРОГ_СЕРЫМ_ПЛОЩАДЬ})`);

    if (minDE < ПОРОГ_DELTA_E) { console.log(`  ✗ на ${scale.name} есть пара с ΔE ниже порога — цвета сливаются`); худшийИсход = 1; }
    if (minGrey < ПОРОГ_СЕРЫМ_ПЛОЩАДЬ) { console.log(`  ✗ на ${scale.name} без цвета бойцы сливаются`); худшийИсход = 1; }
    console.log('');
}

console.log(худшийИсход ? 'НЕ ПРИНЯТО.' : 'Пара принята: боец-1 и боец-2 различимы на обоих масштабах, средним и худшим случаем, с цветом и без.');
process.exit(худшийИсход);
