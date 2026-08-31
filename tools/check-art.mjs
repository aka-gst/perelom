/**
 * Приёмка поставки графики.
 *
 *   node tools/check-art.mjs <каталог>
 *
 * Проверяет не «пришли ли файлы», а **разное ли пришло**. По опыту соседних
 * проектов ломается всегда одно и то же: сорок девять файлов оказываются
 * сорока двумя картинками под разными именами; вместо девяти слоёв фона
 * приходит один сводный лист с подписями; спрайт нарисован не по оси, и
 * рука крепится к пустому месту.
 *
 * Поэтому здесь: точные размеры, побайтные дубли, доля непрозрачного и —
 * главное — **есть ли рисунок в самих суставах**. Если в точке крепления
 * прозрачно, спрайт нарисован не по спеке, и в игре он повиснет мимо руки.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { join, extname } from 'node:path';

import { manifest } from './art-spec.mjs';

const root = process.argv[2] ?? 'assets/art';
const problems = [];
const notes = [];
const stale = [];
const fail = (s) => problems.push(s);
const ok = (s) => notes.push(s);
const note = (s) => stale.push(s);

/* ─────────────────────────── PNG ─────────────────────────── */

/** Разбор PNG без зависимостей: только то, что нужно приёмке. */
function readPng(buf) {
    if (buf.readUInt32BE(0) !== 0x89504e47) return { error: 'не PNG' };
    let pos = 8;
    let ihdr = null;
    const idat = [];
    while (pos + 8 <= buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString('ascii', pos + 4, pos + 8);
        const body = buf.subarray(pos + 8, pos + 8 + len);
        if (type === 'IHDR') {
            ihdr = {
                width: body.readUInt32BE(0),
                height: body.readUInt32BE(4),
                depth: body[8],
                color: body[9],
                interlace: body[12],
            };
        } else if (type === 'IDAT') idat.push(body);
        else if (type === 'IEND') break;
        pos += 12 + len;
    }
    if (!ihdr) return { error: 'нет заголовка IHDR' };
    if (ihdr.interlace !== 0) return { ...ihdr, error: 'чересстрочный PNG — не поддерживается' };
    if (ihdr.depth !== 8) return { ...ihdr, error: `${ihdr.depth} бит на канал вместо 8` };
    const CH = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.color];
    if (!CH) return { ...ihdr, error: `неизвестный тип цвета ${ihdr.color}` };
    if (ihdr.color === 3) return { ...ihdr, channels: CH, error: 'палитровый PNG — нужен PNG-32 с альфой' };

    let raw;
    try {
        raw = inflateSync(Buffer.concat(idat));
    } catch (error) {
        return { ...ihdr, error: `данные не распаковались: ${error.message}` };
    }

    const stride = ihdr.width * CH;
    const out = Buffer.alloc(stride * ihdr.height);
    let src = 0;
    for (let y = 0; y < ihdr.height; y += 1) {
        const filter = raw[src];
        src += 1;
        const line = raw.subarray(src, src + stride);
        src += stride;
        const dst = y * stride;
        const prev = dst - stride;
        for (let x = 0; x < stride; x += 1) {
            const a = x >= CH ? out[dst + x - CH] : 0;
            const b = y > 0 ? out[prev + x] : 0;
            const c = x >= CH && y > 0 ? out[prev + x - CH] : 0;
            let value = line[x];
            if (filter === 1) value += a;
            else if (filter === 2) value += b;
            else if (filter === 3) value += (a + b) >> 1;
            else if (filter === 4) {
                const p = a + b - c;
                const pa = Math.abs(p - a);
                const pb = Math.abs(p - b);
                const pc = Math.abs(p - c);
                value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            out[dst + x] = value & 0xff;
        }
    }
    return { ...ihdr, channels: CH, pixels: out };
}

/** Непрозрачная рамка: где на самом деле лежит рисунок внутри холста. */
function inkBox(png) {
    let x0 = png.width;
    let x1 = -1;
    for (let y = 0; y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
            const i = (y * png.width + x) * png.channels + png.channels - 1;
            if ((png.pixels[i] ?? 255) > 24) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
            }
        }
    }
    return x1 < 0 ? null : { x0, x1 };
}

const alphaAt = (png, x, y) => {
    if (png.channels !== 4 && png.channels !== 2) return 255;
    const i = (y * png.width + x) * png.channels + png.channels - 1;
    return png.pixels[i] ?? 0;
};

/* ─────────────────────────── WebP ─────────────────────────── */

function readWebp(buf) {
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
        return { error: 'не WebP' };
    }
    const tag = buf.toString('ascii', 12, 16);
    if (tag === 'VP8X') {
        return {
            width: buf.readUIntLE(24, 3) + 1,
            height: buf.readUIntLE(27, 3) + 1,
            alpha: Boolean(buf[20] & 0x10),
        };
    }
    if (tag === 'VP8L') {
        const b = buf.readUInt32LE(21);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, alpha: Boolean((b >> 28) & 1) };
    }
    if (tag === 'VP8 ') {
        return {
            width: buf.readUInt16LE(26) & 0x3fff,
            height: buf.readUInt16LE(28) & 0x3fff,
            alpha: false,
        };
    }
    return { error: `неизвестный вид WebP (${tag})` };
}

/* ─────────────────────────── проверки ─────────────────────────── */

const files = manifest();
/** Файлы прежнего уговора: работают через подгонку, ждут перерисовки. */
const legacy = new Set(files.filter((f) => f.legacy).map((f) => f.name));
const wanted = new Map(files.map((f) => [f.name, f]));
const hashes = new Map();

if (!existsSync(root)) {
    console.error(`Каталога ${root} нет. Положи поставку туда и запусти снова.`);
    process.exit(1);
}

const present = readdirSync(root).filter((n) => ['.png', '.webp'].includes(extname(n).toLowerCase()));
const missing = files.filter((f) => !present.includes(f.name));
const extra = present.filter((n) => !wanted.has(n));

for (const name of present) {
    const spec = wanted.get(name);
    if (!spec) continue;
    const path = join(root, name);
    const buf = readFileSync(path);
    const size = statSync(path).size;

    // Побайтный дубль — главная беда прошлых поставок.
    const hash = createHash('sha256').update(buf).digest('hex');
    if (hashes.has(hash)) fail(`${name}: побайтно совпадает с ${hashes.get(hash)} — это один файл под двумя именами`);
    else hashes.set(hash, name);

    if (extname(name).toLowerCase() === '.png') {
        const png = readPng(buf);
        if (png.error) { fail(`${name}: ${png.error}`); continue; }
        if (png.width !== spec.w || png.height !== spec.h) {
            const say = legacy.has(name) ? note : fail;
            say(`${name}: ${png.width}×${png.height} вместо ${spec.w}×${spec.h}`
                + (legacy.has(name) ? ' — прежний уговор, работает через подгонку, ждёт перерисовки' : ''));
            continue;
        }
        if (!spec.opaque && png.channels !== 4 && png.channels !== 2) {
            fail(`${name}: нет альфа-канала — нужен прозрачный фон`);
            continue;
        }
        let opaque = 0;
        const total = png.width * png.height;
        for (let i = 0; i < total; i += 1) {
            const a = png.channels === 4 ? png.pixels[i * 4 + 3] : png.channels === 2 ? png.pixels[i * 2 + 1] : 255;
            if (a > 16) opaque += 1;
        }
        const share = opaque / total;
        if (!spec.opaque && share < 0.06) fail(`${name}: почти пустой — закрашено ${(share * 100).toFixed(1)}%`);
        if (!spec.opaque && share > 0.97) fail(`${name}: сплошной прямоугольник — прозрачного фона нет`);

        // Суставы: если в точке крепления прозрачно, спрайт нарисован мимо оси.
        for (const [ax, ay] of spec.anchors ?? []) {
            if (alphaAt(png, Math.min(ax, png.width - 1), Math.min(ay, png.height - 1)) <= 16) {
                fail(`${name}: в суставе (${ax}, ${ay}) прозрачно — кость нарисована не по оси спрайта`);
            }
        }

        // Одной проверки «в суставе не прозрачно» мало: первая поставка её
        // прошла целиком, потому что рисунок занимал весь холст, и суставы
        // оказались закрашены заодно со всем остальным. Поэтому меряем,
        // где рисунок начинается и кончается на самом деле.
        const box = inkBox(png);
        if (box && spec.anchors?.length === 2) {
            const [[ax], [bx]] = spec.anchors;
            const drift = Math.max(Math.abs(box.x0 - ax), Math.abs(box.x1 - bx));
            if (drift > 24) {
                fail(`${name}: рисунок лежит от ${box.x0} до ${box.x1}, а суставы объявлены на ${ax} и ${bx}`
                    + ` — расхождение ${drift} px, крепления лягут мимо`);
            }
        }
        ok(`${name}: ${png.width}×${png.height}, закрашено ${(share * 100).toFixed(0)}%`
            + (box ? `, рисунок ${box.x0}…${box.x1}` : ''));
    } else {
        const webp = readWebp(buf);
        if (webp.error) { fail(`${name}: ${webp.error}`); continue; }
        if (webp.width !== spec.w || webp.height !== spec.h) {
            fail(`${name}: ${webp.width}×${webp.height}, а нужно ${spec.w}×${spec.h}`);
            continue;
        }
        if (!spec.opaque && !webp.alpha) fail(`${name}: нет альфа-канала — слой фона должен быть прозрачным`);
        if (size > 400 * 1024) fail(`${name}: ${Math.round(size / 1024)} КБ — тяжелее 400 КБ, игра станет дольше открываться`);
        ok(`${name}: ${webp.width}×${webp.height}, ${Math.round(size / 1024)} КБ`);
    }
}

/* ─────────────────────────── итог ─────────────────────────── */

const wave1 = files.filter((f) => f.wave === 1);
const wave1Missing = wave1.filter((f) => !present.includes(f.name));

console.log(`\nПРИЁМКА ГРАФИКИ — ${root}\n`);
console.log(`принято без замечаний: ${notes.length} из ${files.length}`);
if (wave1Missing.length) console.log(`первая волна: не хватает ${wave1Missing.length} из ${wave1.length}`);
else console.log('первая волна: собрана полностью');

if (notes.length) {
    // Список принятого — это запись «что уже стоит и что трогать не надо».
    console.log(`\nПринято (${notes.length}):`);
    for (const n of notes) console.log(`  ✓ ${n}`);
}
if (extra.length) {
    console.log(`\nЛишние файлы (${extra.length}) — их некуда подключать:`);
    for (const name of extra) console.log(`  · ${name}`);
}
if (missing.length) {
    console.log(`\nНе пришло (${missing.length}):`);
    for (const f of missing.slice(0, 20)) console.log(`  · ${f.name} — ${f.group}, волна ${f.wave}`);
    if (missing.length > 20) console.log(`  · …и ещё ${missing.length - 20}`);
}
if (stale.length) {
    console.log(`\nПрежний уговор — работает, но ждёт перерисовки (${stale.length}):`);
    for (const s of stale) console.log(`  · ${s}`);
}
if (problems.length) {
    console.log(`\nВернулось на переделку (${problems.length}):`);
    for (const p of problems) console.log(`  ✗ ${p}`);
}
if (!problems.length && !missing.length && !extra.length) console.log('\nВся поставка принята.');

process.exit(problems.length ? 1 : 0);
