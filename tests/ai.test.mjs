import test from 'node:test';
import assert from 'node:assert/strict';

import { STATE, createFight, stepFrame } from '../src/fight.js';
import { controlFrame, makeMind } from '../src/ai.js';
import { makeRng } from '../src/rng.js';
import { BROKEN } from '../src/body.js';

const NEUTRAL = {
    left: false, right: false, up: false, down: false,
    hand: false, foot: false, grab: false, pull: false,
    dashLeft: false, dashRight: false,
};
const still = () => ({ ...NEUTRAL });

/** Прогнать бой, собирая всё, что нажал ИИ. */
function watch(fight, mind, frames, player = still) {
    const rng = makeRng(3);
    const seen = [];
    const ai = (state, side) => {
        const input = controlFrame(mind, state, side, rng);
        seen.push(input);
        return input;
    };
    for (let i = 0; i < frames; i += 1) stepFrame(fight, [player, ai]);
    return seen;
}

test('противник ходит через тот же вход, что и игрок', () => {
    // Это и есть гарантия честности: он физически не может ничего, чего не
    // может человек — ни ударить без разгона, ни увидеть замах раньше.
    const fight = createFight({ seed: 4 });
    const seen = watch(fight, makeMind(), 120);
    for (const input of seen) {
        assert.deepEqual(Object.keys(input).sort(), Object.keys(NEUTRAL).sort());
        for (const value of Object.values(input)) assert.equal(typeof value, 'boolean');
    }
});

test('издалека он идёт к игроку, а не стоит', () => {
    const fight = createFight({ seed: 4 });
    fight.fighters[0].x = fight.centerX - 260;
    fight.fighters[1].x = fight.centerX + 260;
    const before = Math.abs(fight.fighters[0].x - fight.fighters[1].x);
    watch(fight, makeMind(), 90);
    const after = Math.abs(fight.fighters[0].x - fight.fighters[1].x);
    assert.ok(after < before - 40, `дистанция почти не изменилась: ${before} → ${after}`);
});

test('он не реагирует мгновенно: у него есть задержка, как у человека', () => {
    // Без задержки перехват срабатывал бы на первом кадре замаха, и играть
    // было бы невозможно. Проверяем, что на первых кадрах удара он ещё
    // ничего про него не знает.
    const fight = createFight({ seed: 4 });
    fight.fighters[0].x = fight.centerX - 45;
    fight.fighters[1].x = fight.centerX + 45;
    const mind = makeMind();
    const rng = makeRng(3);
    let frame = 0;
    const player = () => ({ ...NEUTRAL, hand: frame++ === 0 });
    const early = [];
    for (let i = 0; i < 3; i += 1) {
        early.push(controlFrame(mind, fight, 1, rng));
        stepFrame(fight, [player, still]);
    }
    assert.ok(early.every((input) => !input.pull), 'перехват не может сработать раньше, чем удар увиден');
});

test('он видит переломы игрока и не держит защиту от того, чего нет', () => {
    const fight = createFight({ seed: 4 });
    fight.fighters[0].body.bones.arm.state = BROKEN;
    fight.fighters[1].body.bones.leg.state = BROKEN;
    const seen = watch(fight, makeMind(), 200);
    // Своей сломанной ногой он бить не может.
    assert.ok(seen.every((input) => !(input.foot && !input.pull)), 'бьёт сломанной ногой');
    assert.ok(seen.every((input) => !(input.foot && input.pull)), 'перехватывает сломанной ногой');
});

test('он доигрывает бой сам с собой и не зависает', () => {
    const fight = createFight({ seed: 8 });
    const rngA = makeRng(11);
    const rngB = makeRng(12);
    const mindA = makeMind();
    const mindB = makeMind();
    const a = (state) => controlFrame(mindA, state, 0, rngA);
    const b = (state) => controlFrame(mindB, state, 1, rngB);
    for (let i = 0; i < 60 * 240 && !fight.over; i += 1) stepFrame(fight, [a, b]);
    assert.ok(fight.over, 'двое ИИ не смогли добить друг друга за четыре минуты');
    assert.notEqual(fight.winner, null);
});
