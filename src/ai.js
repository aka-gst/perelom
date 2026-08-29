/**
 * Противник, который читает тебя в ответ.
 *
 * Треугольник без чтения — это подбрасывание монетки. Поэтому ИИ ведёт
 * короткую память о твоих привычках и наказывает ровно за то, что ты
 * повторяешь: спамишь рукой — начнёт ловить руку, прячешься в блок —
 * пойдёт в бросок, жадничаешь перехватом — тоже пойдёт в бросок.
 *
 * И отдельно важное: **ИИ видит твои переломы**. Если у тебя сломана рука,
 * он перестаёт держать перехват руки — тратить ход на защиту от удара,
 * которого ты физически не можешь нанести, глупо. Поэтому сломанная кость
 * не просто отнимает у тебя действие, а ещё и меняет его поведение, и это
 * видно в бою без единой подсказки.
 */

import { ACTION } from './rules.js';
import { optionsFor } from './fight.js';

const MEMORY = 8;

/** Базовая склонность. Персонаж — это, по сути, свой набор этих чисел. */
export const TEMPER = {
    base: { hand: 3, foot: 2.2, grab: 1.4, catchHand: 1, catchFoot: 1, block: 1.8 },
    /** Насколько резко реагирует на замеченную привычку. */
    punish: 4,
};

export function makeMind(temper = TEMPER) {
    return { temper, seen: [], lastOwn: null };
}

/** Запомнить ход игрока. Зовётся один раз за размен. */
export function remember(mind, actionId) {
    mind.seen.push(actionId);
    if (mind.seen.length > MEMORY) mind.seen.shift();
}

function share(mind, predicate) {
    if (!mind.seen.length) return 0;
    return mind.seen.filter(predicate).length / mind.seen.length;
}

/**
 * Выбор действия. `rng` — из боя, чтобы бой воспроизводился в тестах.
 */
export function chooseAction(mind, fight, side, rng) {
    const me = fight.fighters[side];
    const foe = fight.fighters[side === 0 ? 1 : 0];
    const options = optionsFor(me);
    const foeOptions = optionsFor(foe);
    const weights = {};
    for (const id of options) weights[id] = mind.temper.base[id] ?? 1;

    const punish = mind.temper.punish;
    const handShare = share(mind, (id) => id === 'hand');
    const footShare = share(mind, (id) => id === 'foot');
    const turtleShare = share(mind, (id) => id === 'block');
    const greedShare = share(mind, (id) => ACTION[id].kind === 'catch');

    // Ловим то, чем тебя уже видели.
    if (weights.catchHand) weights.catchHand *= 1 + handShare * punish;
    if (weights.catchFoot) weights.catchFoot *= 1 + footShare * punish;
    // Бросок — ответ и на черепаху, и на жадность: он берёт обе защиты.
    if (weights.grab) weights.grab *= 1 + (turtleShare + greedShare) * punish;

    // Против того, чего у тебя больше нет, держать защиту незачем.
    if (!foeOptions.includes('hand')) weights.catchHand = 0;
    if (!foeOptions.includes('foot')) weights.catchFoot = 0;
    // Если ты не можешь бросить, блок становится почти безнаказанным.
    if (!foeOptions.includes('grab') && weights.block) weights.block *= 2;

    // На последних процентах здоровья идёт вперёд: терять уже нечего.
    if (me.body.hp < 30) {
        for (const id of options) if (ACTION[id].kind === 'strike') weights[id] *= 1.8;
    }
    // Два одинаковых хода подряд читаются — сам себя за это придерживает.
    if (mind.lastOwn && weights[mind.lastOwn]) weights[mind.lastOwn] *= 0.45;

    const choice = weighted(weights, options, rng);
    mind.lastOwn = choice;
    return choice;
}

/**
 * Что ИИ делает в джагле: несколько раз подбивает рукой, чтобы удержать
 * тело в воздухе, и добивает ногой. Ровно тот выбор, что и у игрока.
 */
export function juggleChoice(mind, fight, side, rng) {
    const options = optionsFor(fight.fighters[side]).filter((id) => id === 'hand' || id === 'foot');
    if (!options.length) return null;
    if (fight.juggleHits >= 3 && options.includes('foot')) return 'foot';
    if (options.includes('hand') && rng() < 0.75) return 'hand';
    return options[0];
}

function weighted(weights, options, rng) {
    let total = 0;
    for (const id of options) total += Math.max(0, weights[id] ?? 0);
    if (total <= 0) return options[0] ?? 'block';
    let roll = rng() * total;
    for (const id of options) {
        roll -= Math.max(0, weights[id] ?? 0);
        if (roll <= 0) return id;
    }
    return options[options.length - 1];
}
