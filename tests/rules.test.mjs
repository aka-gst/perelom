import test from 'node:test';
import assert from 'node:assert/strict';

import { ACTION, ACTIONS, CATCHES, COUNTER_SCALE, STRIKES, lengthOf, outcomeOf } from '../src/rules.js';

test('треугольник: удар бьёт бросок, бросок бьёт защиту, защита бьёт удар', () => {
    // Три грани — весь смысл размена. Разорвётся одна, и у игрока появится
    // безнаказанный ответ.
    assert.equal(outcomeOf('hand', { mode: 'catch', catches: 'hand', open: true }), 'launch');
    assert.equal(outcomeOf('grab', { mode: 'catch', catches: 'hand', open: true }), 'throw');
    assert.equal(outcomeOf('grab', { mode: 'block' }), 'throw');
    // А удар бьёт бросок не правилом, а кадрами: бросок дольше разгоняется.
    assert.ok(ACTION.hand.startup < ACTION.grab.startup);
    assert.ok(ACTION.foot.startup < ACTION.grab.startup);
});

test('перехват не того типа и перехват впустую наказываются встречным', () => {
    assert.equal(outcomeOf('foot', { mode: 'catch', catches: 'hand', open: true }), 'counter');
    assert.equal(outcomeOf('hand', { mode: 'catch', catches: 'hand', open: false }), 'counter');
    assert.equal(COUNTER_SCALE > 1, true);
});

test('блок держит удары и не держит бросок', () => {
    assert.equal(outcomeOf('hand', { mode: 'block' }), 'chip');
    assert.equal(outcomeOf('foot', { mode: 'block' }), 'chip');
    assert.equal(outcomeOf('grab', { mode: 'block' }), 'throw');
});

test('летящего не схватить, но добить можно', () => {
    // Иначе бросок стал бы ещё и продолжением комбо, а он размен без него.
    assert.equal(outcomeOf('grab', { mode: 'air' }), 'miss');
    assert.equal(outcomeOf('hand', { mode: 'air' }), 'hit');
});

test('рука быстрее и слабее ноги, нога быстрее и слабее броска', () => {
    // Ради этого у действий и разные кадры: выбор должен быть не «что
    // сильнее», а «на что хватит времени».
    assert.ok(ACTION.hand.startup < ACTION.foot.startup);
    assert.ok(ACTION.hand.damage < ACTION.foot.damage);
    assert.ok(ACTION.foot.recovery > ACTION.hand.recovery, 'за длинный удар надо платить отходняком');
    assert.ok(ACTION.grab.recovery > ACTION.foot.recovery, 'промах броском обязан быть самым дорогим');
});

test('у каждого действия есть цвет замаха', () => {
    // Перехват ловится реакцией, значит тип удара обязан читаться глазом.
    // Действие без цвета — это действие, которое нечем прочитать.
    for (const id of ACTIONS) {
        assert.ok(ACTION[id].tell, `${id} без цвета замаха`);
        assert.ok(lengthOf(id) > 0);
    }
    assert.notEqual(ACTION.hand.tell, ACTION.foot.tell, 'рука и нога обязаны различаться цветом');
    assert.equal(STRIKES.length, 4, 'рука, нога, апперкот, подсечка');
    assert.equal(CATCHES.length, 2);
    // У новых приёмов цвета обязаны отличаться от старых: телеграф
    // различает тип удара цветом, и два одинаковых сливаются.
    const tones = new Set(ACTIONS.map((id) => ACTION[id].tell));
    assert.ok(tones.size >= 5, `цветов всего ${tones.size} на ${ACTIONS.length} действий`);
});

test('окно перехвата короче, чем разгон ноги, но длиннее разгона руки не бывает даром', () => {
    // Перехват должен быть успеваемым по ноге и рискованным по руке —
    // иначе либо он бесполезен, либо им можно закрыться от всего.
    assert.ok(ACTION.catchFoot.active < ACTION.foot.startup + ACTION.foot.active);
    assert.ok(ACTION.catchHand.recovery > ACTION.catchHand.active, 'промах перехватом обязан быть наказуем');
});
