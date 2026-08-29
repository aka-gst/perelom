/**
 * Части тела как спрайты.
 *
 * Геометрия крепления живёт здесь, а не в задании на графику: по этим же
 * числам собирается эталон для художника (`tools/reference.mjs`) и
 * принимается поставка (`tools/check-art.mjs`). Источник один, разойтись
 * они не могут.
 *
 * Правило одно: у каждой части две точки крепления, A и B. Код кладёт A на
 * один сустав скелета, B — на другой, и больше ничего не двигает. Поворот и
 * масштаб считаются из самих суставов, поэтому спрайты работают и в позах,
 * и в рагдолле — сустав есть сустав.
 *
 * Графики может не быть: тогда игра рисует те же кости палками, как и
 * раньше. Ни один файл здесь не обязателен.
 */

/** Мировые пиксели → пиксели спрайта. */
export const SCALE = 4;
/** Поле от левого края спрайта до сустава A. Одинаковое у всех частей. */
export const PAD = 16;

export const PIECES = [
    { id: 'torso-low', bone: 120, w: 152, h: 144, ru: 'корпус низ', stick: 'таз → грудь' },
    { id: 'torso-up', bone: 88, w: 120, h: 128, ru: 'корпус верх', stick: 'грудь → шея' },
    { id: 'neck', bone: 72, w: 104, h: 96, ru: 'шея', stick: 'шея → голова' },
    { id: 'arm-upper', bone: 136, w: 168, h: 80, ru: 'плечо', stick: 'плечо → локоть' },
    { id: 'arm-fore', bone: 128, w: 224, h: 128, ru: 'предплечье с кистью', stick: 'локоть → запястье' },
    { id: 'leg-thigh', bone: 168, w: 200, h: 88, ru: 'бедро', stick: 'таз → колено' },
    { id: 'leg-shin', bone: 164, w: 260, h: 136, ru: 'голень со стопой', stick: 'колено → щиколотка' },
];

/** Голова — единственная часть с одной точкой крепления. */
export const HEAD = { id: 'head', w: 136, h: 136, anchor: [68, 128], ru: 'голова в профиль' };

export const anchorsOf = (piece) => ({
    a: [PAD, piece.h / 2],
    b: [PAD + piece.bone, piece.h / 2],
});

export const PIECE_BY_ID = Object.fromEntries(PIECES.map((p) => [p.id, p]));

/**
 * Откуда брать файл графики.
 *
 * Обычно — с сервера рядом с игрой. Но игра умеет собираться в один файл,
 * и тогда картинки лежат прямо в нём: сборщик кладёт их сюда, и ни одного
 * запроса наружу не остаётся.
 */
export function assetUrl(name, base) {
    const bundled = globalThis.__PERELOM_ASSETS;
    // В однофайловой сборке чего нет — того нет: ходить за ним некуда,
    // и незачем сорить в консоль ошибками про ненарисованное.
    if (bundled) return bundled[name] ?? null;
    return `${base}/${name}`;
}

/**
 * Подгонка под фактический рисунок.
 *
 * Первая поставка пришла нарисованной во всю ширину холста: поля в 16 px и
 * вылет под кулак художник не отбил, и крепления по описи легли мимо. Само
 * искусство при этом хорошее, перерисовывать его из-за разметки — глупо.
 *
 * Поэтому при загрузке меряется настоящая непрозрачная область спрайта, а
 * суставы задаются долями от неё: 0 — левый край рисунка, 1 — правый.
 * Для предплечья и голени доля меньше единицы, потому что за суставом
 * остаются кулак и стопа.
 *
 * Числа подобраны глазом по собранному бойцу — это разметка, а не физика,
 * и другого способа её задать нет.
 */
export const FIT = {
    'torso-low': { a: 0.12, b: 0.86, thick: 0.62 },
    'torso-up': { a: 0.16, b: 0.84, thick: 0.66 },
    neck: { a: 0.06, b: 0.9, thick: 1 },
    'arm-upper': { a: 0.04, b: 0.94, thick: 1 },
    'arm-fore': { a: 0.03, b: 0.74, thick: 1 },
    'leg-thigh': { a: 0.04, b: 0.95, thick: 1 },
    'leg-shin': { a: 0.03, b: 0.7, thick: 1 },
    head: { a: 0.5, b: 0.5, thick: 1 },
};

/** Непрозрачная рамка спрайта: по ней и считаются настоящие крепления. */
function measure(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let x0 = canvas.width;
    let x1 = -1;
    let y0 = canvas.height;
    let y1 = -1;
    for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
            if (data[(y * canvas.width + x) * 4 + 3] > 24) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
    }
    if (x1 < 0) return null;
    return { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Куда на самом деле садятся суставы этого спрайта. */
export function fitOf(id, img) {
    const box = measure(img);
    const fit = FIT[id] ?? { a: 0, b: 1, thick: 1 };
    if (!box) return { ax: 0, bx: img.naturalWidth, y: img.naturalHeight / 2 };
    return {
        ax: box.x0 + box.w * fit.a,
        bx: box.x0 + box.w * fit.b,
        y: box.y0 + box.h * (fit.thick === 1 ? 0.5 : fit.thick),
        box,
    };
}

/**
 * Порядок отрисовки — от дальнего к ближнему. Он же задаёт, какое звено
 * какой частью рисуется. Дальние конечности идут с затемнением: без него
 * боец читается как плоская аппликация.
 */
export const LAYERS = [
    { a: 'neck', b: 'elbowB', piece: 'arm-upper', back: true },
    { a: 'elbowB', b: 'handB', piece: 'arm-fore', back: true },
    { a: 'pelvis', b: 'kneeB', piece: 'leg-thigh', back: true },
    { a: 'kneeB', b: 'footB', piece: 'leg-shin', back: true },
    { a: 'pelvis', b: 'chest', piece: 'torso-low', back: false },
    { a: 'chest', b: 'neck', piece: 'torso-up', back: false },
    { a: 'neck', b: 'head', piece: 'neck', back: false },
    { a: 'neck', b: 'head', piece: 'head', back: false, head: true },
    { a: 'pelvis', b: 'kneeF', piece: 'leg-thigh', back: false },
    { a: 'kneeF', b: 'footF', piece: 'leg-shin', back: false },
    { a: 'neck', b: 'elbowF', piece: 'arm-upper', back: false },
    { a: 'elbowF', b: 'handF', piece: 'arm-fore', back: false },
];

/** Какой кости принадлежит слой — по ней он гаснет при отрыве конечности. */
export const BONE_OF_LAYER = {
    'torso-low': 'spine',
    'torso-up': 'ribs',
    neck: 'skull',
    head: 'skull',
    'arm-upper': 'arm',
    'arm-fore': 'arm',
    'leg-thigh': 'leg',
    'leg-shin': 'leg',
};

const IDS = [...PIECES.map((p) => p.id), HEAD.id];

/**
 * Загрузка набора одного бойца. Возвращает объект, который сразу можно
 * отдавать в рендер: пока картинки едут, в нём пусто, и рисуются палки.
 */
export function loadFighterArt(fighterId, base = './assets/art') {
    const set = { id: fighterId, ready: false, images: {}, dark: {}, fit: {} };
    let left = IDS.length;
    for (const id of IDS) {
        const url = assetUrl(`part-${fighterId}-${id}.png`, base);
        if (!url) {
            left -= 1;
            continue;
        }
        const img = new Image();
        img.onload = () => {
            set.images[id] = img;
            set.dark[id] = darken(img);
            set.fit[id] = fitOf(id, img);
            left -= 1;
            // Готовым набор считается только целиком: половина спрайтов и
            // половина палок в одном бойце выглядит как поломка.
            if (left === 0) set.ready = true;
        };
        img.onerror = () => {
            left -= 1;
            if (left === 0) set.ready = Object.keys(set.images).length === IDS.length;
        };
        img.src = url;
    }
    return set;
}

/** Затемнённая копия — для дальней руки и дальней ноги. */
function darken(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
}

/** Слои арены: дальний, средний, ближний. Порядок — порядок отрисовки. */
export const ARENA_LAYERS = ['far', 'mid', 'near'];

export function loadArenaArt(arenaId, base = './assets/art') {
    const set = { id: arenaId, ready: false, images: {}, order: ARENA_LAYERS };
    let left = ARENA_LAYERS.length;
    for (const layer of ARENA_LAYERS) {
        const url = assetUrl(`bg-${arenaId}-${layer}.webp`, base);
        if (!url) {
            left -= 1;
            continue;
        }
        const img = new Image();
        img.onload = () => {
            set.images[layer] = img;
            left -= 1;
            if (left === 0) set.ready = Object.keys(set.images).length === ARENA_LAYERS.length;
        };
        img.onerror = () => {
            left -= 1;
            if (left === 0) set.ready = false;
        };
        img.src = url;
    }
    return set;
}
