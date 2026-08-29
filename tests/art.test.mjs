import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import { PIECES, anchorsOf, manifest } from '../tools/art-spec.mjs';

/* Минимальный кодировщик PNG: нужен только затем, чтобы проверить приёмку
   на заведомо правильном и заведомо кривом файле, не заводя зависимостей. */

const CRC = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return (buf) => {
        let c = -1;
        for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
        return (c ^ -1) >>> 0;
    };
})();

function chunk(type, body) {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(CRC(Buffer.concat([Buffer.from(type, 'ascii'), body])), 0);
    return Buffer.concat([head, body, crc]);
}

/** Рисует горизонтальную полосу — грубая имитация «кости по оси спрайта». */
function makePng(w, h, bar) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const rows = [];
    for (let y = 0; y < h; y += 1) {
        const row = Buffer.alloc(1 + w * 4);
        for (let x = 0; x < w; x += 1) {
            const inside = bar && x >= bar.x0 && x <= bar.x1 && Math.abs(y - bar.y) <= bar.half;
            row[1 + x * 4 + 3] = inside ? 255 : 0;
        }
        rows.push(row);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(Buffer.concat(rows))),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

function run(dir) {
    try {
        return { code: 0, out: execFileSync('node', ['tools/check-art.mjs', dir], { encoding: 'utf8' }) };
    } catch (error) {
        return { code: error.status, out: error.stdout ?? '' };
    }
}

const piece = PIECES.find((p) => p.id === 'arm-upper');
const { a, b } = anchorsOf(piece);

test('приёмка принимает файл, нарисованный по оси спрайта', () => {
    const dir = mkdtempSync(join(tmpdir(), 'art-ok-'));
    writeFileSync(join(dir, 'part-zhila-arm-upper.png'),
        makePng(piece.w, piece.h, { x0: a[0] - 6, x1: b[0] + 6, y: a[1], half: 24 }));
    const { out } = run(dir);
    assert.ok(out.includes('part-zhila-arm-upper.png: 168×80'), out);
    assert.ok(!out.includes('нарисована не по оси'), out);
    rmSync(dir, { recursive: true, force: true });
});

test('приёмка ловит спрайт, нарисованный мимо суставов', () => {
    // Ровно та ошибка, которую формат не ловит: файл правильного размера,
    // с альфой, но кость лежит не там — в игре рука повиснет мимо плеча.
    const dir = mkdtempSync(join(tmpdir(), 'art-off-'));
    writeFileSync(join(dir, 'part-zhila-arm-upper.png'),
        makePng(piece.w, piece.h, { x0: 0, x1: piece.w - 1, y: 8, half: 6 }));
    const { code, out } = run(dir);
    assert.equal(code, 1);
    assert.ok(out.includes('нарисована не по оси'), out);
    rmSync(dir, { recursive: true, force: true });
});

test('приёмка ловит один файл под двумя именами', () => {
    // Главная беда прошлых поставок в соседних проектах: сорок девять
    // файлов оказались сорока двумя картинками.
    const dir = mkdtempSync(join(tmpdir(), 'art-dup-'));
    const png = makePng(piece.w, piece.h, { x0: a[0] - 6, x1: b[0] + 6, y: a[1], half: 24 });
    writeFileSync(join(dir, 'part-zhila-arm-upper.png'), png);
    writeFileSync(join(dir, 'part-kostolom-arm-upper.png'), png);
    const { code, out } = run(dir);
    assert.equal(code, 1);
    assert.ok(out.includes('побайтно совпадает'), out);
    rmSync(dir, { recursive: true, force: true });
});

test('приёмка ловит пустой файл и неверный размер', () => {
    const dir = mkdtempSync(join(tmpdir(), 'art-bad-'));
    writeFileSync(join(dir, 'part-zhila-arm-upper.png'), makePng(piece.w, piece.h, null));
    writeFileSync(join(dir, 'part-zhila-neck.png'), makePng(64, 64, { x0: 0, x1: 63, y: 32, half: 20 }));
    const { code, out } = run(dir);
    assert.equal(code, 1);
    assert.ok(out.includes('почти пустой'), out);
    assert.ok(out.includes('а нужно 104×96'), out);
    rmSync(dir, { recursive: true, force: true });
});

test('опись не содержит двух файлов с одним именем', () => {
    const names = manifest().map((f) => f.name);
    assert.equal(new Set(names).size, names.length);
});
