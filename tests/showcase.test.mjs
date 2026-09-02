import test from 'node:test';
import assert from 'node:assert/strict';

import { витриннаяСцена, ударнаяСцена, снимокСцены } from '../src/showcase.js';

test('витринный удар воспроизводимо останавливается на попадании', () => {
    const first = ударнаяСцена();
    const second = ударнаяСцена();

    assert.deepEqual(снимокСцены(first), снимокСцены(second), 'витринный кадр не должен зависеть от времени или ИИ');
    assert.equal(first.fighters[0].action, 'foot', 'на карточке должен быть читаемый удар ногой');
    assert.ok(first.fighters[1].body.hp < 100, 'кадр обязан быть после настоящего попадания');
    assert.ok(first.freeze > 0, 'сцена должна останавливаться внутри хитстопа, пока видны вспышка и вытянутая поза');
    assert.ok(first.sparks.length > 0, 'попадание без вспышки на карточке не читается');
});

test('витринная пара остаётся в центре арены и целиком помещается в кадр', () => {
    const fight = ударнаяСцена();
    const [left, right] = fight.fighters;

    assert.ok(left.x < fight.centerX && right.x > fight.centerX, 'бойцы обязаны стоять по разные стороны центра');
    assert.ok(Math.abs(left.x - fight.centerX) < 100 && Math.abs(right.x - fight.centerX) < 100,
        'сцена для карточки не должна уводить кого-то к краю арены');
});

test('адрес сцены принимает русское имя и не подменяет опечатку другой сценой', () => {
    assert.ok(витриннаяСцена('удар'));
    assert.ok(витриннаяСцена('hit'));
    assert.equal(витриннаяСцена('бросок'), null);
});
