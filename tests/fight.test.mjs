import test from 'node:test';
import assert from 'node:assert/strict';

import { STATE, TUNE, createFight, optionsFor, other, stepFrame } from '../src/fight.js';
import { ACTION, lengthOf } from '../src/rules.js';
import { BROKEN } from '../src/body.js';

const NEUTRAL = {
    left: false, right: false, up: false, down: false,
    hand: false, foot: false, grab: false, pull: false,
    dashLeft: false, dashRight: false,
};

const input = (over = {}) => ({ ...NEUTRAL, ...over });
const still = () => input();

/** Нажать один раз на первом кадре, дальше держать `hold`. */
function once(press, hold = {}) {
    let done = false;
    return () => {
        if (done) return input(hold);
        done = true;
        return input({ ...hold, ...press });
    };
}

function drive(fight, frames, a = still, b = still) {
    for (let i = 0; i < frames; i += 1) stepFrame(fight, [a, b]);
}

/** Поставить бойцов на нужный зазор: дальность в игре берётся из поз. */
function place(fight, gap) {
    fight.fighters[0].x = fight.centerX - gap / 2;
    fight.fighters[1].x = fight.centerX + gap / 2;
    for (const f of fight.fighters) f.sk.facing = f.facing;
    drive(fight, 1);
}

test('удар проходит и снимает здоровье', () => {
    const fight = createFight({ seed: 3 });
    place(fight, 80);
    drive(fight, 20, once({ hand: true }));
    assert.ok(fight.fighters[1].body.hp < 100, 'рука в упор обязана попасть');
    assert.equal(fight.fighters[1].state, STATE.hurt);
});

test('дальность берётся из позы: нога достаёт там, где рука уже нет', () => {
    // Ради этого дальность нигде и не записана числом — она следствие
    // анимации, и потому картинка не может соврать про досягаемость.
    const near = createFight({ seed: 3 });
    place(near, 140);
    drive(near, 20, once({ hand: true }));
    assert.equal(near.fighters[1].body.hp, 100, 'рука на такой дистанции не достаёт');

    const far = createFight({ seed: 3 });
    place(far, 140);
    drive(far, 26, once({ foot: true }));
    assert.ok(far.fighters[1].body.hp < 100, 'нога на той же дистанции обязана достать');
});

test('шаг назад — это блок: удар проходит только чипом', () => {
    const fight = createFight({ seed: 3 });
    place(fight, 80);
    const guard = () => input({ right: true }); // от игрока прочь = блок
    drive(fight, 20, once({ hand: true }), guard);
    const foe = fight.fighters[1];
    assert.ok(foe.body.hp > 100 - ACTION.hand.damage, 'блок обязан почти всё удержать');
    assert.ok(foe.body.hp < 100, 'но чип проходит: вечно блокировать нельзя');
    assert.ok(foe.body.guard < 3, 'и гард копит слом');
});

test('перехват своего типа подбрасывает бьющего', () => {
    // Стык двух слоёв игры: выиграл чтение — получил право исполнять.
    const fight = createFight({ seed: 3 });
    place(fight, 80);
    drive(fight, 14, once({ hand: true }), once({ hand: true, pull: true }));
    assert.equal(fight.fighters[0].state, STATE.launched, 'перехваченный обязан улететь');
    assert.equal(fight.fighters[0].sk.mode, 'ragdoll');
});

test('перехват не того типа наказывается встречным', () => {
    const missed = createFight({ seed: 3 });
    place(missed, 140);
    drive(missed, 24, once({ foot: true }), once({ hand: true, pull: true }));

    const plain = createFight({ seed: 3 });
    place(plain, 140);
    drive(plain, 24, once({ foot: true }));

    assert.ok(missed.fighters[1].body.hp < plain.fighters[1].body.hp,
        'жадный перехват мимо обязан стоить дороже обычного пропуска');
});

test('пока тело в воздухе, оно не защищается, и комбо затухает', () => {
    const fight = createFight({ seed: 5 });
    place(fight, 80);
    drive(fight, 14, once({ hand: true }), once({ hand: true, pull: true }));
    assert.equal(fight.fighters[0].state, STATE.launched);

    // Играем так, как играет человек: идём за телом и жмём, когда свободны.
    const victim = fight.fighters[0];
    const damage = [];
    let last = victim.body.hp;
    const juggler = (state, side) => {
        const me = state.fighters[side];
        const free = me.state === STATE.idle || me.state === STATE.walk;
        return input({ left: true, hand: free });
    };
    for (let i = 0; i < 110; i += 1) {
        stepFrame(fight, [still, juggler]);
        if (victim.body.hp < last) {
            damage.push(last - victim.body.hp);
            last = victim.body.hp;
        }
    }
    assert.ok(victim.juggleHits >= 3, `набралось только ${victim.juggleHits} попаданий подряд`);
    assert.ok(damage.length >= 3);
    assert.ok(damage[damage.length - 1] < damage[0],
        `комбо не затухает: ${damage.map((d) => d.toFixed(1)).join(' → ')}`);
});

test('край арены калечит: нога выбивает тело в скалу', () => {
    // Ради этого и стоит гнать противника к краю, а не бить по центру:
    // нога заканчивает комбо, и заканчивает его о скалу.
    const fight = createFight({ seed: 9 });
    const player = fight.fighters[0];
    const foe = fight.fighters[1];
    player.x = fight.centerX + fight.wall - 120;
    foe.x = player.x - 80;
    drive(fight, 1);
    // Противник ловит удар игрока и подбрасывает его в сторону скалы.
    drive(fight, 14, once({ hand: true }), once({ hand: true, pull: true }));
    assert.equal(player.state, STATE.launched, 'игрока должно было подбросить');

    const before = player.body.hp;
    drive(fight, 30, still, once({ foot: true }));
    drive(fight, 120);
    assert.ok(player.body.hp < before - 8, 'вылет в скалу обязан стоить заметно дороже обычного падения');
    assert.ok(fight.log.some((line) => line.includes('о скалу')), `в логе нет удара о скалу: ${fight.log.join(' | ')}`);
});

test('сломанной рукой нельзя ни ударить, ни перехватить', () => {
    const fight = createFight({ seed: 13 });
    fight.fighters[0].body.bones.arm.state = BROKEN;
    assert.deepEqual(optionsFor(fight.fighters[0]).sort(), ['catchFoot', 'foot', 'grab']);
    place(fight, 80);
    drive(fight, 20, once({ hand: true }));
    assert.equal(fight.fighters[1].body.hp, 100, 'сломанная рука не должна бить вовсе');
});

test('бой доигрывается до победителя и не зависает', () => {
    const fight = createFight({ seed: 21 });
    let n = 0;
    const attacker = () => {
        n += 1;
        if (n % 34 === 0) return input({ foot: true });
        if (n % 34 === 12) return input({ hand: true });
        return input({ right: true });
    };
    for (let i = 0; i < 60 * 180 && !fight.over; i += 1) stepFrame(fight, [attacker, still]);
    assert.ok(fight.over, 'бой не кончился за три минуты');
    assert.notEqual(fight.winner, null);
});
