import test from 'node:test';
import assert from 'node:assert/strict';

import { PACK, isQuiet } from '../src/audio.js';
import { createFight, stepFrame } from '../src/fight.js';

const NEUTRAL = {
    left: false, right: false, up: false, down: false,
    hand: false, foot: false, grab: false, pull: false,
    dashLeft: false, dashRight: false,
};
const still = () => ({ ...NEUTRAL });
const once = (press) => {
    let done = false;
    return () => (done ? { ...NEUTRAL } : ((done = true), { ...NEUTRAL, ...press }));
};

test('немой запуск ловит оба написания и не ловит чужие параметры', () => {
    const at = (search, hash = '') => isQuiet({ search, hash });
    assert.equal(at('?тихо'), true);
    assert.equal(at('?quiet=1'), true);
    // Транслитерация — третья форма из общего соглашения. Её отсутствие и
    // было моей поломкой: рецепт я написал свой, вместо того чтобы взять
    // канонический из навыка.
    assert.equal(at('?tiho'), true);
    assert.equal(at('', '#tiho'), true);
    assert.equal(at('', '#тихо'), true);
    assert.equal(at('?a=1&quiet'), true);
    // Ради этих двух в выражении и стоят границы.
    assert.equal(at('?l=ABC'), false);
    assert.equal(at('?quietly'), false);
    assert.equal(at('?tihonko'), false);
    assert.equal(at(''), false);
});

test('кириллица в адресе приходит закодированной, и её надо раскодировать', () => {
    // Набранное человеком `?тихо` браузер отдаёт как `?%D1%82%D0%B8%D1%85%D0%BE`.
    // Без раскодирования русское написание не работало бы вовсе — а набирают
    // именно его. Проверено на живом адресе, не рассуждением.
    assert.equal(isQuiet({ search: '?%D1%82%D0%B8%D1%85%D0%BE', hash: '' }), true);
    assert.equal(isQuiet({ search: '', hash: '#%D1%82%D0%B8%D1%85%D0%BE' }), true);
    // Обрывок кодировки не должен считаться просьбой о тишине.
    assert.equal(isQuiet({ search: '?%D1%82%D0%B8', hash: '' }), false);
    // Битую последовательность нельзя ронять — судим по сырой строке.
    assert.equal(isQuiet({ search: '?%E0%A4%A', hash: '' }), false);
});

test('варианты заданы файлами, а не диапазоном номеров', () => {
    // У punch-heavy нет второго варианта: файлы -1 и -3. Выбор циклом от
    // одного до трёх промахивался бы на каждом третьем ударе ногой, и
    // промах был бы тихим — звука просто нет.
    assert.deepEqual(PACK.heavy, ['punch-heavy-1.wav', 'punch-heavy-3.wav']);
    for (const [cue, list] of Object.entries(PACK)) {
        assert.ok(list.length >= 2, `${cue}: один вариант — повторы будут слышны как эхо`);
        assert.equal(new Set(list).size, list.length, `${cue}: повтор в списке`);
    }
});

test('обычное попадание тоже звучит, а не только бросок и перелом', () => {
    // Отрицательный контроль показал дыру: вырезал повод для звука у
    // обычного удара — все проверки остались зелёными. То есть звук боя мог
    // уехать отключённым целиком, и набор бы промолчал.
    const рука = createFight({ seed: 1 });
    рука.fighters[0].x = рука.centerX - 50;
    рука.fighters[1].x = рука.centerX + 50;
    for (let i = 0; i < 14; i += 1) stepFrame(рука, [once({ hand: true }), still]);
    assert.ok(рука.sounds.some((s) => s.name === 'hand'),
        `рука обязана звучать: ${рука.sounds.map((s) => s.name).join(',') || 'тишина'}`);

    const нога = createFight({ seed: 1 });
    нога.fighters[0].x = нога.centerX - 70;
    нога.fighters[1].x = нога.centerX + 70;
    for (let i = 0; i < 22; i += 1) stepFrame(нога, [once({ foot: true }), still]);
    assert.ok(нога.sounds.some((s) => s.name === 'heavy'),
        `нога обязана звучать тяжело: ${нога.sounds.map((s) => s.name).join(',') || 'тишина'}`);
});

test('бой записывает поводы для звука, а не играет их сам', () => {
    // Модуль боя обязан оставаться чистым: он считает, а не шумит. Иначе
    // его нельзя прогнать в тестах и нельзя выключить звук целиком.
    const fight = createFight({ seed: 1 });
    fight.fighters[0].x = fight.centerX - 40;
    fight.fighters[1].x = fight.centerX + 40;
    fight.fighters[1].body.bones.spine.stress = 1700;
    const grab = once({ grab: true });
    for (let i = 0; i < 130; i += 1) stepFrame(fight, [grab, still]);

    const names = fight.sounds.map((s) => s.name);
    assert.ok(names.includes('heavy'), `бросок обязан звучать: ${names.join(',')}`);
    assert.ok(names.includes('crack'), `перелом обязан хрустеть: ${names.join(',')}`);
    for (const sound of fight.sounds) assert.ok(PACK[sound.name], `нет набора для ${sound.name}`);
});
