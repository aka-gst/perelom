/**
 * Кадровые данные и треугольник размена.
 *
 * Раньше игра была пошаговой: оба выбирали действие вслепую, и правила
 * решали, кто кого. Это оказалось настолкой, а не файтингом — нет ни
 * дистанции, ни тайминга, ни реакции. Теперь всё то же самое живёт в
 * реальном времени, и треугольник никуда не делся, просто стал таймингом:
 *
 *   удар бьёт бросок     — бросок долго разгоняется, его прерывают
 *   бросок бьёт защиту   — блок и перехват от броска не спасают
 *   защита бьёт удар     — но перехват надо успеть, и угадать тип
 *
 * Разница с прежней версией одна и она решает всё: **перехват теперь
 * ловится реакцией, а не ставкой**. Поэтому у каждого удара есть разгон,
 * а у разгона — цвет: не увидев тип удара, перехватить нельзя.
 *
 * Кадры считаются при 60 в секунду.
 */

export const FPS = 60;

export const ACTION = {
    hand: {
        id: 'hand',
        kind: 'strike',
        name: 'РУКА',
        button: 'hand',
        /** Кадры до того, как удар станет опасным. Их и читает противник. */
        startup: 7,
        /** Сколько кадров удар опасен. */
        active: 3,
        /** Отходняк. За него и наказывают промах. */
        recovery: 11,
        damage: 6,
        impulse: 260,
        /**
         * Радиус зоны удара вокруг кулака. Он заметно больше самого кулака,
         * и так во всех файтингах: зона всегда щедрее рисунка, иначе бой
         * превращается в попытки попасть, а не в игру на дистанции.
         * Сама дальность при этом берётся из позы, а не отсюда.
         */
        reach: 34,
        joint: 'handF',
        tell: '#ffd166',
    },
    foot: {
        id: 'foot',
        kind: 'strike',
        name: 'НОГА',
        button: 'foot',
        startup: 13,
        active: 4,
        recovery: 21,
        damage: 11,
        impulse: 520,
        reach: 36,
        joint: 'footF',
        tell: '#ff6b35',
    },
    grab: {
        id: 'grab',
        kind: 'grab',
        name: 'БРОСОК',
        button: 'grab',
        // Разгон обязан быть длиннее, чем у любого удара: иначе грань
        // «удар бьёт бросок» не работает, и бросок становится ответом на всё.
        startup: 16,
        active: 3,
        recovery: 28,
        damage: 14,
        impulse: 700,
        reach: 34,
        joint: 'handF',
        tell: '#c77dff',
    },
    catchHand: {
        id: 'catchHand',
        kind: 'catch',
        name: 'ПЕРЕХВАТ РУКИ',
        button: 'hand',
        catches: 'hand',
        startup: 3,
        /** Окно перехвата. Тринадцать кадров — примерно пятая секунды. */
        active: 13,
        recovery: 22,
        tell: '#22d3ee',
    },
    catchFoot: {
        id: 'catchFoot',
        kind: 'catch',
        name: 'ПЕРЕХВАТ НОГИ',
        button: 'foot',
        catches: 'foot',
        startup: 3,
        active: 13,
        recovery: 22,
        tell: '#22d3ee',
    },
};

export const ACTIONS = Object.keys(ACTION);
export const STRIKES = ACTIONS.filter((id) => ACTION[id].kind === 'strike');
export const CATCHES = ACTIONS.filter((id) => ACTION[id].kind === 'catch');

/** Полная длина действия в кадрах. */
export const lengthOf = (id) => ACTION[id].startup + ACTION[id].active + ACTION[id].recovery;

/** Множитель за встречный удар: перехватил не тот тип — получай вдвое. */
export const COUNTER_SCALE = 1.6;

/** Чип-урон сквозь блок: блокировать вечно нельзя, но и не смертельно. */
export const CHIP_SCALE = 0.18;

/**
 * Треугольник в одной функции: чем кончится удар `actionId` против защиты
 * `defense`. Это единственное место, где живут правила размена, и его
 * можно проверить тестом, не поднимая всю игру.
 *
 * `defense` — { mode: 'none' | 'block' | 'catch' | 'air', catches, open }
 *   mode  — что делает защищающийся прямо сейчас
 *   catches — какой тип ловит его перехват
 *   open  — попал ли удар в активное окно перехвата
 *
 * Возвращает: 'hit' | 'counter' | 'launch' | 'chip' | 'throw' | 'miss'
 */
export function outcomeOf(actionId, defense) {
    const spec = ACTION[actionId];
    if (!spec) throw new Error(`неизвестное действие: ${actionId}`);

    if (spec.kind === 'grab') {
        // Бросок берёт всё, кроме воздуха: летящего не схватить.
        return defense.mode === 'air' ? 'miss' : 'throw';
    }

    if (spec.kind !== 'strike') return 'miss';

    if (defense.mode === 'catch') {
        if (!defense.open) return 'counter'; // окно уже закрылось — открыт
        return defense.catches === spec.id ? 'launch' : 'counter';
    }
    if (defense.mode === 'block') return 'chip';
    return 'hit';
}

/** Короткое слово для боевого лога. */
export const PHRASE = {
    hit: 'проходит',
    counter: 'встречный',
    launch: 'перехвачен',
    throw: 'брошен',
    chip: 'в блок',
    miss: 'мимо',
};
