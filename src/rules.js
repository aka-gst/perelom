/**
 * Треугольник размена — единственный источник правды о том, что кого бьёт.
 *
 * Правило в одну строку:
 *
 *   удар бьёт бросок  →  бросок бьёт защиту  →  защита бьёт удар
 *
 * Вся хитрость в том, что «защита» — это два разных решения с разной ценой:
 *
 *   БЛОК     — безопасно. Удар не проходит, но ты только теряешь темп.
 *   ПЕРЕХВАТ — жадно. Надо угадать ТИП удара: угадал — противник улетает
 *              в воздух и начинается джагл; не угадал — прилетает контрхит.
 *
 * Отсюда же берётся вход в физику: перехват и есть лаунчер. Читаешь — чтобы
 * получить право исполнять. Пока противник в воздухе, читать нечего:
 * летящее тело не перехватывает.
 *
 * Модуль чистый: ни DOM, ни канваса, ни случайности.
 */

/** Шесть действий: три кнопки × два жеста (толчок от себя / тяга на себя). */
export const ACTION = {
    hand: {
        id: 'hand',
        kind: 'strike',
        name: 'РУКА',
        button: 'hand',
        gesture: 'push',
        /** Кадры до попадания. Рука опережает ногу — на этом строится размен. */
        startup: 7,
        impulse: 260,
        damage: 6,
        /** Куда приходится удар при штатном обмене. */
        target: 'head',
        guard: 1,
    },
    foot: {
        id: 'foot',
        kind: 'strike',
        name: 'НОГА',
        button: 'foot',
        gesture: 'push',
        startup: 13,
        impulse: 520,
        damage: 11,
        target: 'ribs',
        guard: 2,
    },
    grab: {
        id: 'grab',
        kind: 'grab',
        name: 'БРОСОК',
        button: 'grab',
        gesture: 'push',
        startup: 17,
        impulse: 700,
        damage: 14,
        target: 'spine',
        guard: 0,
    },
    catchHand: {
        id: 'catchHand',
        kind: 'catch',
        name: 'ПЕРЕХВАТ РУКИ',
        button: 'hand',
        gesture: 'pull',
        /** Тип удара, который этот перехват ловит. */
        catches: 'hand',
    },
    catchFoot: {
        id: 'catchFoot',
        kind: 'catch',
        name: 'ПЕРЕХВАТ НОГИ',
        button: 'foot',
        gesture: 'pull',
        catches: 'foot',
    },
    block: {
        id: 'block',
        kind: 'block',
        name: 'БЛОК',
        button: 'grab',
        gesture: 'pull',
    },
};

export const ACTIONS = Object.keys(ACTION);

/** Действие по кнопке и жесту — так его находит и ввод, и ИИ. */
export function actionFor(button, gesture) {
    return ACTIONS.find((id) => ACTION[id].button === button && ACTION[id].gesture === gesture) ?? null;
}

/** Удары, которыми можно бить: только они попадают в джагл и в перехват. */
export const STRIKES = ACTIONS.filter((id) => ACTION[id].kind === 'strike');

/** Множитель импульса и урона за контрхит: перехватил не тот тип — получай. */
export const COUNTER_SCALE = 1.6;

/** Множитель за размен ударами: оба открылись, обоим прилетает слабее. */
export const TRADE_SCALE = 0.7;

/**
 * Что случилось с одной из сторон в размене.
 *
 *   hit      — попал штатно
 *   counter  — попал в жадный перехват, ×1.6
 *   trade    — оба ударили, ослабленный обоюдный размен
 *   launch   — его перехватили: он улетает в воздух, начинается джагл
 *   thrown   — его бросили: тяжёлый удар о землю, джагла нет
 *   chipped  — его удар удержали блоком
 *   whiff    — не случилось ничего
 */
const NOTHING = { hit: null, taker: null };

/**
 * Разрешение одного обмена. `a` и `b` — идентификаторы действий двух бойцов.
 *
 * Возвращает { events: [...] }, где каждое событие — это «кто по кому и как».
 * Порядок событий не значим: обмен считается одномоментным.
 */
export function resolve(a, b) {
    const events = [];
    const A = ACTION[a];
    const B = ACTION[b];
    if (!A || !B) throw new Error(`неизвестное действие: ${a} / ${b}`);

    // Симметричные случаи разбираем один раз, а несимметричные — в обе стороны.
    const pair = (side, other, actor, foe) => single(side, other, actor, foe);

    const first = pair(A, B, 0, 1);
    const second = pair(B, A, 1, 0);
    events.push(...first, ...second);

    // Два удара сразу — это не два независимых попадания, а размен: более
    // быстрый удар опережает и срывает медленный. Одинаковая скорость —
    // прилетает обоим, но ослабленно.
    if (A.kind === 'strike' && B.kind === 'strike') {
        events.length = 0;
        if (A.startup < B.startup) {
            events.push({ type: 'hit', from: 0, to: 1, action: a, scale: 1 });
        } else if (B.startup < A.startup) {
            events.push({ type: 'hit', from: 1, to: 0, action: b, scale: 1 });
        } else {
            events.push({ type: 'trade', from: 0, to: 1, action: a, scale: TRADE_SCALE });
            events.push({ type: 'trade', from: 1, to: 0, action: b, scale: TRADE_SCALE });
        }
    }

    return { events };
}

/** Что действие `A` бойца `actor` делает с бойцом `foe`, выбравшим `B`. */
function single(A, B, actor, foe) {
    if (A.kind === 'strike') {
        // Перехват угадал тип — бьющий улетает. Не угадал — контрхит.
        if (B.kind === 'catch') {
            return B.catches === A.id
                ? [{ type: 'launch', from: foe, to: actor, action: B.id, scale: 1 }]
                : [{ type: 'counter', from: actor, to: foe, action: A.id, scale: COUNTER_SCALE }];
        }
        if (B.kind === 'block') return [{ type: 'chipped', from: actor, to: foe, action: A.id, scale: 0 }];
        // Удар опережает бросок — это и есть первая грань треугольника.
        if (B.kind === 'grab') return [{ type: 'hit', from: actor, to: foe, action: A.id, scale: 1 }];
        return [];
    }

    if (A.kind === 'grab') {
        // Бросок берёт и блок, и перехват: защита заточена под удары.
        if (B.kind === 'block' || B.kind === 'catch') {
            return [{ type: 'thrown', from: actor, to: foe, action: A.id, scale: 1 }];
        }
        return []; // против удара бросок проигрывает, против броска — сцепка
    }

    return []; // блок и перехват сами по себе ничего не делают
}

/** Человеческое объяснение исхода — для лога боя и обучения. */
export const PHRASE = {
    hit: 'проходит',
    counter: 'ловит на встречном движении',
    trade: 'разменивается',
    launch: 'перехвачен и подброшен',
    thrown: 'брошен на землю',
    chipped: 'уходит в блок',
};
