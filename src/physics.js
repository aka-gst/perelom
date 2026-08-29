/**
 * Один скелет на два режима — в этом весь движок.
 *
 *   posed   — точки расставляет анимация. Бьёшь ты: чётко, по кадрам,
 *             без вялости, к которой рагдолл-файтинги обычно и сводятся.
 *   ragdoll — точки живут по верле-интегрированию. Получает он: летит,
 *             крутится, цепляется за землю и никогда не повторяется.
 *
 * Переключение односторонее по смыслу: удар подбрасывает тело в рагдолл,
 * приземление и подъём возвращают его в позы. Скорость на входе в рагдолл
 * берётся из позы, поэтому подброс продолжает движение удара, а не начинает
 * своё с нуля — иначе попадание не чувствуется.
 */

/** Точки скелета. Порядок важен только для стабильности решателя. */
export const POINTS = [
    'pelvis', 'chest', 'neck', 'head',
    'elbowF', 'handF', 'elbowB', 'handB',
    'kneeF', 'footF', 'kneeB', 'footB',
];

/**
 * Связи. `stiff` — доля, на которую связь исправляется за проход:
 * туловище жёсткое, конечности помягче, распорки почти свободны.
 * `bone` — какой кости принадлежит звено; по нему удар находит, что ломать.
 */
export const STICKS = [
    ['pelvis', 'chest', 1, 'spine'],
    ['chest', 'neck', 1, 'ribs'],
    ['neck', 'head', 1, 'skull'],
    ['neck', 'elbowF', 0.75, 'arm'],
    ['elbowF', 'handF', 0.75, 'arm'],
    ['neck', 'elbowB', 0.6, 'arm'],
    ['elbowB', 'handB', 0.6, 'arm'],
    ['pelvis', 'kneeF', 0.8, 'leg'],
    ['kneeF', 'footF', 0.8, 'leg'],
    ['pelvis', 'kneeB', 0.7, 'leg'],
    ['kneeB', 'footB', 0.7, 'leg'],
    // Распорки: держат тело телом, а не верёвкой. Без них рагдолл
    // складывается сам в себя и выглядит как тряпка, а не как человек.
    ['pelvis', 'neck', 0.5, null],
    ['chest', 'head', 0.3, null],
    ['chest', 'elbowF', 0.2, null],
    ['chest', 'elbowB', 0.2, null],
    ['chest', 'kneeF', 0.12, null],
    ['chest', 'kneeB', 0.12, null],
];

/** Стены арены. Без них подброшенное тело улетает за кадр и джагл слепнет. */
export const WALL = 330;

export const GRAVITY = 2400;
export const GROUND_FRICTION = 0.72;
export const AIR_DRAG = 0.995;

export function createSkeleton(pose, x, groundY, facing, centerX = x) {
    const points = {};
    for (const id of POINTS) {
        const [lx, ly] = pose[id];
        const px = x + lx * facing;
        const py = groundY - 78 - ly; // 78 — высота таза над землёй в стойке
        points[id] = { x: px, y: py, px, py, r: id === 'head' ? 13 : 7 };
    }
    const sticks = STICKS.map(([a, b, stiff, bone]) => ({
        a, b, stiff, bone,
        len: Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y),
    }));
    return { points, sticks, mode: 'posed', facing, groundY, spin: 0, minX: centerX - WALL, maxX: centerX + WALL };
}

/** Расставить точки по позе — режим `posed`. */
export function applyPose(sk, pose, x, groundY) {
    for (const id of POINTS) {
        const p = sk.points[id];
        const [lx, ly] = pose[id];
        p.px = p.x;
        p.py = p.y;
        p.x = x + lx * sk.facing;
        p.y = groundY - 78 - ly;
    }
}

/**
 * Уронить скелет в рагдолл.
 *
 * `vx, vy` — импульс удара, `spin` — закрутка. Прошлые позиции точек
 * подменяем так, чтобы верле увидел нужную скорость: это единственный
 * способ задать рагдоллу начальную скорость, не заводя отдельное поле.
 */
export function goRagdoll(sk, vx, vy, spin = 0) {
    sk.mode = 'ragdoll';
    const cx = sk.points.pelvis.x;
    const cy = sk.points.pelvis.y;
    for (const id of POINTS) {
        const p = sk.points[id];
        // Закрутка: чем дальше точка от таза, тем сильнее её сносит вбок.
        const armX = p.y - cy;
        const armY = p.x - cx;
        p.px = p.x - vx / 60 + (armX * spin) / 60;
        p.py = p.y - vy / 60 - (armY * spin) / 60;
    }
}

/** Шаг симуляции. Возвращает true, если тело лежит и почти не двигается. */
export function step(sk, dt) {
    if (sk.mode !== 'ragdoll') return false;

    for (const id of POINTS) {
        const p = sk.points[id];
        const vx = (p.x - p.px) * AIR_DRAG;
        const vy = (p.y - p.py) * AIR_DRAG;
        p.px = p.x;
        p.py = p.y;
        p.x += vx;
        p.y += vy + GRAVITY * dt * dt;
    }

    // Несколько проходов решателя: одного мало, тело растягивается на ударах.
    for (let pass = 0; pass < 6; pass += 1) {
        for (const stick of sk.sticks) {
            const a = sk.points[stick.a];
            const b = sk.points[stick.b];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 0.0001;
            const shift = ((dist - stick.len) / dist) * 0.5 * stick.stiff;
            a.x += dx * shift;
            a.y += dy * shift;
            b.x -= dx * shift;
            b.y -= dy * shift;
        }
        collide(sk);
    }

    return atRest(sk);
}

function collide(sk) {
    for (const id of POINTS) {
        const p = sk.points[id];
        const floor = sk.groundY - p.r * 0.4;
        if (p.y > floor) {
            const vx = p.x - p.px;
            p.y = floor;
            // Трение о землю: без него тело бесконечно скользит, как по льду.
            p.px = p.x - vx * GROUND_FRICTION;
            p.py = p.y;
        }
        // Стены гасят скорость, а не отражают: отскок читался бы как батут.
        if (p.x < sk.minX || p.x > sk.maxX) {
            const vy = p.y - p.py;
            p.x = Math.max(sk.minX, Math.min(sk.maxX, p.x));
            p.px = p.x;
            p.py = p.y - vy * 0.6;
        }
    }
}

function atRest(sk) {
    let moved = 0;
    let lowest = -Infinity;
    for (const id of POINTS) {
        const p = sk.points[id];
        moved += Math.abs(p.x - p.px) + Math.abs(p.y - p.py);
        lowest = Math.max(lowest, p.y);
    }
    return moved < 1.2 && lowest > sk.groundY - 30;
}

/**
 * Зона поражения — коробка вокруг тела, а не набор тонких костей.
 *
 * Так устроено во всех файтингах, и не от лени: по отрезкам костей удар
 * проходит только если кулак пришёл почти точно в линию руки или ноги, и
 * попасть становится неоправданно трудно. Тело — это объём, и мимо него
 * промахиваются, а не мимо бедренной кости.
 */
export function hurtBox(sk, pad = 6) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const id of POINTS) {
        const p = sk.points[id];
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y);
        y1 = Math.max(y1, p.y);
    }
    return { x0: x0 - pad, x1: x1 + pad, y0: y0 - pad, y1: y1 + pad };
}

/** Насколько точка не достаёт до коробки. Внутри коробки — ноль. */
export function distanceToBox(box, x, y) {
    const dx = Math.max(box.x0 - x, 0, x - box.x1);
    const dy = Math.max(box.y0 - y, 0, y - box.y1);
    return Math.hypot(dx, dy);
}

/**
 * Попадание: ближайшее звено скелета в радиусе от точки, и место касания.
 *
 * Считается расстояние до отрезка, а не до его середины: иначе длинная
 * кость ловит удар только в упор по центру, и попадание по голени мимо
 * колена не засчитывается.
 */
export function hitBone(sk, x, y, radius) {
    let best = null;
    for (const stick of sk.sticks) {
        if (!stick.bone) continue;
        const a = sk.points[stick.a];
        const b = sk.points[stick.b];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
        const px = a.x + dx * t;
        const py = a.y + dy * t;
        const dist = Math.hypot(px - x, py - y);
        if (dist <= radius && (!best || dist < best.dist)) best = { bone: stick.bone, x: px, y: py, dist };
    }
    return best;
}

/** Ближайшее к точке звено — так удар в джагле находит, какую кость ломать. */
export function boneNear(sk, x, y) {
    let best = null;
    let bestDist = Infinity;
    for (const stick of sk.sticks) {
        if (!stick.bone) continue;
        const a = sk.points[stick.a];
        const b = sk.points[stick.b];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dist = Math.hypot(mx - x, my - y);
        if (dist < bestDist) {
            bestDist = dist;
            best = stick.bone;
        }
    }
    return best;
}

/** Середина конкретной кости — именно к ней ныряет камера при переломе. */
export function boneCenter(sk, boneId) {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const stick of sk.sticks) {
        if (stick.bone !== boneId) continue;
        sx += sk.points[stick.a].x + sk.points[stick.b].x;
        sy += sk.points[stick.a].y + sk.points[stick.b].y;
        n += 2;
    }
    return n ? { x: sx / n, y: sy / n } : centerOf(sk);
}

/** Центр тела — за ним ходит камера и к нему летят удары в джагле. */
export function centerOf(sk) {
    const { chest, pelvis } = sk.points;
    return { x: (chest.x + pelvis.x) / 2, y: (chest.y + pelvis.y) / 2 };
}

/** Насколько высоко тело над землёй — по этому понимаем, идёт ли джагл. */
export function heightOf(sk) {
    let lowest = -Infinity;
    for (const id of POINTS) lowest = Math.max(lowest, sk.points[id].y);
    return sk.groundY - lowest;
}
