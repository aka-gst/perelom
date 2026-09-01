/**
 * Сборка: экраны, ввод, цикл, интерфейс.
 *
 * Управление обычное для файтинга и потому не требует объяснений: идёшь
 * стрелками, шаг назад — это блок, вверх — прыжок, двойное нажатие —
 * рывок. Три кнопки удара, и те же три с зажатым Shift — перехват.
 *
 * Отдельной кнопки блока нет намеренно: блок обязан стоить позиции, иначе
 * его нечем наказывать, кроме броска, и нейтралка вырождается.
 */

import { ACTION, FPS } from './rules.js';
import { BONES, BONE_IDS, INTACT, TORN } from './body.js';
import { STATE, createFight, optionsFor, stepFrame, tick } from './fight.js';
import { controller, makeMind } from './ai.js';
import { draw } from './render.js';
import { loadArenaArt, loadFighterArt } from './sprites.js';
import { createAudio, level, play } from './audio.js';
import { makeRng } from './rng.js';
import { бойНачат, бойКончен, обучениеОткрыто } from './schet.js';

const $ = (id) => document.getElementById(id);

const screens = { menu: $('screen-menu'), learn: $('screen-learn'), fight: $('screen-fight') };
const canvas = $('arena');
const ctx = canvas.getContext('2d');

const ART = {
    zhila: loadFighterArt('zhila'),
    kostolom: loadFighterArt('kostolom'),
    arena: loadArenaArt('dusk'),
};

/**
 * Звук. Под `?тихо` контекст не создаётся вовсе, поэтому игра, открытая
 * сессией для проверки, физически не может зашуметь в колонки.
 */
const audio = createAudio();

let fight = null;
let mind = null;
let running = false;
let last = 0;
let elapsed = 0;

/* ─────────────────────────── ввод ─────────────────────────── */

const held = new Set();
/** Нажатия копятся здесь и тратятся ровно один игровой кадр. */
const pressed = { hand: false, foot: false, grab: false, up: false, dashLeft: false, dashRight: false };
const lastTap = { left: -1e9, right: -1e9 };
const DOUBLE_TAP = 260;

const KEYS = {
    ArrowLeft: 'left', a: 'left', ф: 'left',
    ArrowRight: 'right', d: 'right', в: 'right',
    ArrowUp: 'up', w: 'up', ц: 'up', ' ': 'up',
    ArrowDown: 'down', s: 'down', ы: 'down',
    j: 'hand', о: 'hand', 1: 'hand',
    k: 'foot', л: 'foot', 2: 'foot',
    l: 'grab', д: 'grab', 3: 'grab',
};

window.addEventListener('keydown', (event) => {
    const name = KEYS[event.key] ?? KEYS[event.key.toLowerCase()];
    if (!name) return;
    event.preventDefault();
    if (event.repeat) return;
    held.add(name);
    audio.wake?.(); // контекст рождается на первом жесте, раньше браузер не даст
    if (name === 'hand' || name === 'foot' || name === 'grab' || name === 'up') pressed[name] = true;
    if (name === 'left' || name === 'right') {
        const now = performance.now();
        if (now - lastTap[name] < DOUBLE_TAP) pressed[name === 'left' ? 'dashLeft' : 'dashRight'] = true;
        lastTap[name] = now;
    }
});
window.addEventListener('keyup', (event) => {
    const name = KEYS[event.key] ?? KEYS[event.key.toLowerCase()];
    if (name) held.delete(name);
});
window.addEventListener('blur', () => held.clear());

/** Ввод игрока на один кадр игры. Нажатия тратятся, удержания остаются. */
function playerInput() {
    const input = {
        left: held.has('left'),
        right: held.has('right'),
        up: pressed.up,
        down: held.has('down'),
        pull: keyboardPull(),
        hand: pressed.hand,
        foot: pressed.foot,
        grab: pressed.grab,
        dashLeft: pressed.dashLeft,
        dashRight: pressed.dashRight,
    };
    pressed.hand = false;
    pressed.foot = false;
    pressed.grab = false;
    pressed.up = false;
    pressed.dashLeft = false;
    pressed.dashRight = false;
    return input;
}

let shiftHeld = false;
window.addEventListener('keydown', (e) => { if (e.key === 'Shift') shiftHeld = true; });
window.addEventListener('keyup', (e) => { if (e.key === 'Shift') shiftHeld = false; });
/*
 * Третий жест — перехват. Читается с Shift, с экранной кнопки и из щупа.
 *
 * Щупа тут не было, и это дыра: `hold('pull')` клал имя в общий набор
 * зажатых, а сюда заглядывали только две первые дороги. То есть автомат
 * не мог выразить перехват вовсе — главную механику игры нечем было
 * проверить прогоном, и попытка снять кадр с перехватом дала ноль из
 * тысячи, похожий на «механика сломана».
 */
const keyboardPull = () => shiftHeld || padPull || held.has('pull');

// Кнопки на экране: тап — удар, потянул вниз — перехват. Ходьбы на них
// пока нет: телефон делаем после того, как игра станет интересной.
let padPull = false;
const PULL_DISTANCE = 18;
for (const node of document.querySelectorAll('.key')) {
    let startY = null;
    node.addEventListener('pointerdown', (event) => {
        audio.wake?.();
        startY = event.clientY;
        node.setPointerCapture?.(event.pointerId);
    });
    node.addEventListener('pointerup', (event) => {
        if (startY === null || node.disabled) return;
        padPull = event.clientY - startY > PULL_DISTANCE;
        pressed[node.dataset.button] = true;
        startY = null;
        setTimeout(() => { padPull = false; }, 60);
    });
    node.addEventListener('pointercancel', () => { startY = null; });
    node.addEventListener('contextmenu', (event) => event.preventDefault());
}

/* ─────────────────────────── экраны ─────────────────────────── */

function show(name) {
    for (const [id, node] of Object.entries(screens)) node.hidden = id !== name;
    running = name === 'fight';
    if (running) last = performance.now();
}

/**
 * Выход из боя.
 *
 * Кнопки не было вовсе — из начатого боя нельзя было выйти до чьей-нибудь
 * победы. Это хуже, чем выход без предупреждения: игрок заперт.
 *
 * Спрашиваем, только если бой идёт: после победы терять нечего. И проверять
 * надо обе половины — «нет» обязан удерживать, «да» обязан выпускать;
 * правка, которая спрашивает и не выпускает, хуже болезни.
 */
$('quit').addEventListener('click', () => askQuit());
window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && running) askQuit();
});

export function askQuit() {
    if (!fight || fight.over) {
        show('menu');
        return false;
    }
    const node = $('confirm');
    if (!node.hidden) return true;
    node.innerHTML = '';
    const h = document.createElement('h3');
    h.textContent = 'ВЫЙТИ?';
    const p = document.createElement('p');
    p.textContent = 'Бой не доигран — он не сохраняется, и вернуться в него будет нельзя.';
    const stay = document.createElement('button');
    stay.className = 'mbtn mbtn--primary';
    stay.textContent = 'ОСТАТЬСЯ';
    stay.addEventListener('click', () => { node.hidden = true; });
    const leave = document.createElement('button');
    leave.className = 'mbtn';
    leave.textContent = 'ВЫЙТИ В МЕНЮ';
    leave.addEventListener('click', () => { node.hidden = true; show('menu'); });
    node.append(h, p, stay, leave);
    node.hidden = false;
    return true;
}

$('go-fight').addEventListener('click', () => startFight());
$('go-learn').addEventListener('click', () => { обучениеОткрыто(); show('learn'); });
$('learn-back').addEventListener('click', () => show('menu'));

function startFight(seed) {
    /*
     * Зерно можно задать — и для замеров это обязательно.
     *
     * Без него два прогона идут по разным зёрнам, противник ведёт себя
     * иначе, и разошедшиеся числа читаются как «замер зависит от времени».
     * Я на этом и споткнулся, проверяя устойчивость к частоте кадров.
     */
    /*
     * Новый бой начинается с пустых рук.
     *
     * Зажатое не сбрасывалось, и остаток прошлой партии утекал в новую:
     * два прогона с одним зерном расходились, и это легко принять за
     * случайность в игре. Человека это задевает тоже — вышел из боя с
     * зажатым Shift, вернулся, и первый удар вышел перехватом.
     */
    held.clear();
    for (const имя of Object.keys(pressed)) pressed[имя] = false;

    fight = createFight({ seed: Number.isFinite(seed) ? seed : (Math.random() * 1e9) | 0 });
    fight.fighters[0].art = ART.zhila;
    fight.fighters[1].art = ART.kostolom;
    fight.arenaArt = ART.arena;
    mind = makeMind();
    $('verdict').hidden = true;
    $('confirm').hidden = true;
    show('fight');
    бойНачат();
}

/* ─────────────────────────── цикл ─────────────────────────── */

let aiControl = null;

function frame(now) {
    requestAnimationFrame(frame);
    if (!running || !fight) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;

    if (!aiControl) aiControl = controller(mind, makeRng(7));
    tick(fight, dt, [playerInput, aiControl]);
    speak();
    paint();
    hud();
    итог();
}

/*
 * Заметить конец боя.
 *
 * Стояло внутри отрисовочного цикла — и потому случалось только если кадр
 * рисуется. Свернул человек вкладку на последнем ударе, браузер заморозил
 * `requestAnimationFrame` — и событие «поражение» не уходит вовсе, а
 * вердикт ждёт возвращения. Здесь же оно недостижимо для щупа: тот шагает
 * бой напрямую, то есть проверяет не тот путь, которым идёт человек.
 */
function итог() {
    if (!fight || !fight.over || !$('verdict').hidden) return;
    бойКончен(fight);
    verdict();
}

/** Вычерпать поводы для звука и сыграть. Молчит, если звук выключен. */
function speak() {
    for (const sound of fight.sounds.splice(0)) play(audio, sound.name, sound.strength);
}

function paint() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(960 * dpr)) {
        canvas.width = Math.round(960 * dpr);
        canvas.height = Math.round(540 * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, fight, 960, 540, elapsed);
}

/* ─────────────────────────── интерфейс ─────────────────────────── */

function hud() {
    for (const f of fight.fighters) {
        $(`hp-${f.side}`).style.width = `${Math.max(0, f.body.hp)}%`;
        guardPips(f);
        boneChips(f);
    }

    const juggled = fight.fighters.find((f) => f.state === STATE.launched || (f.state === STATE.down && f.juggleHits));
    const combo = $('combo');
    const live = Boolean(juggled && juggled.juggleHits > 0);
    combo.hidden = !live;
    if (live) $('combo-n').textContent = String(juggled.juggleHits);

    $('log').textContent = fight.log[fight.log.length - 1] ?? '';

    const options = optionsFor(fight.fighters[0]);
    for (const node of document.querySelectorAll('.key')) {
        node.disabled = !options.includes(node.dataset.button);
    }
}

function guardPips(f) {
    const host = $(`guard-${f.side}`);
    if (host.childElementCount !== 3) host.innerHTML = '<i></i><i></i><i></i>';
    [...host.children].forEach((pip, i) => pip.classList.toggle('on', i < f.body.guard));
}

function boneChips(f) {
    const host = $(`bones-${f.side}`);
    const state = BONE_IDS.map((id) => f.body.bones[id].state).join(',');
    if (host.dataset.state === state) return;
    host.dataset.state = state;
    host.innerHTML = '';
    for (const id of BONE_IDS) {
        const bone = f.body.bones[id];
        if (bone.state === INTACT) continue;
        const chip = document.createElement('span');
        chip.textContent = BONES[id].name;
        chip.className = bone.state === TORN ? 'torn' : 'broken';
        host.append(chip);
    }
}

function verdict() {
    const node = $('verdict');
    const won = fight.winner === 0;
    const foe = fight.fighters[1];
    const broken = BONE_IDS.filter((id) => foe.body.bones[id].state !== INTACT).length;
    node.innerHTML = '';
    const h = document.createElement('h3');
    h.textContent = won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
    const p = document.createElement('p');
    p.textContent = `Лучшее комбо: ${fight.bestJuggle} попаданий · сломано ему костей: ${broken}`;
    const again = document.createElement('button');
    again.className = 'mbtn mbtn--primary';
    again.textContent = 'ЕЩЁ РАЗ';
    again.addEventListener('click', startFight);
    const back = document.createElement('button');
    back.className = 'mbtn';
    back.textContent = 'В МЕНЮ';
    back.addEventListener('click', () => show('menu'));
    node.append(h, p, again, back);
    node.hidden = false;
}

/**
 * Отладочный доступ.
 *
 * Игра идёт на requestAnimationFrame, а он замирает в скрытой панели
 * предпросмотра — проверено замером: ноль кадров за 600 мс. Значит ни снять
 * кадр, ни проверить правку в балансе через обычный цикл нельзя. `advance`
 * прогоняет столько игровых кадров, сколько попросили, и рисует результат.
 *
 * **Ввод идёт общим путём** — через тот же `playerInput`, что и клавиатура.
 * Хук, который строит намерение по-своему, проверяет не игру, а сам себя.
 */
globalThis.PERELOM = {
    get fight() { return fight; },
    get audio() { return audio; },
    /** Уровень сигнала: под `?тихо` обязан быть ровно ноль. */
    level: () => level(audio),
    /** `start(42)` — воспроизводимый бой. Без зерна каждый раз новый. */
    start: startFight,
    quit: askQuit,
    confirming: () => !$('confirm').hidden,
    show,
    /** Нажать кнопку так, как её нажал бы игрок: попадёт в очередь нажатий. */
    press(name) {
        if (name in pressed) pressed[name] = true;
    },
    /** Зажать или отпустить направление. */
    hold(name, on = true) {
        if (on) held.add(name);
        else held.delete(name);
    },
    advance(seconds = 1) {
        if (!fight) return null;
        if (!aiControl) aiControl = controller(mind, makeRng(7));
        const steps = Math.max(1, Math.round(seconds * FPS));
        for (let i = 0; i < steps; i += 1) stepFrame(fight, [playerInput, aiControl]);
        итог();
        speak();
        paint();
        hud();
        return this.state();
    },
    /** Короткая сводка боя — по ней и проверяют, что произошло. */
    state() {
        if (!fight) return null;
        const line = (f) => ({
            state: f.state,
            action: f.action,
            hp: Math.round(f.body.hp),
            x: Math.round(f.x),
            guard: f.body.guard,
            broken: BONE_IDS.filter((id) => f.body.bones[id].state !== INTACT),
        });
        return {
            frame: fight.frame,
            gap: Math.round(Math.abs(fight.fighters[0].x - fight.fighters[1].x)),
            banner: fight.banner?.text ?? null,
            you: line(fight.fighters[0]),
            foe: line(fight.fighters[1]),
            log: fight.log.slice(-3),
        };
    },
};

show('menu');
requestAnimationFrame(frame);
