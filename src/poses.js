/**
 * Позы и раскадровка ударов.
 *
 * Координаты локальные: начало — таз в стойке, `x` — в сторону взгляда,
 * `y` вверх. Ступни на `-78`: это уровень земли.
 *
 * Зачем вообще позы, если есть физика: рагдолл-файтинги разваливаются
 * ровно на одном — попадание не чувствуется, потому что бьющий сам похож
 * на желе. Поэтому бьющий всегда анимирован жёстко, а физика достаётся
 * только тому, кто получает.
 */

export const POSES = {
    idle: {
        pelvis: [0, 0], chest: [1, 30], neck: [2, 52], head: [6, 70],
        elbowF: [21, 24], handF: [24, 56], elbowB: [-21, 27], handB: [-4, 54],
        kneeF: [19, -38], footF: [30, -78], kneeB: [-16, -40], footB: [-32, -78],
    },
    guard: {
        pelvis: [0, -4], chest: [-1, 26], neck: [0, 48], head: [2, 66],
        elbowF: [28, 28], handF: [16, 58], elbowB: [-34, 53], handB: [-2, 58],
        kneeF: [28, -37], footF: [28, -78], kneeB: [-8, -46], footB: [-34, -78],
    },
    catch: {
        pelvis: [2, -2], chest: [4, 28], neck: [6, 50], head: [12, 67],
        elbowF: [23, 20], handF: [44, 44], elbowB: [-17, 25], handB: [0, 52],
        kneeF: [26, -37], footF: [32, -78], kneeB: [-7, -44], footB: [-30, -78],
    },
    windHand: {
        pelvis: [-2, 0], chest: [-4, 30], neck: [-4, 52], head: [-2, 70],
        elbowF: [-10, 19], handF: [-16, 50], elbowB: [-38, 50], handB: [-6, 52],
        kneeF: [17, -38], footF: [28, -78], kneeB: [-18, -40], footB: [-34, -78],
    },
    hitHand: {
        pelvis: [4, -2], chest: [8, 28], neck: [10, 50], head: [14, 67],
        elbowF: [24, 19], handF: [48, 40], elbowB: [14, 16], handB: [-16, 28],
        kneeF: [28, -38], footF: [36, -78], kneeB: [-8, -43], footB: [-30, -78],
    },
    windFoot: {
        pelvis: [-2, 2], chest: [-2, 32], neck: [-2, 54], head: [2, 72],
        elbowF: [15, 24], handF: [20, 56], elbowB: [-20, 25], handB: [-6, 54],
        kneeF: [41, 6], footF: [22, -30], kneeB: [-10, -40], footB: [-26, -78],
    },
    hitFoot: {
        pelvis: [10, -6], chest: [4, 23], neck: [1, 45], head: [2, 63],
        elbowF: [21, 17], handF: [30, 48], elbowB: [8, 12], handB: [-22, 24],
        kneeF: [53, -10], footF: [92, 2], kneeB: [5, -49], footB: [-24, -78],
    },
    windGrab: {
        pelvis: [-2, 0], chest: [-2, 30], neck: [-2, 52], head: [0, 70],
        elbowF: [-25, 27], handF: [2, 44], elbowB: [16, 23], handB: [-10, 42],
        kneeF: [17, -38], footF: [28, -78], kneeB: [-13, -41], footB: [-32, -78],
    },
    hitGrab: {
        pelvis: [6, -4], chest: [10, 26], neck: [12, 48], head: [16, 65],
        elbowF: [25, 16], handF: [48, 38], elbowB: [20, 15], handB: [46, 34],
        kneeF: [33, -37], footF: [38, -78], kneeB: [3, -47], footB: [-24, -78],
    },
    hurt: {
        pelvis: [-6, -4], chest: [-12, 25], neck: [-16, 47], head: [-25, 63],
        elbowF: [4, 20], handF: [-6, 50], elbowB: [-11, 13], handB: [-40, 26],
        kneeF: [22, -37], footF: [22, -78], kneeB: [-12, -47], footB: [-38, -78],
    },
    hurtHigh: {
        pelvis: [-4, -2], chest: [-12, 27], neck: [-21, 47], head: [-36, 56],
        elbowF: [4, 24], handF: [-8, 54], elbowB: [-26, 13], handB: [-58, 12],
        kneeF: [21, -37], footF: [20, -78], kneeB: [-13, -44], footB: [-36, -78],
    },
    hurtLow: {
        pelvis: [-2, -8], chest: [6, 21], neck: [16, 41], head: [31, 51],
        elbowF: [1, 10], handF: [24, -12], elbowB: [14, 7], handB: [-14, -8],
        kneeF: [30, -37], footF: [26, -78], kneeB: [-3, -51], footB: [-34, -78],
    },
    step: {
        pelvis: [0, 4], chest: [1, 34], neck: [2, 56], head: [6, 73],
        elbowF: [18, 26], handF: [22, 58], elbowB: [-12, 25], handB: [-4, 56],
        kneeF: [35, -21], footF: [40, -62], kneeB: [-15, -36], footB: [-35, -72],
    },
    air: {
        pelvis: [0, 0], chest: [0, 30], neck: [1, 52], head: [4, 70],
        elbowF: [25, 28], handF: [26, 60], elbowB: [-23, 28], handB: [-8, 56],
        kneeF: [40, -17], footF: [16, -50], kneeB: [6, -43], footB: [-34, -52],
    },
    getup: {
        pelvis: [0, -34], chest: [4, -4], neck: [6, 18], head: [13, 34],
        elbowF: [16, -15], handF: [34, 12], elbowB: [12, -16], handB: [-4, 12],
        kneeF: [40, -49], footF: [12, -78], kneeB: [26, -68], footB: [-14, -78],
    },
};

export const POSE_KEYS = Object.keys(POSES.idle);

/** Смешать две позы. `k` от 0 до 1. */
export function lerpPose(a, b, k) {
    const out = {};
    for (const id of POSE_KEYS) {
        out[id] = [a[id][0] + (b[id][0] - a[id][0]) * k, a[id][1] + (b[id][1] - a[id][1]) * k];
    }
    return out;
}

/**
 * Раскадровка удара привязана к кадрам, а не к доле времени.
 *
 * Так анимация не может разойтись с правилами: разгон длится ровно столько
 * кадров, сколько написано в `rules.js`, и противник видит замах ровно то
 * время, за которое обязан успеть перехватить. Если поменять кадры в
 * правилах, картинка поедет за ними сама.
 */
export const ATTACK_POSES = {
    hand: { wind: 'windHand', hit: 'hitHand' },
    foot: { wind: 'windFoot', hit: 'hitFoot' },
    grab: { wind: 'windGrab', hit: 'hitGrab' },
    catchHand: { wind: 'guard', hit: 'catch' },
    catchFoot: { wind: 'guard', hit: 'catch' },
};

const ease = (k) => k * k * (3 - 2 * k);

/** Поза действия на кадре `frame`. `spec` — запись из ACTION. */
export function poseForAttack(actionId, frame, spec) {
    const keys = ATTACK_POSES[actionId];
    if (!keys) return POSES.idle;
    const { startup, active, recovery } = spec;
    // Конечность обязана прийти в крайнюю точку ровно к первому активному
    // кадру: дальность удара считается по кулаку и стопе, и если они ещё
    // поджаты, удар становится опасным раньше, чем куда-то дотягивается.
    const cock = Math.max(1, Math.round(startup * 0.55));
    if (frame < cock) {
        return lerpPose(POSES.idle, POSES[keys.wind], ease(frame / cock));
    }
    if (frame < startup) {
        const k = (frame - cock) / Math.max(1, startup - cock);
        return lerpPose(POSES[keys.wind], POSES[keys.hit], ease(k));
    }
    if (frame < startup + active) return POSES[keys.hit];
    const back = (frame - startup - active) / Math.max(1, recovery);
    return lerpPose(POSES[keys.hit], POSES.idle, ease(Math.min(1, back)));
}

/**
 * Поза получившего удар. `frame` — сколько кадров прошло, `length` — всего.
 *
 * В референсах реакция резкая: тело складывается за пару кадров и потом
 * медленно возвращается. Держать одну статичную позу всю реакцию — значит
 * потерять вес удара, ради которого всё и затевалось.
 */
export function hurtPose(kind, frame, length) {
    const target = POSES[kind] ?? POSES.hurt;
    const snap = 3;
    if (frame < snap) return lerpPose(POSES.idle, target, ease(frame / snap));
    const back = (frame - snap) / Math.max(1, length - snap);
    return lerpPose(target, POSES.idle, ease(Math.min(1, back)));
}

/** Поза ходьбы: цикл шага, `phase` от 0 до 1. */
export function walkPose(phase) {
    const k = (Math.sin(phase * Math.PI * 2) + 1) / 2;
    return lerpPose(POSES.idle, POSES.step, k);
}

/** Где кулак или стопа в момент касания — туда летит кровь и оттуда импульс. */
export function contactPoint(actionId) {
    if (actionId === 'foot') return 'footF';
    if (actionId === 'grab') return 'handB';
    return 'handF';
}
