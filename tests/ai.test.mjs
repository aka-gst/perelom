import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseAction, makeMind, remember } from '../src/ai.js';
import { createFight } from '../src/fight.js';
import { makeRng } from '../src/rng.js';
import { BROKEN } from '../src/body.js';

/** Сколько раз из ста ИИ выберет каждое действие. */
function poll(mind, fight, times = 600) {
    const rng = makeRng(101);
    const counts = {};
    for (let i = 0; i < times; i += 1) {
        mind.lastOwn = null; // без этого считаем ещё и запрет на повтор
        const id = chooseAction(mind, fight, 1, rng);
        counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
}

test('спам одним ударом ИИ наказывает перехватом именно этого удара', () => {
    // Без этого треугольник вырождается: нашёл выгодную кнопку — жми её.
    const fight = createFight({ seed: 2 });
    const naive = poll(makeMind(), fight);
    const punishing = makeMind();
    for (let i = 0; i < 8; i += 1) remember(punishing, 'hand');
    const wise = poll(punishing, fight);

    assert.ok(wise.catchHand > naive.catchHand * 2, 'перехват руки должен вырасти кратно');
    assert.ok(wise.catchHand > wise.catchFoot, 'ловить он должен именно руку');
});

test('черепаху и жадность ИИ вскрывает броском', () => {
    const fight = createFight({ seed: 2 });
    const naive = poll(makeMind(), fight);

    const vsBlock = makeMind();
    for (let i = 0; i < 8; i += 1) remember(vsBlock, 'block');
    assert.ok(poll(vsBlock, fight).grab > naive.grab * 2, 'против блока нужен бросок');

    const vsGreed = makeMind();
    for (let i = 0; i < 8; i += 1) remember(vsGreed, 'catchFoot');
    assert.ok(poll(vsGreed, fight).grab > naive.grab * 2, 'против перехвата тоже нужен бросок');
});

test('ИИ видит переломы игрока и перестаёт защищаться от того, чего нет', () => {
    // Это и делает перелом ходом, а не украшением: сломал ему руку —
    // он перестал держать руку, и это видно по его поведению без подсказок.
    const fight = createFight({ seed: 2 });
    const mind = makeMind();
    for (let i = 0; i < 8; i += 1) remember(mind, 'hand');
    assert.ok(poll(mind, fight).catchHand > 0, 'пока рука цела — ловит руку');

    fight.fighters[0].body.bones.arm.state = BROKEN;
    const after = poll(mind, fight);
    assert.equal(after.catchHand ?? 0, 0, 'против несуществующего удара защита не нужна');
});

test('ИИ не выбирает действие сломанной собственной конечностью', () => {
    const fight = createFight({ seed: 2 });
    fight.fighters[1].body.bones.leg.state = BROKEN;
    const counts = poll(makeMind(), fight);
    assert.equal(counts.foot ?? 0, 0);
    assert.equal(counts.catchFoot ?? 0, 0);
    assert.ok((counts.hand ?? 0) > 0);
});
