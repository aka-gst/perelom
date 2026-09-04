/**
 * Чтение и запись PNG без зависимостей.
 *
 * Отдельным файлом потому, что декодер понадобился второму инструменту, а
 * копия рано или поздно разъезжается с оригиналом: правка в одной из двух
 * копий не считается сделанной.
 *
 * Поддерживается то, что нам и приходит: восемь бит на канал, без
 * чересстрочности, без палитры.
 */

import { inflateSync, deflateSync } from 'node:zlib';

export function readPng(buf) {
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

/** Таблица CRC32 — своя, потому что в zlib её наружу не отдают. */
const CRC = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i += 1) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}

function chunk(type, body) {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, tail]);
}

/** Записать PNG-32. Пиксели — RGBA подряд, строка за строкой. */
export function writePng(width, height, rgba) {
    const stride = width * 4;
    // Фильтр 0 у каждой строки: разжимается хуже, зато читается кем угодно.
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y += 1) {
        raw[y * (stride + 1)] = 0;
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}
