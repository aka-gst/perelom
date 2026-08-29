import test from 'node:test';
import assert from 'node:assert/strict';

import { ACTION, ACTIONS, COUNTER_SCALE, actionFor, resolve } from '../src/rules.js';

const typesOf = (a, b) => resolve(a, b).events.map((e) => `${e.type}:${e.from}→${e.to}`);

test('треугольник замкнут: удар бьёт бросок, бросок бьёт защиту, защита бьёт удар', () => {
    // Три грани — это весь смысл слоя чтения. Если хоть одна разорвётся,
    // у игрока появится безнаказанный ответ, и мысленная игра исчезнет.
    assert.deepEqual(typesOf('hand', 'grab'), ['hit:0→1'], 'удар должен опережать бросок');
    assert.deepEqual(typesOf('grab', 'block'), ['thrown:0→1'], 'бросок должен брать блок');
    assert.deepEqual(typesOf('grab', 'catchHand'), ['thrown:0→1'], 'бросок должен брать перехват');
    assert.deepEqual(typesOf('hand', 'catchHand'), ['launch:1→0'], 'перехват должен ловить свой удар');
});

test('перехват не того типа наказывается контрхитом, а не просто провалом', () => {
    // Без этого перехват был бы бесплатной ставкой: угадал — джагл,
    // не угадал — обычный размен. Цена ошибки и делает его жадным ходом.
    const events = resolve('foot', 'catchHand').events;
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'counter');
    assert.equal(events[0].scale, COUNTER_SCALE);
});

test('рука опережает ногу, одинаковые удары идут в размен', () => {
    // Разница между рукой и ногой должна быть не только в цифрах урона,
    // иначе нога — это просто «рука побольше», и выбирать нечего.
    assert.deepEqual(typesOf('hand', 'foot'), ['hit:0→1']);
    assert.deepEqual(typesOf('foot', 'hand'), ['hit:1→0']);
    assert.equal(resolve('hand', 'hand').events.length, 2, 'равные по скорости бьют оба');
    assert.ok(ACTION.hand.startup < ACTION.foot.startup);
});

test('пассивные ответы друг против друга не делают ничего', () => {
    for (const a of ['block', 'catchHand', 'catchFoot']) {
        for (const b of ['block', 'catchHand', 'catchFoot']) {
            assert.deepEqual(resolve(a, b).events, [], `${a} против ${b} что-то натворили`);
        }
    }
    assert.deepEqual(resolve('grab', 'grab').events, [], 'два броска — сцепка, а не двойной урон');
});

test('любая пара действий разрешается, и никто не бьёт сам себя', () => {
    for (const a of ACTIONS) {
        for (const b of ACTIONS) {
            for (const event of resolve(a, b).events) {
                assert.notEqual(event.from, event.to, `${a}/${b}: ${event.type} сам по себе`);
                assert.ok(event.from === 0 || event.from === 1);
            }
        }
    }
});

test('три кнопки и два жеста дают ровно шесть действий', () => {
    // Ввод — это одна ось «толчок или тяга». Если появится седьмое
    // действие, ось сломается и придётся заводить лишнюю кнопку.
    const pairs = new Set();
    for (const id of ACTIONS) pairs.add(`${ACTION[id].button}:${ACTION[id].gesture}`);
    assert.equal(pairs.size, ACTIONS.length);
    assert.equal(ACTIONS.length, 6);
    assert.equal(actionFor('hand', 'pull'), 'catchHand');
    assert.equal(actionFor('grab', 'pull'), 'block');
});
