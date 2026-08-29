import test from 'node:test';
import assert from 'node:assert/strict';

import { ACTION, ACTIONS, COUNTER_SCALE } from '../src/rules.js';
import { BONES, BROKEN, INTACT, TORN, applyImpulse, availableActions, frailtyOf, makeBody } from '../src/body.js';

test('один обычный удар не ломает кость, а серия — ломает', () => {
    // Если бы ломал первый же удар, переломы шли бы каждый размен и
    // перестали быть событием. Если бы не ломала и серия — джагл был бы
    // просто уроном, а он должен калечить.
    const body = makeBody();
    const one = applyImpulse(body, 'skull', ACTION.hand.impulse, ACTION.hand.damage);
    assert.equal(one.broke, false);
    assert.equal(body.bones.skull.state, INTACT);

    let broke = false;
    for (let i = 0; i < 6 && !broke; i += 1) {
        broke = applyImpulse(body, 'skull', ACTION.hand.impulse, ACTION.hand.damage).broke;
    }
    assert.ok(broke, 'серия ударов по одной кости обязана её доломать');
});

test('контрхит ногой ломает рёбра сразу — цена жадного перехвата', () => {
    const body = makeBody();
    const result = applyImpulse(body, 'ribs', ACTION.foot.impulse * COUNTER_SCALE, ACTION.foot.damage);
    assert.ok(result.broke, 'встречная нога должна ломать рёбра с одного раза');
    assert.equal(body.bones.ribs.state, BROKEN);
});

test('перелом вычёркивает действие из треугольника', () => {
    // Ради этой строчки всё и затевалось: кровища здесь — это ход
    // в мысленной игре, а не украшение.
    const body = makeBody();
    body.bones.arm.state = BROKEN;
    const left = availableActions(body, ACTIONS);
    assert.ok(!left.includes('hand'), 'сломанной рукой бить нельзя');
    assert.ok(!left.includes('catchHand'), 'сломанной рукой нельзя и перехватывать');
    assert.ok(left.includes('foot') && left.includes('grab'), 'остальное должно остаться');
    // Блок из списка действий ушёл намеренно: теперь это шаг назад, и
    // отнять его переломом нельзя — пока боец стоит, он может отступать.
});

test('сломанные рёбра делают хрупче всё тело, а не только рёбра', () => {
    const healthy = makeBody();
    const hurt = makeBody();
    hurt.bones.ribs.state = BROKEN;
    assert.equal(frailtyOf(healthy), 1);
    assert.equal(frailtyOf(hurt), BONES.ribs.frailty);

    applyImpulse(healthy, 'leg', 10, 10);
    applyImpulse(hurt, 'leg', 10, 10);
    assert.ok(hurt.hp < healthy.hp, 'по сломанному телу должно проходить больше');
});

test('сломанное ломается вдвое легче, руку можно оторвать, череп — нет', () => {
    const body = makeBody();
    body.bones.arm.state = BROKEN;
    const second = applyImpulse(body, 'arm', BONES.arm.strength * 0.5, 5);
    assert.ok(second.tore, 'вторая по счёту рука должна отрываться');
    assert.equal(body.bones.arm.state, TORN);

    const skull = makeBody();
    skull.bones.skull.state = BROKEN;
    const lethal = applyImpulse(skull, 'skull', BONES.skull.strength, 5);
    assert.equal(lethal.tore, false, 'череп не отрывается');
    assert.equal(lethal.lethal, true, 'второй перелом черепа боец не переживает');
    assert.equal(skull.hp, 0);
});
