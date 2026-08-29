/**
 * Противник в реальном времени.
 *
 * Он отдаёт ровно тот же объект ввода, что и клавиатура игрока, и поэтому
 * физически не может ничего, чего не может человек: ни ударить без разгона,
 * ни перехватить вне окна, ни увидеть замах раньше, чем тот начался.
 *
 * Больше того, он смотрит на противника **через задержку** — примерно
 * одну шестую секунды, как человек. Без этого перехват у него срабатывал бы
 * на первом же кадре замаха, и играть было бы невозможно.
 *
 * Память о привычках осталась с пошаговой версии, потому что она работала:
 * спамишь рукой — начнёт ловить руку. И он по-прежнему видит переломы: если
 * у тебя сломана рука, держать перехват руки незачем.
 */

import { ACTION } from './rules.js';
import { STATE, TUNE, optionsFor, other } from './fight.js';

/** Задержка реакции в кадрах. Шире — противник тупее, уже — невыносимее. */
const REACTION = 11;
const MEMORY = 10;

export const TEMPER = {
    /** Дистанция, на которой ему хочется стоять. */
    spacing: 96,
    /** Насколько охотно лезет вперёд. */
    aggression: 0.55,
    /** Как резко наказывает замеченную привычку. */
    punish: 3.2,
};

export function makeMind(temper = TEMPER) {
    return { temper, seen: [], tape: [], cool: 0, lastFoeAction: null };
}

const idle = () => ({
    left: false, right: false, up: false, down: false,
    hand: false, foot: false, grab: false, pull: false,
    dashLeft: false, dashRight: false,
});

function share(mind, id) {
    if (!mind.seen.length) return 0;
    return mind.seen.filter((x) => x === id).length / mind.seen.length;
}

/** Контроллер для `tick`: (fight, side) → ввод этого кадра. */
export function controller(mind, rng) {
    return (fight, side) => controlFrame(mind, fight, side, rng);
}

export function controlFrame(mind, fight, side, rng) {
    const me = fight.fighters[side];
    const foe = fight.fighters[other(side)];
    const input = idle();

    // Лента наблюдений: смотрим на противника с задержкой, как человек.
    mind.tape.push({
        state: foe.state,
        action: foe.action,
        frame: foe.frame,
        x: foe.x,
        y: foe.y,
    });
    if (mind.tape.length > REACTION + 2) mind.tape.shift();
    const seen = mind.tape[0] ?? mind.tape[mind.tape.length - 1];

    // Привычки запоминаем в момент начала удара, а не по ленте.
    if (foe.state === STATE.attack && foe.frame === 1 && foe.action !== mind.lastFoeAction) {
        mind.seen.push(foe.action);
        if (mind.seen.length > MEMORY) mind.seen.shift();
    }
    mind.lastFoeAction = foe.state === STATE.attack ? foe.action : null;

    if (mind.cool > 0) mind.cool -= 1;
    if (me.state !== STATE.idle && me.state !== STATE.walk && me.state !== STATE.jump) return input;

    const gap = Math.abs(foe.x - me.x);
    const toward = foe.x > me.x ? 'right' : 'left';
    const away = toward === 'right' ? 'left' : 'right';
    const options = optionsFor(me);

    // Джагл: противник в воздухе — держим рукой, добиваем ногой.
    if (foe.state === STATE.launched) {
        if (gap > 92) { input[toward] = true; return input; }
        if (mind.cool > 0) return input;
        mind.cool = 8;
        if (foe.juggleHits >= 3 && options.includes('foot')) input.foot = true;
        else if (options.includes('hand')) input.hand = true;
        return input;
    }

    // Ответ на замах. Видим его с задержкой, поэтому на быструю руку
    // успеваем не всегда — и это правильно.
    const incoming = seen.state === STATE.attack && seen.action && ACTION[seen.action].kind === 'strike';
    if (incoming && gap < 120) {
        const spec = ACTION[seen.action];
        const guess = readHabit(mind, options);
        // Перехват — жадный ответ, и ИИ жадничает ровно настолько, насколько
        // уверен в привычке игрока. Ошибётся — получит встречный, как и все.
        if (guess && guess.confidence > 0.42 && rng() < guess.confidence * 0.6 && mind.cool === 0) {
            mind.cool = 26;
            input.pull = true;
            input[guess.action === 'catchHand' ? 'hand' : 'foot'] = true;
            return input;
        }
        input[away] = true; // иначе просто в блок
        return input;
    }

    // Наказание за промах: противник в отходняке — влезаем.
    const whiffing = seen.state === STATE.attack && seen.action
        && seen.frame > ACTION[seen.action].startup + ACTION[seen.action].active;
    if (whiffing && gap < 108 && mind.cool === 0 && options.includes('foot')) {
        mind.cool = 20;
        input.foot = true;
        return input;
    }

    // Нейтралка: держим дистанцию и время от времени лезем.
    const want = mind.temper.spacing;
    if (gap > want + 26) {
        input[toward] = true;
        if (gap > 190 && rng() < 0.03) input[toward === 'right' ? 'dashRight' : 'dashLeft'] = true;
        return input;
    }
    if (gap < want - 34) {
        // Вплотную бросок берёт и блок, и перехват — этим и пользуемся.
        if (mind.cool === 0 && options.includes('grab') && rng() < 0.5) {
            mind.cool = 34;
            input.grab = true;
            return input;
        }
        input[away] = true;
        return input;
    }

    if (mind.cool === 0 && rng() < mind.temper.aggression * 0.08) {
        mind.cool = 22;
        const reach = gap < 74 ? 'hand' : 'foot';
        if (options.includes(reach)) input[reach] = true;
        else if (options.includes('hand')) input.hand = true;
        return input;
    }
    if (rng() < 0.02) input[rng() < 0.5 ? toward : away] = true;
    return input;
}

/** На какой тип удара стоит ставить перехват и насколько уверенно. */
function readHabit(mind, options) {
    const hand = share(mind, 'hand');
    const foot = share(mind, 'foot');
    const lead = hand >= foot ? 'catchHand' : 'catchFoot';
    if (!options.includes(lead)) return null;
    const confidence = Math.min(0.9, Math.max(hand, foot) * (mind.temper.punish / 3));
    return { action: lead, confidence };
}
