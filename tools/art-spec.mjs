/**
 * Опись заказа на графику: что заказано, какого размера и где у него суставы.
 *
 * Один файл на всех: по нему рисуется эталон (`reference.mjs`), по нему же
 * принимается поставка (`check-art.mjs`), и на него ссылается `docs/ART.md`.
 * Разойтись они не могут, потому что источник один.
 *
 * Размеры частей тела = длина кости в мире × 4. Четырёхкратный запас нужен
 * не из любви к качеству: боец на экране бывает до 220 px в высоту, экраны
 * бывают с двойной плотностью, и камера при переломе ныряет ещё вчетверо.
 */

export { SCALE, PAD, PIECES, HEAD, SOLO, anchorsOf } from '../src/sprites.js';
import { PIECES, HEAD, SOLO, anchorsOf } from '../src/sprites.js';

export const FIGHTERS = [
    { id: 'zhila', ru: 'ЖИЛА', rim: '#ff2d55' },
    { id: 'kostolom', ru: 'КОСТОЛОМ', rim: '#22d3ee' },
];

export const ARENAS = [
    { id: 'dusk', ru: 'ЗАКАТ', wave: 1 },
    { id: 'pit', ru: 'ЯМА', wave: 2 },
    { id: 'meat', ru: 'БОЙНЯ', wave: 2 },
];

const png = (name, w, h, extra = {}) => ({ name, w, h, format: 'png', ...extra });
const webp = (name, w, h, extra = {}) => ({ name, w, h, format: 'webp', ...extra });

/** Полная опись: имя файла → что от него ждут. Порядок — по убыванию нужности. */
export function manifest() {
    const files = [];

    for (const fighter of FIGHTERS) {
        for (const piece of PIECES) {
            const { a, b } = anchorsOf(piece);
            // Предплечье и голень первой волны пришли по прежнему уговору, с
            // кистью и стопой внутри. Они работают через подгонку FIT и ждут
            // перерисовки без спешки — заворачивать их незачем.
            const wasOverhang = piece.id === 'arm-fore' || piece.id === 'leg-shin';
            files.push(png(`part-${fighter.id}-${piece.id}.png`, piece.w, piece.h, {
                group: 'части тела',
                wave: fighter.id === 'zhila' ? 1 : 2,
                anchors: [a, b],
                legacy: fighter.id === 'zhila' && wasOverhang,
            }));
        }
        for (const solo of SOLO) {
            files.push(png(`part-${fighter.id}-${solo.id}.png`, solo.w, solo.h, {
                group: 'части тела',
                // Кисть и стопа для ЖИЛЫ ещё не нарисованы: в первой волне они
                // сидели внутри конечности. Поэтому они во второй волне.
                wave: fighter.id === 'zhila' && solo.id === 'head' ? 1 : 2,
                anchors: [solo.anchor],
            }));
        }
    }

    for (const arena of ARENAS) {
        for (const layer of ['far', 'mid', 'near']) {
            files.push(webp(`bg-${arena.id}-${layer}.webp`, 2048, 1024, { group: 'фоны арен', wave: arena.wave }));
        }
    }

    // Фон меню закрывает экран целиком, прозрачность ему не нужна.
    files.push(webp('menu-bg.webp', 1920, 1080, { group: 'экраны', wave: 1, opaque: true }));

    for (const fighter of FIGHTERS) {
        for (const limb of ['arm', 'leg']) {
            files.push(png(`stump-${fighter.id}-${limb}.png`, 96, 96, { group: 'культи', wave: 2, anchors: [[48, 48]] }));
        }
    }

    for (const piece of PIECES) {
        const { a, b } = anchorsOf(piece);
        files.push(png(`bone-${piece.id}.png`, piece.w, piece.h, { group: 'скелет для рентгена', wave: 2, anchors: [a, b] }));
    }
    for (const solo of SOLO) {
        files.push(png(`bone-${solo.id}.png`, solo.w, solo.h, { group: 'скелет для рентгена', wave: 2, anchors: [solo.anchor] }));
    }

    for (let i = 1; i <= 6; i += 1) files.push(png(`blood-splat-${i}.png`, 256, 256, { group: 'кровь', wave: 2 }));
    for (let i = 1; i <= 3; i += 1) files.push(png(`blood-pool-${i}.png`, 512, 256, { group: 'кровь', wave: 2 }));

    for (const id of ['hand', 'foot', 'grab']) files.push(png(`icon-${id}.png`, 128, 128, { group: 'иконки', wave: 2 }));
    for (const id of ['arm', 'leg', 'ribs', 'spine', 'skull']) files.push(png(`icon-bone-${id}.png`, 96, 96, { group: 'иконки', wave: 2 }));

    files.push(png('cover.png', 1200, 630, { group: 'экраны', wave: 2, opaque: true }));

    return files;
}
