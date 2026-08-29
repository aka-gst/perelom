import test from 'node:test';
import assert from 'node:assert/strict';

import { PHASE, TIMING, choose, createFight, juggleStrike, optionsFor, tick } from '../src/fight.js';
import { BROKEN } from '../src/body.js';

const STEP = 1 / 60;

/** Прокрутить бой на `seconds` игрового времени. */
function run(fight, seconds) {
    for (let t = 0; t < seconds; t += STEP) tick(fight, STEP);
}

/** Довести бой до следующего чтения — через размен, джагл и подъём. */
function toRead(fight, cap = 14) {
    for (let t = 0; t < cap; t += STEP) {
        tick(fight, STEP);
        if (fight.phase === PHASE.read) return true;
        if (fight.phase === PHASE.over) return false;
    }
    return false;
}

/** Разыграть один размен с заданными выборами сторон. */
function exchange(fight, mine, theirs) {
    choose(fight, 0, mine);
    choose(fight, 1, theirs);
    tick(fight, STEP);
}

test('перехват — это лаунчер: угаданный тип открывает джагл', () => {
    // Стык двух слоёв игры. Если перехват перестанет подбрасывать,
    // чтение и исполнение разъедутся на две несвязанные игры.
    const fight = createFight({ seed: 3 });
    exchange(fight, 'catchHand', 'hand');
    assert.equal(fight.phase, PHASE.juggle);
    assert.equal(fight.juggler, 0);
    assert.equal(fight.victim, 1);
    assert.equal(fight.fighters[1].sk.mode, 'ragdoll');
});

test('пока тело в воздухе, слой чтения выключен', () => {
    const fight = createFight({ seed: 3 });
    exchange(fight, 'catchHand', 'hand');
    assert.equal(choose(fight, 1, 'block'), false, 'летящий не должен успевать выбрать ответ');
    assert.equal(juggleStrike(fight, 1, 'hand'), false, 'бить может только тот, кто подбросил');
});

test('каждый следующий удар в джагле слабее предыдущего', () => {
    // Иначе комбо не кончается никогда и превращается в одну кнопку.
    const fight = createFight({ seed: 5 });
    exchange(fight, 'catchHand', 'hand');
    run(fight, TIMING.juggleCooldown + STEP);

    const deltas = [];
    for (let i = 0; i < 4; i += 1) {
        const before = fight.fighters[1].body.hp;
        assert.ok(juggleStrike(fight, 0, 'hand'), `удар ${i + 1} не прошёл`);
        deltas.push(before - fight.fighters[1].body.hp);
        run(fight, TIMING.juggleCooldown + STEP);
    }
    for (let i = 1; i < deltas.length; i += 1) {
        assert.ok(deltas[i] < deltas[i - 1], `удар ${i + 1} оказался не слабее предыдущего`);
    }
    assert.equal(fight.juggleHits, 4);
});

test('бросок бьёт больно, но джагла не даёт', () => {
    // Бросок — это размен без продолжения: он закрывает защиту,
    // а не открывает исполнение. Иначе перехват потеряет смысл.
    const fight = createFight({ seed: 9 });
    exchange(fight, 'grab', 'block');
    assert.equal(fight.phase, PHASE.down);
    assert.ok(fight.fighters[1].body.hp < 100);
    assert.equal(juggleStrike(fight, 0, 'hand'), false);
});

test('вечно блокировать нельзя: гард ломается и сам становится лаунчером', () => {
    const fight = createFight({ seed: 11 });
    let launched = false;
    for (let round = 0; round < 4 && !launched; round += 1) {
        exchange(fight, 'foot', 'block');
        if (fight.phase === PHASE.juggle) {
            launched = true;
            break;
        }
        assert.ok(toRead(fight), 'бой должен вернуться в чтение');
    }
    assert.ok(launched, 'серия ударов в блок обязана его проломить');
    assert.equal(fight.juggler, 0);
});

test('сломанной рукой нельзя ни ударить, ни перехватить', () => {
    const fight = createFight({ seed: 13 });
    fight.fighters[0].body.bones.arm.state = BROKEN;
    assert.deepEqual(optionsFor(fight.fighters[0]).sort(), ['block', 'catchFoot', 'foot', 'grab']);
    assert.equal(choose(fight, 0, 'hand'), false);
    assert.equal(choose(fight, 0, 'catchHand'), false);
    assert.equal(choose(fight, 0, 'foot'), true);
});

test('бой доигрывается до победителя и не зависает между фазами', () => {
    const fight = createFight({ seed: 21 });
    const mine = ['catchHand', 'foot', 'grab', 'hand', 'block'];
    let round = 0;
    for (let t = 0; t < 240 && fight.phase !== PHASE.over; t += STEP) {
        if (fight.phase === PHASE.read && !fight.fighters[0].choice) {
            choose(fight, 0, mine[round % mine.length]);
            choose(fight, 1, mine[(round + 2) % mine.length]);
            round += 1;
        }
        if (fight.phase === PHASE.juggle) juggleStrike(fight, fight.juggler, 'hand');
        tick(fight, STEP);
    }
    assert.equal(fight.phase, PHASE.over, 'бой не дошёл до конца за четыре минуты');
    assert.notEqual(fight.winner, null);
    assert.equal(fight.fighters[fight.winner === 0 ? 1 : 0].body.hp, 0);
});
