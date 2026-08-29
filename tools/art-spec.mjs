/**
 * Опись заказа на графику: что заказано, какого размера и где у него суставы.
 *
 * Один файл на всех: по нему рисуется эталон (`reference.mjs`), по нему же
 * принимается поставка (`check-art.mjs`), и на него ссылается `ART.md`.
 * Разойтись они не могут, потому что источник один.
 *
 * Размеры частей тела = длина кости в мире × 4. Четырёхкратный запас нужен
 * не из любви к качеству: боец на экране бывает до 220 px в высоту, экраны
 * бывают с двойной плотностью, и камера при переломе ныряет ещё вчетверо.
 */

/** Мировые пиксели → пиксели спрайта. */
export const SCALE = 4;
/** Поле от левого края спрайта до сустава A. Одинаковое у всех частей. */
export const PAD = 16;

/**
 * Части тела. `bone` — длина кости в спрайте; сустав A всегда в (PAD, H/2),
 * сустав B — в (PAD + bone, H/2). Всё, что торчит за B (кулак, стопа),
 * живёт в правом вылете.
 */
export const PIECES = [
    { id: 'torso-low', bone: 120, w: 152, h: 144, ru: 'корпус низ', stick: 'таз → грудь', over: 'живот и таз' },
    { id: 'torso-up', bone: 88, w: 120, h: 128, ru: 'корпус верх', stick: 'грудь → шея', over: 'грудная клетка и плечи' },
    { id: 'neck', bone: 72, w: 104, h: 96, ru: 'шея', stick: 'шея → голова', over: 'шея и трапеция' },
    { id: 'arm-upper', bone: 136, w: 168, h: 80, ru: 'плечо', stick: 'плечо → локоть', over: 'бицепс и трицепс' },
    { id: 'arm-fore', bone: 128, w: 224, h: 128, ru: 'предплечье с кистью', stick: 'локоть → запястье', over: 'кулак за суставом B' },
    { id: 'leg-thigh', bone: 168, w: 200, h: 88, ru: 'бедро', stick: 'таз → колено', over: 'мышца бедра' },
    { id: 'leg-shin', bone: 164, w: 260, h: 136, ru: 'голень со стопой', stick: 'колено → щиколотка', over: 'стопа за суставом B' },
];

/** Голова — единственная часть с одной точкой крепления, а не с двумя. */
export const HEAD = { id: 'head', w: 136, h: 136, anchor: [68, 128], ru: 'голова в профиль' };

export const anchorsOf = (piece) => ({
    a: [PAD, piece.h / 2],
    b: [PAD + piece.bone, piece.h / 2],
});

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
            files.push(png(`part-${fighter.id}-${piece.id}.png`, piece.w, piece.h, {
                group: 'части тела', wave: fighter.id === 'zhila' ? 1 : 2, anchors: [a, b],
            }));
        }
        files.push(png(`part-${fighter.id}-head.png`, HEAD.w, HEAD.h, {
            group: 'части тела', wave: fighter.id === 'zhila' ? 1 : 2, anchors: [HEAD.anchor],
        }));
    }

    for (const arena of ARENAS) {
        for (const layer of ['far', 'mid', 'near']) {
            files.push(webp(`bg-${arena.id}-${layer}.webp`, 2048, 1024, { group: 'фоны арен', wave: arena.wave }));
        }
    }

    files.push(webp('menu-bg.webp', 1920, 1080, { group: 'экраны', wave: 1 }));

    for (const fighter of FIGHTERS) {
        for (const limb of ['arm', 'leg']) {
            files.push(png(`stump-${fighter.id}-${limb}.png`, 96, 96, { group: 'культи', wave: 2, anchors: [[48, 48]] }));
        }
    }

    for (const piece of PIECES) {
        const { a, b } = anchorsOf(piece);
        files.push(png(`bone-${piece.id}.png`, piece.w, piece.h, { group: 'скелет для рентгена', wave: 2, anchors: [a, b] }));
    }
    files.push(png('bone-head.png', HEAD.w, HEAD.h, { group: 'скелет для рентгена', wave: 2, anchors: [HEAD.anchor] }));

    for (let i = 1; i <= 6; i += 1) files.push(png(`blood-splat-${i}.png`, 256, 256, { group: 'кровь', wave: 2 }));
    for (let i = 1; i <= 3; i += 1) files.push(png(`blood-pool-${i}.png`, 512, 256, { group: 'кровь', wave: 2 }));

    for (const id of ['hand', 'foot', 'grab']) files.push(png(`icon-${id}.png`, 128, 128, { group: 'иконки', wave: 2 }));
    for (const id of ['arm', 'leg', 'ribs', 'spine', 'skull']) files.push(png(`icon-bone-${id}.png`, 96, 96, { group: 'иконки', wave: 2 }));

    files.push(png('cover.png', 1200, 630, { group: 'экраны', wave: 2, opaque: true }));

    return files;
}
