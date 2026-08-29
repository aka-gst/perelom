/**
 * Бой в реальном времени.
 *
 * Прежняя версия была пошаговой, и это оказалось её главной бедой: слепой
 * одновременный выбор — настолка, а не файтинг. Нет дистанции, нет тайминга,
 * нечего исполнять руками. Здесь тот же треугольник и те же переломы, но
 * оба бойца живут кадрами и ходят по арене.
 *
 * Два слоя времени никуда не делись, просто первый перестал быть меню:
 *
 *   НЕЙТРАЛКА — ходишь, меришь дистанцию, читаешь замах, ловишь промах.
 *   ДЖАГЛ     — противник в воздухе, читать нечего, работает исполнение.
 *
 * Стык между ними прежний: **удачный перехват и есть лаунчер**.
 *
 * Дальность удара нигде не записана числом. Она берётся из позы: удар
 * достаёт настолько, насколько в этом кадре вылетели кулак или стопа.
 * Поэтому анимация не может соврать про досягаемость.
 *
 * Модуль чистый: ни DOM, ни канваса, ни случайности сверх переданного зерна.
 */

import { ACTION, CHIP_SCALE, COUNTER_SCALE, FPS, lengthOf, outcomeOf } from './rules.js';
import { BONES, applyImpulse, availableActions, makeBody } from './body.js';
import {
    applyPose, boneNear, centerOf, createSkeleton, goRagdoll, heightOf, hitBone, step,
} from './physics.js';
import { POSES, poseForAttack, walkPose } from './poses.js';
import { makeRng } from './rng.js';

export const STATE = {
    idle: 'idle',
    walk: 'walk',
    dash: 'dash',
    jump: 'jump',
    attack: 'attack',
    hurt: 'hurt',
    launched: 'launched',
    down: 'down',
    getup: 'getup',
    dead: 'dead',
};

/** Всё в пикселях мира и кадрах при 60 в секунду. */
export const TUNE = {
    walkForward: 1.5,
    walkBack: 1.15,
    dashSpeed: 5.4,
    dashFrames: 8,
    dashRecovery: 7,
    jumpVy: -11.8,
    jumpVx: 3.1,
    gravity: 0.62,
    hurtFrames: 14,
    getupFrames: 26,
    downMax: 90,
    /** Бросок берёт только вплотную — иначе он бьёт защиту слишком дёшево. */
    grabRange: 76,
    /** Слипание тел: подойти ближе нельзя, иначе бойцы проходят насквозь. */
    bodyGap: 54,
    /** Замедление кадра в момент попадания. Без него удар не чувствуется. */
    hitstop: { hit: 5, counter: 9, chip: 3, launch: 11, throw: 9, juggle: 4 },
    juggleDecay: 0.84,
    /** Скорость, с которой встреча со скалой начинает ломать кости. */
    wallSpeed: 4.5,
};

// Подброс намеренно невысокий и почти вертикальный: улетит выше — не
// достанешь кулаком, улетит вбок — не догонишь. Вбок выбивает только нога,
// и это её работа: закончить комбо и впечатать тело в край арены.
const LAUNCH = { vx: 25, vy: -600, spin: 2.4, impulse: 320 };
const SLAM = { vx: 330, vy: 250, spin: 5.2 };

export const other = (side) => (side === 0 ? 1 : 0);

export function createFight({ seed = 1, groundY = 430, centerX = 480, wall = 330 } = {}) {
    const fight = {
        rng: makeRng(seed),
        groundY,
        centerX,
        wall,
        frame: 0,
        carry: 0,
        freeze: 0,
        shake: 0,
        xray: null,
        xrayFrames: 0,
        log: [],
        winner: null,
        over: false,
        bestJuggle: 0,
        fighters: [
            makeFighter(0, 'ТЫ', centerX - 95, 1, groundY, centerX, wall),
            makeFighter(1, 'КОСТОЛОМ', centerX + 95, -1, groundY, centerX, wall),
        ],
    };
    for (const f of fight.fighters) poseOf(f);
    return fight;
}

function makeFighter(side, name, x, facing, groundY, centerX, wall) {
    return {
        side, name, x, facing, groundY,
        y: 0,
        vx: 0,
        vy: 0,
        state: STATE.idle,
        frame: 0,
        action: null,
        hitDone: false,
        airAttack: false,
        walkPhase: 0,
        blocking: false,
        juggleHits: 0,
        juggleDamage: 0,
        flash: 0,
        body: makeBody(),
        sk: createSkeleton(POSES.idle, x, groundY, facing, centerX),
        blood: [],
        minX: centerX - wall,
        maxX: centerX + wall,
    };
}

export const EMPTY_INPUT = {
    left: false, right: false, up: false, down: false,
    hand: false, foot: false, grab: false, pull: false,
    dashLeft: false, dashRight: false,
};

/**
 * Шаг игры. `dt` в секундах, `controllers` — по функции на бойца, каждая
 * возвращает ввод этого кадра. ИИ и игрок ходят через один и тот же вход,
 * поэтому противник не может ничего, чего не может игрок.
 */
export function tick(fight, dt, controllers) {
    fight.carry += Math.min(dt, 0.1);
    const stepTime = 1 / FPS;
    let steps = 0;
    while (fight.carry >= stepTime && steps < 5) {
        fight.carry -= stepTime;
        steps += 1;
        stepFrame(fight, controllers);
    }
}

export function stepFrame(fight, controllers) {
    fight.frame += 1;
    fight.shake *= 0.86;
    for (const f of fight.fighters) {
        f.flash = Math.max(0, f.flash - 1);
        decayBlood(f);
    }

    if (fight.xrayFrames > 0) {
        fight.xrayFrames -= 1;
        if (fight.xrayFrames === 0) endXray(fight);
        return;
    }
    // Хитстоп: кадр замирает, но картинка остаётся — так удар получает вес.
    if (fight.freeze > 0) {
        fight.freeze -= 1;
        return;
    }
    if (fight.over) return;

    for (const f of fight.fighters) {
        const input = controllers?.[f.side]?.(fight, f.side) ?? EMPTY_INPUT;
        advance(fight, f, input);
    }
    separate(fight);
    resolveHits(fight);
    for (const f of fight.fighters) poseOf(f);
}

/* ─────────────────────────── боец ─────────────────────────── */

function advance(fight, f, input) {
    const foe = fight.fighters[other(f.side)];

    if (f.state === STATE.launched || f.state === STATE.down) {
        ragdoll(fight, f);
        return;
    }
    if (f.state === STATE.dead) return;

    // Лицом к противнику — но только стоя и не в действии, иначе удар
    // разворачивался бы в воздухе и читать замах было бы невозможно.
    if (f.y === 0 && (f.state === STATE.idle || f.state === STATE.walk)) {
        f.facing = foe.x >= f.x ? 1 : -1;
        f.sk.facing = f.facing;
    }

    f.frame += 1;

    switch (f.state) {
        case STATE.getup:
            if (f.frame >= TUNE.getupFrames) enter(f, STATE.idle);
            return;
        case STATE.hurt:
            f.x += f.vx;
            f.vx *= 0.82;
            if (f.frame >= TUNE.hurtFrames) enter(f, STATE.idle);
            clampX(f);
            return;
        case STATE.dash:
            f.x += f.vx;
            if (f.frame >= TUNE.dashFrames) f.vx = 0;
            if (f.frame >= TUNE.dashFrames + TUNE.dashRecovery) enter(f, STATE.idle);
            clampX(f);
            return;
        case STATE.attack:
            attackFrame(fight, f, input);
            return;
        case STATE.jump:
            airFrame(fight, f, input);
            return;
        default:
            groundFrame(fight, f, input);
    }
}

function groundFrame(fight, f, input) {
    const back = f.facing === 1 ? input.left : input.right;
    const fwd = f.facing === 1 ? input.right : input.left;

    // Блок — это шаг назад, как в любом файтинге: отдельной кнопки нет,
    // и потому за блок всегда платишь позицией.
    f.blocking = back;

    if (startAction(fight, f, input)) return;

    if (input.up) {
        f.vy = TUNE.jumpVy;
        f.vx = fwd ? TUNE.jumpVx * f.facing : back ? -TUNE.jumpVx * f.facing : 0;
        enter(f, STATE.jump);
        return;
    }
    if (input.dashRight || input.dashLeft) {
        const dir = input.dashRight ? 1 : -1;
        f.vx = TUNE.dashSpeed * dir;
        enter(f, STATE.dash);
        return;
    }

    if (fwd) {
        f.x += TUNE.walkForward * f.facing;
        f.walkPhase += 0.055;
        if (f.state !== STATE.walk) enter(f, STATE.walk);
    } else if (back) {
        f.x -= TUNE.walkBack * f.facing;
        f.walkPhase += 0.04;
        if (f.state !== STATE.walk) enter(f, STATE.walk);
    } else if (f.state !== STATE.idle) {
        enter(f, STATE.idle);
    }
    clampX(f);
}

function airFrame(fight, f, input) {
    f.x += f.vx;
    f.y -= f.vy;
    f.vy += TUNE.gravity;
    clampX(f);
    if (startAction(fight, f, input, true)) return;
    if (f.y <= 0) land(f);
}

function attackFrame(fight, f, input) {
    const spec = ACTION[f.action];
    if (f.airAttack) {
        f.x += f.vx;
        f.y -= f.vy;
        f.vy += TUNE.gravity;
        clampX(f);
        if (f.y <= 0) { land(f); return; }
    }
    if (f.frame >= lengthOf(f.action)) {
        if (f.airAttack && f.y > 0) enter(f, STATE.jump);
        else enter(f, STATE.idle);
    }
}

function startAction(fight, f, input, inAir = false) {
    const options = availableActions(f.body, Object.keys(ACTION));
    const wants = input.pull
        ? (input.hand ? 'catchHand' : input.foot ? 'catchFoot' : null)
        : (input.hand ? 'hand' : input.foot ? 'foot' : input.grab ? 'grab' : null);
    if (!wants) return false;
    // В воздухе не хватают и не перехватывают: не за что зацепиться.
    if (inAir && ACTION[wants].kind !== 'strike') return false;
    if (!options.includes(wants)) return false;

    f.action = wants;
    f.hitDone = false;
    f.airAttack = inAir;
    f.blocking = false;
    enter(f, STATE.attack);
    return true;
}

function enter(f, state) {
    f.state = state;
    f.frame = 0;
    if (state !== STATE.attack) {
        f.action = null;
        f.airAttack = false;
    }
    if (state === STATE.idle || state === STATE.walk) f.blocking = f.blocking && state === STATE.walk;
}

function land(f) {
    f.y = 0;
    f.vy = 0;
    f.vx = 0;
    enter(f, STATE.idle);
}

function clampX(f) {
    f.x = Math.max(f.minX, Math.min(f.maxX, f.x));
}

/** Бойцы не проходят друг сквозь друга: обоих расталкивает поровну. */
function separate(fight) {
    const [a, b] = fight.fighters;
    if (a.state === STATE.launched || b.state === STATE.launched) return;
    if (a.state === STATE.down || b.state === STATE.down) return;
    const gap = Math.abs(a.x - b.x);
    if (gap >= TUNE.bodyGap) return;
    const push = (TUNE.bodyGap - gap) / 2;
    const dir = a.x <= b.x ? -1 : 1;
    a.x += push * dir;
    b.x -= push * dir;
    clampX(a);
    clampX(b);
}

/* ─────────────────────────── попадания ─────────────────────────── */

function resolveHits(fight) {
    for (const att of fight.fighters) {
        if (att.state !== STATE.attack || att.hitDone) continue;
        const spec = ACTION[att.action];
        if (spec.kind === 'catch') continue;
        if (att.frame < spec.startup || att.frame >= spec.startup + spec.active) continue;

        const def = fight.fighters[other(att.side)];
        if (def.state === STATE.dead) continue;
        // Лежачего не бьют: иначе комбо не кончается, оно просто переезжает
        // на землю и превращается в молотьбу по неподвижному телу.
        if (def.state === STATE.down) continue;
        const found = def.state === STATE.launched
            ? airHit(att, def, spec)
            : hitBone(def.sk, att.sk.points[spec.joint].x, att.sk.points[spec.joint].y, spec.reach);
        if (!found) continue;
        if (spec.kind === 'grab' && Math.abs(att.x - def.x) > TUNE.grabRange) continue;

        att.hitDone = true;
        land_hit(fight, att, def, spec, found);
    }
}

/**
 * Попадание по летящему считается по своей, щедрой зоне.
 *
 * Причина простая: подброшенное тело висит выше, чем достаёт кулак стоящего
 * бойца, и по честной зоне джагл распадается на лотерею «дотянулся или нет».
 * Поэтому в воздухе боец тянется за телом — как и во всех файтингах с
 * джаглом, где у воздушных добиваний свои зоны.
 */
const AIR_REACH = 74;

function airHit(att, def, spec) {
    // Меряем от бьющей конечности, а не от груди: иначе у ноги пропадает
    // её дальность, и в воздухе рука с ногой становятся одним и тем же.
    const from = att.sk.points[spec.joint] ?? centerOf(att.sk);
    const body = centerOf(def.sk);
    const dist = Math.hypot(body.x - from.x, body.y - from.y);
    if (dist > AIR_REACH) return null;
    const bone = boneNear(def.sk, body.x, body.y) ?? 'ribs';
    return { bone, x: body.x, y: body.y, dist };
}

/** Чем защищается боец прямо сейчас — в терминах треугольника. */
function defenseOf(f) {
    if (f.state === STATE.launched) return { mode: 'air' };
    if (f.state === STATE.jump || (f.state === STATE.attack && f.airAttack)) return { mode: 'air' };
    if (f.state === STATE.attack) {
        const spec = ACTION[f.action];
        if (spec.kind === 'catch') {
            const open = f.frame >= spec.startup && f.frame < spec.startup + spec.active;
            return { mode: 'catch', catches: spec.catches, open };
        }
    }
    if (f.blocking && f.state !== STATE.hurt && f.y === 0) return { mode: 'block' };
    return { mode: 'none' };
}

function land_hit(fight, att, def, spec, found) {
    const juggling = def.state === STATE.launched;
    const defense = juggling ? { mode: 'air' } : defenseOf(def);
    const outcome = outcomeOf(spec.id, defense);
    if (outcome === 'miss') return;

    if (outcome === 'launch') {
        note(fight, `${def.name} перехватывает ${spec.name.toLowerCase()}`);
        enter(def, STATE.idle);
        launch(fight, def, att);
        return;
    }

    if (outcome === 'chip') {
        def.body.guard -= spec.kind === 'grab' ? 0 : (spec.id === 'foot' ? 2 : 1);
        def.body.hp = Math.max(0, def.body.hp - spec.damage * CHIP_SCALE);
        def.vx = 2.4 * att.facing;
        def.flash = 6;
        fight.freeze = TUNE.hitstop.chip;
        fight.shake = 4;
        if (def.body.guard <= 0) {
            def.body.guard = 3;
            note(fight, `${def.name}: гард сломан`);
            launch(fight, att, def);
        }
        return;
    }

    if (outcome === 'throw') {
        note(fight, `${att.name} бросает`);
        slam(fight, att, def, spec);
        return;
    }

    const scale = (outcome === 'counter' ? COUNTER_SCALE : 1)
        * (juggling ? TUNE.juggleDecay ** def.juggleHits : 1);
    const result = applyImpulse(def.body, found.bone, spec.impulse * scale, spec.damage * scale);
    fight.freeze = juggling ? TUNE.hitstop.juggle : TUNE.hitstop[outcome] ?? TUNE.hitstop.hit;
    fight.shake = juggling ? 6 : outcome === 'counter' ? 13 : 8;
    def.flash = 8;
    splash(def, found, 6 + spec.impulse / 46);

    if (juggling) {
        def.juggleHits += 1;
        def.juggleDamage += result.damage;
        // Рука подбивает вверх и держит тело в воздухе, нога выбивает вбок.
        const decay = TUNE.juggleDecay ** def.juggleHits;
        // Рука обязана подбивать тело ровно настолько, чтобы оно висело
        // дольше, чем бьющий выходит из отходняка. Иначе комбо физически
        // не может быть длиннее одного удара.
        const up = spec.id === 'hand' ? -640 : -240;
        const away = spec.id === 'hand' ? 35 : 640;
        goRagdoll(def.sk, away * att.facing * decay, up * decay, 3 * decay);
        note(fight, `${def.juggleHits} попаданий подряд`);
    } else if (def.state === STATE.jump || (def.state === STATE.attack && def.airAttack)) {
        launch(fight, att, def);
        return;
    } else {
        enter(def, STATE.hurt);
        def.vx = (outcome === 'counter' ? 4.6 : 3.1) * att.facing;
        if (outcome === 'counter') note(fight, `встречный: ${BONES[found.bone].name.toLowerCase()}`);
    }

    if (result.broke) startXray(fight, def, found.bone, result);
    checkDeath(fight, def);
}

function launch(fight, from, victim) {
    victim.state = STATE.launched;
    victim.frame = 0;
    victim.juggleHits = 0;
    victim.juggleDamage = 0;
    victim.sk.mode = 'ragdoll';
    applyPose(victim.sk, POSES.hurt, victim.x, victim.groundY - victim.y);
    goRagdoll(victim.sk, LAUNCH.vx * from.facing, LAUNCH.vy, LAUNCH.spin * from.facing);
    applyImpulse(victim.body, 'ribs', LAUNCH.impulse, 4);
    fight.freeze = TUNE.hitstop.launch;
    fight.shake = 12;
    note(fight, `${victim.name} в воздухе`);
}

function slam(fight, from, victim, spec) {
    const result = applyImpulse(victim.body, 'spine', spec.impulse, spec.damage);
    victim.state = STATE.down;
    victim.frame = 0;
    victim.juggleHits = 0;
    victim.sk.mode = 'ragdoll';
    victim.sk.facing = -from.facing;
    applyPose(victim.sk, POSES.hurt, victim.x, victim.groundY - victim.y);
    goRagdoll(victim.sk, SLAM.vx * from.facing, SLAM.vy, SLAM.spin * from.facing);
    fight.freeze = TUNE.hitstop.throw;
    fight.shake = 14;
    splash(victim, centerOf(victim.sk), 22);
    if (result.broke) startXray(fight, victim, 'spine', result);
    checkDeath(fight, victim);
}

/* ─────────────────────────── рагдолл ─────────────────────────── */

function ragdoll(fight, f) {
    f.frame += 1;
    const before = heightOf(f.sk);
    const beforeX = centerOf(f.sk).x;
    const rest = step(f.sk, 1 / FPS);
    const after = heightOf(f.sk);
    const afterX = centerOf(f.sk).x;

    // Арена калечит: встреча со скалой ломает ту кость, которая коснулась.
    // Ради этого и стоит гнать противника к краю, а не бить по центру.
    const speedX = Math.abs(afterX - beforeX);
    const atWall = afterX <= f.minX + 26 || afterX >= f.maxX - 26;
    if (atWall && speedX > TUNE.wallSpeed && !f.wallDone) {
        f.wallDone = true;
        const point = { x: afterX, y: centerOf(f.sk).y };
        const bone = boneNear(f.sk, point.x, point.y) ?? 'ribs';
        const impulse = Math.min(760, speedX * 95);
        const result = applyImpulse(f.body, bone, impulse, impulse / 30);
        fight.shake = 16;
        splash(f, point, 20);
        note(fight, `о скалу: ${BONES[bone].name.toLowerCase()}`);
        if (result.broke) startXray(fight, f, bone, result);
        checkDeath(fight, f);
    }
    if (!atWall) f.wallDone = false;

    if (f.state === STATE.launched && after < 22 && before >= 22) {
        groundImpact(fight, f, (before - after) * FPS);
        f.state = STATE.down;
        f.frame = 0;
        return;
    }
    if (f.state === STATE.down && (rest || f.frame > TUNE.downMax)) {
        fight.bestJuggle = Math.max(fight.bestJuggle, f.juggleHits);
        f.sk.mode = 'posed';
        f.x = Math.max(f.minX, Math.min(f.maxX, centerOf(f.sk).x));
        f.y = 0;
        f.vx = 0;
        f.vy = 0;
        enter(f, STATE.getup);
    }
}

function groundImpact(fight, f, fallSpeed) {
    if (fallSpeed <= 420) return;
    const lowest = lowestPoint(f.sk);
    const bone = boneNear(f.sk, lowest.x, lowest.y) ?? 'spine';
    const impulse = Math.min(700, fallSpeed * 0.5);
    const result = applyImpulse(f.body, bone, impulse, impulse / 28);
    fight.shake = 11;
    splash(f, lowest, 14);
    if (result.broke) startXray(fight, f, bone, result);
    checkDeath(fight, f);
}

/* ─────────────────────────── перелом ─────────────────────────── */

function startXray(fight, victim, boneId, result) {
    if (fight.over) return;
    fight.xray = {
        side: victim.side,
        bone: boneId,
        tore: result.tore,
        lethal: result.lethal,
        at: centerOf(victim.sk),
    };
    fight.xrayFrames = 96;
    fight.shake = 20;
    fight.freeze = 0;
    const lost = BONES[boneId].disables;
    note(fight, `${BONES[boneId].name}: ${result.tore ? 'ОТОРВАНА' : 'СЛОМАН'}`
        + (lost.length ? ` — ${lost.map((id) => ACTION[id].name).join(', ')} больше нет` : ''));
    splash(victim, centerOf(victim.sk), result.tore ? 46 : 26);
}

function endXray(fight) {
    fight.xray = null;
    if (fight.winner !== null) fight.over = true;
}

/* ─────────────────────────── мелочи ─────────────────────────── */

function poseOf(f) {
    if (f.sk.mode === 'ragdoll') return;
    const ground = f.groundY - f.y;
    let pose = POSES.idle;
    if (f.state === STATE.attack) pose = poseForAttack(f.action, f.frame, ACTION[f.action]);
    else if (f.state === STATE.hurt) pose = POSES.hurt;
    else if (f.state === STATE.getup) pose = POSES.getup;
    else if (f.state === STATE.jump || f.y > 0) pose = POSES.air;
    else if (f.state === STATE.dash) pose = POSES.step;
    else if (f.blocking) pose = POSES.guard;
    else if (f.state === STATE.walk) pose = walkPose(f.walkPhase);
    applyPose(f.sk, pose, f.x, ground);
}

function lowestPoint(sk) {
    let best = null;
    for (const id of Object.keys(sk.points)) {
        const p = sk.points[id];
        if (!best || p.y > best.y) best = p;
    }
    return best;
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

function decayBlood(f) {
    const dt = 1 / FPS;
    for (const drop of f.blood) {
        if (drop.stuck) { drop.life -= dt * 0.06; continue; }
        drop.vy += 1800 * dt;
        drop.x += drop.vx * dt;
        drop.y += drop.vy * dt;
        drop.life -= dt;
        if (drop.y >= f.groundY) {
            drop.y = f.groundY;
            drop.stuck = true;
            drop.life = 8;
        }
    }
    f.blood = f.blood.filter((drop) => drop.life > 0);
}

function checkDeath(fight, f) {
    if (f.body.hp > 0) return;
    f.state = STATE.dead;
    fight.winner = other(f.side);
    note(fight, `${fight.fighters[fight.winner].name} побеждает`);
    if (!fight.xrayFrames) fight.over = true;
}

function note(fight, text) {
    fight.log.push(text);
    if (fight.log.length > 40) fight.log.shift();
}

/** Что боец физически ещё может: перелом вычёркивает действие. */
export function optionsFor(f) {
    return availableActions(f.body, Object.keys(ACTION));
}
