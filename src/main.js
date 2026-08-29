/**
 * Сборка: экраны, ввод, цикл, интерфейс.
 *
 * Ввод устроен по одной оси: **толчок или тяга**. Три кнопки × два жеста =
 * шесть действий, но помнить надо три кнопки. На телефоне тяга — это свайп
 * вниз по кнопке, на клавиатуре — Shift или стрелка вниз. Тем же жестом
 * бьёшь и защищаешься, и это не совпадение: толкаешь — бьёшь, тянешь —
 * принимаешь.
 */

import { actionFor } from './rules.js';
import { BONES, BONE_IDS, INTACT, TORN } from './body.js';
import { PHASE, createFight, choose, juggleStrike, optionsFor, tick } from './fight.js';
import { chooseAction, juggleChoice, makeMind, remember } from './ai.js';
import { draw } from './render.js';
import { loadArenaArt, loadFighterArt } from './sprites.js';

const $ = (id) => document.getElementById(id);

const screens = { menu: $('screen-menu'), learn: $('screen-learn'), fight: $('screen-fight') };
const canvas = $('arena');
const ctx = canvas.getContext('2d');

// Графика грузится один раз на сессию: боец и арена переживают перезапуск боя.
const ART = {
    zhila: loadFighterArt('zhila'),
    kostolom: loadFighterArt('kostolom'),
    arena: loadArenaArt('dusk'),
};

let fight = null;
let mind = null;
let lastPhase = null;
let aiPicked = false;
let running = false;
let last = 0;
let elapsed = 0;
/** Что игрок выбрал в текущем чтении — противник запомнит это после размена. */
let playerLast = null;

/* ─────────────────────────── экраны ─────────────────────────── */

function show(name) {
    for (const [id, node] of Object.entries(screens)) node.hidden = id !== name;
    running = name === 'fight';
    if (running) last = performance.now();
}

$('go-fight').addEventListener('click', () => startFight());
$('go-learn').addEventListener('click', () => show('learn'));
$('learn-back').addEventListener('click', () => show('menu'));

function startFight() {
    fight = createFight({ seed: (Math.random() * 1e9) | 0 });
    fight.fighters[0].art = ART.zhila;
    fight.fighters[1].art = ART.kostolom;
    fight.arenaArt = ART.arena;
    mind = makeMind();
    lastPhase = fight.phase;
    aiPicked = false;
    playerLast = null;
    $('verdict').hidden = true;
    show('fight');
}

/* ─────────────────────────── ввод ─────────────────────────── */

/** Одно действие игрока: кнопка + жест. Дальше решает фаза боя. */
function act(button, gesture) {
    if (!fight || fight.phase === PHASE.over) return;

    if (fight.phase === PHASE.juggle && fight.juggler === 0) {
        // В воздухе тяги нет: перехватывать нечего, только добивать.
        if (gesture === 'pull') return;
        if (juggleStrike(fight, 0, button === 'grab' ? 'foot' : button)) flash(button, 'push');
        return;
    }

    const actionId = actionFor(button, gesture);
    if (!actionId) return;
    if (!choose(fight, 0, actionId)) return;
    playerLast = actionId;
    flash(button, gesture);
}

function flash(button, gesture) {
    const node = document.querySelector(`.key[data-button="${button}"]`);
    if (!node) return;
    node.classList.remove('push', 'pull');
    void node.offsetWidth;
    node.classList.add(gesture);
    setTimeout(() => node.classList.remove(gesture), 260);
}

// Жест на кнопке: увёл палец вниз больше чем на 18 пикселей — это тяга.
const PULL_DISTANCE = 18;
for (const node of document.querySelectorAll('.key')) {
    let startY = null;
    node.addEventListener('pointerdown', (event) => {
        startY = event.clientY;
        node.setPointerCapture(event.pointerId);
    });
    node.addEventListener('pointerup', (event) => {
        if (startY === null || node.disabled) return;
        const gesture = event.clientY - startY > PULL_DISTANCE ? 'pull' : 'push';
        startY = null;
        act(node.dataset.button, gesture);
    });
    node.addEventListener('pointercancel', () => { startY = null; });
    node.addEventListener('contextmenu', (event) => event.preventDefault());
}

const KEY_TO_BUTTON = { j: 'hand', k: 'foot', l: 'grab', 1: 'hand', 2: 'foot', 3: 'grab' };
let pullHeld = false;

window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'ы') pullHeld = true;
    const button = KEY_TO_BUTTON[event.key.toLowerCase()];
    if (!button) return;
    event.preventDefault();
    act(button, pullHeld || event.shiftKey ? 'pull' : 'push');
});
window.addEventListener('keyup', (event) => {
    if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'ы') pullHeld = false;
});

/* ─────────────────────────── цикл ─────────────────────────── */

function frame(now) {
    requestAnimationFrame(frame);
    if (!running || !fight) return;

    // Ограничение шага: после вкладки в фоне физика иначе взрывается.
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;

    think();
    tick(fight, dt);
    watchPhase();
    paint();
    hud();
}

/** Ходы противника: и в чтении, и в джагле — по тем же правилам. */
function think() {
    if (fight.phase === PHASE.read) {
        // Отвечает не мгновенно: иначе на экране никогда не видно,
        // что он тоже думает.
        if (!aiPicked && fight.timer < 1.1) {
            choose(fight, 1, chooseAction(mind, fight, 1, fight.rng));
            aiPicked = true;
        }
        return;
    }
    if (fight.phase === PHASE.juggle && fight.juggler === 1) {
        const next = juggleChoice(mind, fight, 1, fight.rng);
        if (next) juggleStrike(fight, 1, next);
    }
}

function watchPhase() {
    if (fight.phase === lastPhase) return;
    if (lastPhase === PHASE.read) {
        // Привычки игрока запоминаются один раз за размен.
        remember(mind, playerLast ?? 'block');
        playerLast = null;
    }
    if (fight.phase === PHASE.read) aiPicked = false;
    if (fight.phase === PHASE.over) verdict();
    lastPhase = fight.phase;
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

const PHASE_NAME = {
    [PHASE.read]: 'ЧТЕНИЕ',
    [PHASE.resolve]: 'РАЗМЕН',
    [PHASE.juggle]: 'ДЖАГЛ',
    [PHASE.down]: 'ПАДЕНИЕ',
    [PHASE.getup]: 'ПОДЪЁМ',
    [PHASE.xray]: 'ПЕРЕЛОМ',
    [PHASE.over]: 'КОНЕЦ',
};

function hud() {
    for (const fighter of fight.fighters) {
        $(`hp-${fighter.side}`).style.width = `${Math.max(0, fighter.body.hp)}%`;
        guardPips(fighter);
        boneChips(fighter);
    }

    $('phase').textContent = PHASE_NAME[fight.phase] ?? '';
    const span = fight.phase === PHASE.read ? 1.5 : 1;
    $('clock').style.width = `${Math.max(0, Math.min(1, fight.timer / span)) * 100}%`;

    const combo = $('combo');
    const live = (fight.phase === PHASE.juggle || fight.phase === PHASE.down) && fight.juggleHits > 0;
    combo.hidden = !live;
    if (live) $('combo-n').textContent = String(fight.juggleHits);

    $('log').textContent = fight.log[fight.log.length - 1] ?? '';

    const options = optionsFor(fight.fighters[0]);
    const juggling = fight.phase === PHASE.juggle && fight.juggler === 0;
    for (const node of document.querySelectorAll('.key')) {
        const button = node.dataset.button;
        const push = actionFor(button, 'push');
        const pull = actionFor(button, 'pull');
        node.disabled = juggling
            ? !(button !== 'grab' && options.includes(push))
            : !(options.includes(push) || options.includes(pull));
    }
}

function guardPips(fighter) {
    const host = $(`guard-${fighter.side}`);
    if (host.childElementCount !== 3) {
        host.innerHTML = '<i></i><i></i><i></i>';
    }
    [...host.children].forEach((pip, i) => pip.classList.toggle('on', i < fighter.body.guard));
}

function boneChips(fighter) {
    const host = $(`bones-${fighter.side}`);
    const state = BONE_IDS.map((id) => fighter.body.bones[id].state).join(',');
    if (host.dataset.state === state) return;
    host.dataset.state = state;
    host.innerHTML = '';
    for (const id of BONE_IDS) {
        const bone = fighter.body.bones[id];
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

show('menu');
requestAnimationFrame(frame);
