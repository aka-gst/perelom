/**
 * Бой: два слоя времени в одном автомате состояний.
 *
 *   ЧТЕНИЕ  — медленно и дискретно. Оба выбирают действие вслепую,
 *             треугольник решает, что пройдёт.
 *   ДЖАГЛ   — быстро и непрерывно. Тело в воздухе, читать нечего:
 *             летящий не перехватывает. Работает только исполнение.
 *
 * Переход между слоями всегда один и тот же — **перехват есть лаунчер**.
 * Выиграл чтение — получил право исполнять. Из этого растёт и всё
 * остальное: переломы копятся импульсом, а импульс копится в джагле.
 *
 * Ни DOM, ни канваса: рисование живёт в render.js, ввод — в main.js.
 */

import { ACTION, ACTIONS, resolve } from './rules.js';
import { BONES, BONE_FOR_TARGET, applyImpulse, availableActions, makeBody, TORN } from './body.js';
import { boneCenter, boneNear, centerOf, createSkeleton, applyPose, goRagdoll, heightOf, step } from './physics.js';
import { ANIM, POSES, contactPoint, sampleAnim } from './poses.js';
import { makeRng } from './rng.js';

export const PHASE = {
    read: 'read',
    resolve: 'resolve',
    juggle: 'juggle',
    down: 'down',
    getup: 'getup',
    xray: 'xray',
    over: 'over',
};

export const TIMING = {
    read: 1.5,
    resolve: 0.62,
    down: 1.4,
    getup: 0.8,
    xray: 1.6,
    juggleCooldown: 0.19,
};

/** Каждый следующий удар в джагле слабее — иначе комбо не кончается никогда. */
export const JUGGLE_DECAY = 0.84;

/** Импульсы подброса и слэма: они и открывают физический слой. */
const LAUNCH = { vx: 190, vy: -780, spin: 2.4, impulse: 320 };
const SLAM = { vx: 340, vy: 260, spin: 5.5, impulse: 380 };

const START_GAP = 150;

export function createFight({ seed = 1, groundY = 430, centerX = 480 } = {}) {
    const rng = makeRng(seed);
    const fighters = [
        makeFighter(0, 'ТЫ', centerX - START_GAP / 2, 1, groundY, centerX),
        makeFighter(1, 'ПРОТИВНИК', centerX + START_GAP / 2, -1, groundY, centerX),
    ];
    return {
        rng,
        groundY,
        centerX,
        fighters,
        phase: PHASE.read,
        timer: TIMING.read,
        /** Кто сейчас набивает джагл и по кому. */
        juggler: null,
        victim: null,
        juggleHits: 0,
        juggleDamage: 0,
        juggleCooldown: 0,
        bestJuggle: 0,
        xray: null,
        resumePhase: null,
        prevHeight: 0,
        log: [],
        shake: 0,
        winner: null,
    };
}

function makeFighter(side, name, x, facing, groundY, centerX) {
    const sk = createSkeleton(POSES.idle, x, groundY, facing, centerX);
    return {
        side, name, x, facing, groundY, sk,
        body: makeBody(),
        choice: null,
        action: 'idle',
        animT: 1,
        animLen: 1,
        outcome: null,
        blood: [],
    };
}

export const other = (side) => (side === 0 ? 1 : 0);

/** Что боец физически ещё может выбрать: перелом вычёркивает действие. */
export function optionsFor(fighter) {
    return availableActions(fighter.body, ACTIONS);
}

/** Выбор в слое чтения. Возвращает false, если действие недоступно. */
export function choose(fight, side, actionId) {
    if (fight.phase !== PHASE.read) return false;
    const fighter = fight.fighters[side];
    if (!optionsFor(fighter).includes(actionId)) return false;
    fighter.choice = actionId;
    return true;
}

/** Удар в слое исполнения: пока тело в воздухе, читать нечего. */
export function juggleStrike(fight, side, actionId) {
    if (fight.phase !== PHASE.juggle || fight.juggler !== side) return false;
    if (fight.juggleCooldown > 0) return false;
    const attacker = fight.fighters[side];
    const victim = fight.fighters[fight.victim];
    if (actionId !== 'hand' && actionId !== 'foot') return false;
    if (!optionsFor(attacker).includes(actionId)) return false;

    const spec = ACTION[actionId];
    const decay = JUGGLE_DECAY ** fight.juggleHits;
    const hitPoint = centerOf(victim.sk);

    // Тянемся к телу, а не ждём, пока оно само прилетит: иначе джагл
    // превращается в лотерею «достал/не достал», а он про исполнение.
    attacker.x = clampX(fight, hitPoint.x - 92 * attacker.facing);

    playAnim(attacker, actionId);
    fight.juggleCooldown = TIMING.juggleCooldown;
    fight.juggleHits += 1;

    const boneId = boneNear(victim.sk, hitPoint.x, hitPoint.y) ?? 'ribs';
    const impulse = spec.impulse * decay;
    const result = applyImpulse(victim.body, boneId, impulse, spec.damage * decay);
    fight.juggleDamage += result.damage;

    // Рука подбивает вверх и держит тело в воздухе, нога выбивает вбок.
    // Это и есть выбор внутри джагла: клевать ради длины или добить ради урона.
    const up = actionId === 'hand' ? -520 : -260;
    const away = actionId === 'hand' ? 90 : 620;
    goRagdoll(victim.sk, away * attacker.facing * decay, up * decay, 3 * decay);

    hitFeedback(fight, victim, hitPoint, impulse);
    note(fight, `${attacker.name}: ${spec.name} в воздухе — ${fight.juggleHits} попаданий подряд`);
    if (result.broke) startXray(fight, victim, boneId, result);
    checkDeath(fight, victim);
    return true;
}

/** Главный шаг. `dt` в секундах. */
export function tick(fight, dt) {
    fight.shake = Math.max(0, fight.shake - dt * 26);
    fight.juggleCooldown = Math.max(0, fight.juggleCooldown - dt);
    for (const fighter of fight.fighters) {
        fighter.animT = Math.min(1, fighter.animT + dt / fighter.animLen);
        decayBlood(fighter, dt);
    }

    switch (fight.phase) {
        case PHASE.read: return tickRead(fight, dt);
        case PHASE.resolve: return tickTimed(fight, dt, () => enterRead(fight));
        case PHASE.juggle: return tickJuggle(fight, dt);
        case PHASE.down: return tickDown(fight, dt);
        case PHASE.getup: return tickTimed(fight, dt, () => enterRead(fight));
        case PHASE.xray: return tickTimed(fight, dt, () => endXray(fight));
        default: return;
    }
}

function tickTimed(fight, dt, done) {
    fight.timer -= dt;
    poseAll(fight);
    if (fight.timer <= 0) done();
}

function tickRead(fight, dt) {
    fight.timer -= dt;
    poseAll(fight);
    const [a, b] = fight.fighters;
    // Ход делается вслепую и одновременно: ждать, пока ответит второй,
    // значит подарить ему информацию.
    if (fight.timer <= 0 || (a.choice && b.choice)) {
        if (!a.choice) a.choice = 'block';
        if (!b.choice) b.choice = 'block';
        exchange(fight);
    }
}

function tickJuggle(fight, dt) {
    const victim = fight.fighters[fight.victim];
    const before = heightOf(victim.sk);
    step(victim.sk, dt);
    const after = heightOf(victim.sk);
    poseOne(fight.fighters[fight.juggler]);

    if (after < 22 && before >= 22) {
        landing(fight, victim, (before - after) / Math.max(dt, 0.0001));
        return;
    }
    // Страховка от бесконечного полёта: тело всегда возвращается на землю.
    fight.timer -= dt;
    if (fight.timer <= 0) landing(fight, victim, 0);
}

function tickDown(fight, dt) {
    const victim = fight.fighters[fight.victim ?? 1];
    const rest = step(victim.sk, dt);
    poseOne(fight.fighters[other(victim.side)]);
    fight.timer -= dt;
    if (rest || fight.timer <= 0) {
        fight.bestJuggle = Math.max(fight.bestJuggle, fight.juggleHits);
        if (fight.juggleHits > 0) {
            note(fight, `Комбо: ${fight.juggleHits} попаданий, ${Math.round(fight.juggleDamage)} урона`);
        }
        fight.phase = PHASE.getup;
        fight.timer = TIMING.getup;
        victim.sk.mode = 'posed';
        victim.x = clampX(fight, victim.side === 0 ? fight.centerX - START_GAP / 2 : fight.centerX + START_GAP / 2);
        playAnim(victim, 'getup', TIMING.getup);
        checkDeath(fight, victim);
    }
}

/* ─────────────────────────── обмен ─────────────────────────── */

function exchange(fight) {
    const [a, b] = fight.fighters;
    const { events } = resolve(a.choice, b.choice);
    fight.phase = PHASE.resolve;
    fight.timer = TIMING.resolve;
    playAnim(a, a.choice);
    playAnim(b, b.choice);
    note(fight, `${ACTION[a.choice].name} против ${ACTION[b.choice].name}`);

    // Гард ломается отдельно от треугольника: блокировать вечно нельзя,
    // иначе безопасный ответ становится единственным.
    for (const event of events) {
        if (event.type !== 'chipped') continue;
        const guard = fight.fighters[event.to];
        guard.body.guard -= ACTION[event.action].guard;
        if (guard.body.guard <= 0) {
            guard.body.guard = 3;
            note(fight, `${guard.name}: гард сломан`);
            launchInto(fight, fight.fighters[event.from], guard, 1);
            a.choice = null;
            b.choice = null;
            return;
        }
    }
    for (const fighter of fight.fighters) {
        if (fighter.choice !== 'block') fighter.body.guard = Math.min(3, fighter.body.guard + 1);
    }

    for (const event of events) applyEvent(fight, event);
    a.choice = null;
    b.choice = null;
}

function applyEvent(fight, event) {
    const from = fight.fighters[event.from];
    const to = fight.fighters[event.to];
    const spec = ACTION[event.action];

    if (event.type === 'launch') {
        note(fight, `${from.name} перехватывает — ${to.name} в воздухе`);
        launchInto(fight, from, to, 1);
        return;
    }

    if (event.type === 'thrown') {
        const boneId = 'spine';
        const result = applyImpulse(to.body, boneId, spec.impulse * event.scale, spec.damage * event.scale);
        note(fight, `${from.name} бросает ${to.name} на землю`);
        to.sk.facing = -from.facing;
        goRagdoll(to.sk, SLAM.vx * from.facing, SLAM.vy, SLAM.spin * from.facing);
        fight.victim = to.side;
        fight.juggler = from.side;
        fight.juggleHits = 0;
        fight.juggleDamage = result.damage;
        fight.phase = PHASE.down;
        fight.timer = TIMING.down;
        fight.shake = 14;
        splash(to, centerOf(to.sk), 22);
        if (result.broke) startXray(fight, to, boneId, result);
        checkDeath(fight, to);
        return;
    }

    if (event.type === 'chipped') return;

    // hit / counter / trade — обычное попадание: физику не включаем,
    // иначе каждый размен станет вялым и потеряет вес.
    const boneId = BONE_FOR_TARGET[spec.target] ?? 'ribs';
    const impulse = spec.impulse * event.scale;
    const result = applyImpulse(to.body, boneId, impulse, spec.damage * event.scale);
    playAnim(to, 'hurt');
    to.x = clampX(fight, to.x + 26 * from.facing);
    fight.shake = event.type === 'counter' ? 12 : 6;
    if (event.type === 'counter') note(fight, `${from.name} ловит на встречном — ${BONES[boneId].name} принимает вдвое`);
    splash(to, contactAt(fight, from, to, spec), event.type === 'counter' ? 16 : 8);
    if (result.broke) startXray(fight, to, boneId, result);
    checkDeath(fight, to);
}

function launchInto(fight, from, to, scale) {
    to.sk.mode = 'ragdoll';
    applyPose(to.sk, POSES.hurt, to.x, to.groundY);
    goRagdoll(to.sk, LAUNCH.vx * from.facing * scale, LAUNCH.vy * scale, LAUNCH.spin * from.facing);
    fight.phase = PHASE.juggle;
    fight.timer = 4;
    fight.juggler = from.side;
    fight.victim = to.side;
    fight.juggleHits = 0;
    fight.juggleDamage = 0;
    fight.juggleCooldown = 0.12;
    fight.shake = 10;
    applyImpulse(to.body, 'ribs', LAUNCH.impulse * scale, 4);
}

function landing(fight, victim, fallSpeed) {
    fight.phase = PHASE.down;
    fight.timer = TIMING.down;
    if (fallSpeed > 420) {
        // Земля — тоже удар, и он приходит по той кости, которая коснулась
        // первой. Поэтому добить ногой в конце джагла бывает выгоднее.
        const lowest = lowestPoint(victim.sk);
        const boneId = boneNear(victim.sk, lowest.x, lowest.y) ?? 'spine';
        const impulse = Math.min(700, fallSpeed * 0.55);
        const result = applyImpulse(victim.body, boneId, impulse, impulse / 26);
        fight.juggleDamage += result.damage;
        fight.shake = 12;
        splash(victim, lowest, 16);
        note(fight, `Земля принимает ${BONES[boneId].name.toLowerCase()}`);
        if (result.broke) startXray(fight, victim, boneId, result);
        checkDeath(fight, victim);
    }
}

/* ─────────────────────────── перелом ─────────────────────────── */

function startXray(fight, victim, boneId, result) {
    if (fight.phase === PHASE.over) return;
    fight.resumePhase = { phase: fight.phase, timer: fight.timer };
    fight.phase = PHASE.xray;
    fight.timer = TIMING.xray;
    fight.shake = 20;
    fight.xray = {
        side: victim.side,
        bone: boneId,
        tore: result.tore,
        lethal: result.lethal,
        at: boneCenter(victim.sk, boneId),
    };
    const verb = result.tore ? 'ОТОРВАНА' : 'СЛОМАН';
    note(fight, `${BONES[boneId].name}: ${verb}. ${lostLine(boneId)}`);
    splash(victim, centerOf(victim.sk), result.tore ? 46 : 26);
}

function lostLine(boneId) {
    const lost = BONES[boneId].disables;
    if (!lost.length) return 'Тело держит хуже';
    return `Из треугольника вычеркнуто: ${lost.map((id) => ACTION[id].name).join(', ')}`;
}

function endXray(fight) {
    const back = fight.resumePhase ?? { phase: PHASE.read, timer: TIMING.read };
    fight.xray = null;
    fight.resumePhase = null;
    if (fight.winner !== null) {
        fight.phase = PHASE.over;
        return;
    }
    fight.phase = back.phase;
    fight.timer = Math.max(back.timer, 0.3);
}

/* ─────────────────────────── мелочи ─────────────────────────── */

function enterRead(fight) {
    if (fight.winner !== null) {
        fight.phase = PHASE.over;
        return;
    }
    for (const fighter of fight.fighters) {
        fighter.choice = null;
        fighter.sk.mode = 'posed';
        playAnim(fighter, 'idle', 1);
    }
    const [a, b] = fight.fighters;
    a.x = fight.centerX - START_GAP / 2;
    b.x = fight.centerX + START_GAP / 2;
    fight.phase = PHASE.read;
    fight.timer = TIMING.read;
    fight.juggler = null;
    fight.victim = null;
}

function playAnim(fighter, actionId, length) {
    fighter.action = actionId;
    fighter.animT = 0;
    fighter.animLen = length ?? (ANIM[actionId] ? TIMING.resolve : 0.4);
}

function poseAll(fight) {
    for (const fighter of fight.fighters) poseOne(fighter);
}

function poseOne(fighter) {
    if (fighter.sk.mode !== 'posed') return;
    const pose = fighter.action === 'idle' ? POSES.idle : sampleAnim(fighter.action, fighter.animT);
    applyPose(fighter.sk, pose, fighter.x, fighter.groundY);
}

function contactAt(fight, from, to, spec) {
    const point = from.sk.points[contactPoint(spec.id)];
    return point ? { x: point.x, y: point.y } : centerOf(to.sk);
}

function lowestPoint(sk) {
    let best = null;
    for (const id of Object.keys(sk.points)) {
        const p = sk.points[id];
        if (!best || p.y > best.y) best = p;
    }
    return best;
}

function hitFeedback(fight, victim, at, impulse) {
    fight.shake = Math.min(18, 5 + impulse / 60);
    splash(victim, at, 6 + impulse / 40);
}

function splash(fighter, at, count) {
    for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 60 + Math.random() * 280;
        fighter.blood.push({
            x: at.x, y: at.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 120,
            life: 0.7 + Math.random() * 0.9,
            r: 1.5 + Math.random() * 3.5,
            stuck: false,
        });
    }
    if (fighter.blood.length > 460) fighter.blood.splice(0, fighter.blood.length - 460);
}

function decayBlood(fighter, dt) {
    for (const drop of fighter.blood) {
        if (drop.stuck) {
            drop.life -= dt * 0.06;
            continue;
        }
        drop.vy += 1800 * dt;
        drop.x += drop.vx * dt;
        drop.y += drop.vy * dt;
        drop.life -= dt;
        if (drop.y >= fighter.groundY) {
            drop.y = fighter.groundY;
            drop.stuck = true;
            drop.life = 8;
        }
    }
    fighter.blood = fighter.blood.filter((drop) => drop.life > 0);
}

function clampX(fight, x) {
    return Math.max(fight.centerX - 320, Math.min(fight.centerX + 320, x));
}

function checkDeath(fight, fighter) {
    if (fighter.body.hp > 0) return;
    fight.winner = other(fighter.side);
    note(fight, `${fight.fighters[fight.winner].name} побеждает`);
    if (fight.phase !== PHASE.xray) fight.phase = PHASE.over;
}

function note(fight, text) {
    fight.log.push(text);
    if (fight.log.length > 40) fight.log.shift();
}

export { TORN };
