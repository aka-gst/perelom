import test from 'node:test';
import assert from 'node:assert/strict';

import { STATE, TUNE, createFight, stepFrame } from '../src/fight.js';
import { sparkDrift, sparkRays } from '../src/render.js';

const NEUTRAL = {
    left: false, right: false, up: false, down: false,
    hand: false, foot: false, grab: false, pull: false,
    dashLeft: false, dashRight: false,
};
const input = (over = {}) => ({ ...NEUTRAL, ...over });
const still = () => input();
const once = (press, hold = {}) => {
    let done = false;
    return () => (done ? input(hold) : ((done = true), input({ ...hold, ...press })));
};

/**
 * Довести бой до кадра столкновения и снять признаки там.
 *
 * Мерить через десяток кадров нельзя: подсветка живёт шесть кадров и к
 * концу удара уже погасла. Первый заход теста так и провалился — числа
 * были верные, а сняты не в тот момент.
 */
function play(gap, mine, theirs = still, frames = 26) {
    const fight = createFight({ seed: 3 });
    fight.fighters[0].x = fight.centerX - gap / 2;
    fight.fighters[1].x = fight.centerX + gap / 2;
    let shot = null;
    for (let i = 0; i < frames; i += 1) {
        stepFrame(fight, [mine, theirs]);
        if (!shot && (fight.sparks.length || fight.freeze)) {
            shot = {
                искр: fight.sparks.length,
                вид: fight.sparks[0]?.kind ?? null,
                подсветка: fight.fighters[1].flash > 0,
                замирание: fight.freeze,
            };
        }
    }
    return shot ?? { искр: 0, вид: null, подсветка: false, замирание: 0 };
}

test('исход читается направлением искр, а не цветом и не цифрой', () => {
    // Приём подсказан соседним проектом: цвет разводит исходы плохо, если
    // палитра уже несёт смыслы, а направление читается боковым зрением
    // раньше, чем разобран оттенок. У попадания искры уходят СКВОЗЬ
    // противника, у звона — НАЗАД, в бьющего.
    const hit = sparkDrift('hit', 1);
    const counter = sparkDrift('counter', 1);
    const block = sparkDrift('block', -1);

    assert.ok(hit > 15, `попадание должно уносить искры вперёд, а не ${hit.toFixed(1)}`);
    assert.ok(counter > hit, 'встречный обязан быть заметнее обычного попадания');
    assert.ok(block < -15, `звон должен бросать искры назад, а не ${block.toFixed(1)}`);
    assert.ok(Math.sign(hit) !== Math.sign(block), 'исходы обязаны расходиться по знаку');

    // И зеркально: боец смотрит влево — всё разворачивается вместе с ним.
    assert.ok(sparkDrift('hit', -1) < -15);
    assert.ok(sparkDrift('block', 1) > 15);
});

test('три исхода различаются, даже если закрыть цифры урона', () => {
    // Проверка на две минуты из чужого опыта: закрой числа и спроси, видно
    // ли разницу. Если нет — игрок читает бой по цифре, а на телефоне не
    // читает вовсе. Поэтому исходы обязаны расходиться минимум по двум
    // независимым признакам, а не по одному.
    const h = play(100, once({ hand: true }));
    const b = play(100, once({ hand: true }), () => input({ right: true }));
    const m = play(200, once({ hand: true }));

    assert.equal(h.вид, 'hit');
    assert.equal(b.вид, 'block');
    assert.equal(m.искр, 0, 'промах не даёт искр вовсе — и это тоже сигнал');

    // Признак первый: подсветка тела. Прошло — светится, закрыли — нет.
    assert.equal(h.подсветка, true);
    assert.equal(b.подсветка, false);
    // Признак второй: замирание кадра. Промах не тормозит время вовсе.
    assert.ok(h.замирание > b.замирание, `${h.замирание} против ${b.замирание}`);
    assert.equal(m.замирание, 0);
});

test('промах читается только на контрасте с замиранием на попадании', () => {
    // Отсутствие отклика работает как отклик, лишь если попадание время
    // останавливает. Уберут хитстоп — промах станет неотличим от «игра не
    // заметила нажатие», и этот тест обязан покраснеть.
    assert.ok(TUNE.hitstop.hit >= 8, 'замирание короче восьми кадров не читается');
    assert.ok(TUNE.hitstop.counter > TUNE.hitstop.hit);
    assert.ok(TUNE.hitstop.chip < TUNE.hitstop.hit, 'звон обязан тормозить слабее попадания');
});

test('лучей у каждого вида хотя бы несколько, и они не сходятся в точку', () => {
    for (const kind of ['hit', 'counter', 'block']) {
        const rays = sparkRays(kind, 1);
        assert.ok(rays.length >= 5, `${kind}: лучей ${rays.length}`);
        const angles = new Set(rays.map((r) => r.angle.toFixed(3)));
        assert.equal(angles.size, rays.length, `${kind}: лучи наложились друг на друга`);
        for (const ray of rays) assert.ok(ray.reach > 0);
    }
});
