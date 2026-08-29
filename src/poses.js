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
        pelvis: [-4, -4], chest: [-8, 26], neck: [-10, 48], head: [-8, 66],
        elbowF: [8, 19], handF: [16, 50], elbowB: [-4, 14], handB: [-34, 26],
        kneeF: [37, -17], footF: [72, 4], kneeB: [-5, -47], footB: [-32, -78],
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
    getup: {
        pelvis: [0, -34], chest: [4, -4], neck: [6, 18], head: [13, 34],
        elbowF: [17, -15], handF: [34, 12], elbowB: [11, -16], handB: [-4, 12],
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
 * Раскадровка на действие. `contact` — доля времени, в которой удар
 * касается; до неё анимация тянется, после — отдёргивается.
 *
 * Замах длиннее у медленных действий: по силуэту видно, что летит,
 * и у противника есть за что зацепиться, когда он решает перехватывать.
 */
export const ANIM = {
    hand: { frames: [['idle', 0], ['windHand', 0.22], ['hitHand', 0.42], ['hitHand', 0.55], ['idle', 1]], contact: 0.42 },
    foot: { frames: [['idle', 0], ['windFoot', 0.32], ['hitFoot', 0.55], ['hitFoot', 0.68], ['idle', 1]], contact: 0.55 },
    grab: { frames: [['idle', 0], ['windGrab', 0.34], ['hitGrab', 0.58], ['hitGrab', 0.74], ['idle', 1]], contact: 0.58 },
    catchHand: { frames: [['idle', 0], ['catch', 0.28], ['catch', 0.62], ['idle', 1]], contact: 0.4 },
    catchFoot: { frames: [['idle', 0], ['catch', 0.28], ['catch', 0.62], ['idle', 1]], contact: 0.4 },
    block: { frames: [['idle', 0], ['guard', 0.18], ['guard', 0.72], ['idle', 1]], contact: 0.4 },
    hurt: { frames: [['idle', 0], ['hurt', 0.2], ['hurt', 0.5], ['idle', 1]], contact: 0.2 },
    getup: { frames: [['getup', 0], ['getup', 0.5], ['idle', 1]], contact: 0 },
};

/** Поза действия в момент `t` (0..1). */
export function sampleAnim(actionId, t) {
    const anim = ANIM[actionId] ?? ANIM.hand;
    const frames = anim.frames;
    const clamped = Math.min(1, Math.max(0, t));
    for (let i = 0; i < frames.length - 1; i += 1) {
        const [nameA, tA] = frames[i];
        const [nameB, tB] = frames[i + 1];
        if (clamped >= tA && clamped <= tB) {
            const span = tB - tA || 1;
            const k = (clamped - tA) / span;
            // Сглаживание: линейная интерполяция читается как робот.
            const eased = k * k * (3 - 2 * k);
            return lerpPose(POSES[nameA], POSES[nameB], eased);
        }
    }
    return POSES[frames[frames.length - 1][0]];
}

/** Где кулак или стопа в момент касания — туда летит кровь и оттуда импульс. */
export function contactPoint(actionId) {
    if (actionId === 'foot') return 'footF';
    if (actionId === 'grab') return 'handB';
    return 'handF';
}
