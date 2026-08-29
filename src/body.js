/**
 * Кости и то, что с ними делает урон.
 *
 * Здесь живёт главная связка игры: **перелом — это не украшение, а ход в
 * мысленной игре**. Сломанная кость выключает из треугольника конкретное
 * действие, и противник об этом знает. Сломал ему руку — он больше не может
 * перехватывать руку, и твоя рука до конца боя ходит безнаказанно.
 *
 * Поэтому кости названы не по анатомии, а по тому, что они отнимают.
 *
 * Модуль чистый: ни физики, ни канваса.
 */

/** Кость целая → сломана → оторвана. Дальше ломать нечего. */
export const INTACT = 'intact';
export const BROKEN = 'broken';
export const TORN = 'torn';

export const BONES = {
    arm: {
        id: 'arm',
        name: 'РУКА',
        /** Импульс, который кость держит. Меньше — ломается раньше. */
        strength: 300,
        /** Что перелом вычёркивает из треугольника. */
        disables: ['hand', 'catchHand'],
        /** Можно ли оторвать. Позвоночник и череп — нет, это уже конец боя. */
        tearable: true,
    },
    leg: {
        id: 'leg',
        name: 'НОГА',
        strength: 420,
        disables: ['foot', 'catchFoot'],
        tearable: true,
    },
    ribs: {
        id: 'ribs',
        name: 'РЁБРА',
        strength: 600,
        disables: [],
        tearable: false,
        /** Сломанные рёбра не отнимают действие — они умножают весь урон. */
        frailty: 1.35,
    },
    spine: {
        id: 'spine',
        name: 'ПОЗВОНОЧНИК',
        strength: 900,
        disables: ['grab'],
        tearable: false,
        frailty: 1.2,
    },
    skull: {
        id: 'skull',
        name: 'ЧЕРЕП',
        strength: 480,
        disables: [],
        tearable: false,
        /** Второй перелом черепа боец не переживает. */
        lethalTwice: true,
    },
};

export const BONE_IDS = Object.keys(BONES);

/** Куда приходится удар при штатном обмене — по типу действия. */
export const BONE_FOR_TARGET = {
    head: 'skull',
    ribs: 'ribs',
    spine: 'spine',
    arm: 'arm',
    leg: 'leg',
};

export function makeBody() {
    const bones = {};
    for (const id of BONE_IDS) {
        bones[id] = { id, state: INTACT, stress: 0 };
    }
    return { hp: 100, guard: 3, bones };
}

/** Действия, которые боец физически ещё может выбрать. */
export function availableActions(body, all) {
    const gone = new Set();
    for (const id of BONE_IDS) {
        if (body.bones[id].state === INTACT) continue;
        for (const action of BONES[id].disables) gone.add(action);
    }
    // Блок не отнимает ничего: пока боец стоит, он может закрыться.
    return all.filter((id) => !gone.has(id));
}

/** Во сколько раз тело хрупче исходного — из-за уже сломанного. */
export function frailtyOf(body) {
    let scale = 1;
    for (const id of BONE_IDS) {
        const bone = BONES[id];
        if (bone.frailty && body.bones[id].state !== INTACT) scale *= bone.frailty;
    }
    return scale;
}

/**
 * Приложить импульс к кости.
 *
 * Ломает не только одиночный сильный удар: накопленное напряжение тоже
 * считается. Поэтому джагл из десяти лёгких тычков доламывает то, что один
 * тычок не берёт, — и это единственный способ сломать самое прочное.
 *
 * Возвращает { damage, broke, tore, lethal }.
 */
export function applyImpulse(body, boneId, impulse, baseDamage) {
    const bone = BONES[boneId];
    const state = body.bones[boneId];
    const frailty = frailtyOf(body);
    const damage = baseDamage * frailty;

    body.hp = Math.max(0, body.hp - damage);

    if (!bone) return { damage, broke: false, tore: false, lethal: false };

    state.stress += impulse;

    // Сломанная кость держит вдвое хуже — второй перелом приходит быстро.
    const limit = state.state === INTACT ? bone.strength : bone.strength * 0.5;
    const crosses = impulse >= limit || state.stress >= limit * 2;
    if (!crosses) return { damage, broke: false, tore: false, lethal: false };

    state.stress = 0;

    if (state.state === INTACT) {
        state.state = BROKEN;
        return { damage, broke: true, tore: false, lethal: false };
    }
    if (state.state === BROKEN) {
        if (bone.tearable) {
            state.state = TORN;
            return { damage, broke: true, tore: true, lethal: false };
        }
        if (bone.lethalTwice) {
            body.hp = 0;
            return { damage, broke: true, tore: false, lethal: true };
        }
    }
    return { damage, broke: false, tore: false, lethal: false };
}

/** Короткая сводка для интерфейса: что у бойца уже не работает. */
export function damageReport(body) {
    return BONE_IDS
        .filter((id) => body.bones[id].state !== INTACT)
        .map((id) => ({ id, name: BONES[id].name, state: body.bones[id].state }));
}
