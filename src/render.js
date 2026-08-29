/**
 * Арена. Ни одного чужого пикселя: фон, бойцы, кровь и рентген рисуются
 * фигурами прямо здесь.
 *
 * Стиль взят у силуэтных файтингов не из любви к минимализму, а по расчёту:
 * силуэт — это одна заливка. Он рисуется мгновенно, читается на телефоне,
 * не требует ни спрайтов, ни художника, и — главное — оторванная рука в нём
 * стоит ровно столько же, сколько целая. Кровища на чёрном силуэте работает
 * лучше, чем на детализированном персонаже: контраст максимальный.
 */

import { BONES, BONE_IDS, INTACT, TORN } from './body.js';
import { PHASE } from './fight.js';
import { BONE_OF_LAYER, HEAD, LAYERS, PAD, PIECE_BY_ID, SCALE } from './sprites.js';

const SKIN = ['#05060a', '#05060a'];
const RIM = ['#ff2d55', '#22d3ee'];

/** Толщина звена: туловище толще конечностей, иначе силуэт не читается. */
/** Голова крепится одной точкой, поэтому её размер задаётся отдельно. */
const HEAD_SCALE = 0.19;

/** Приближение камеры: в полный рост 960×540 боец занимает четверть кадра. */
const ZOOM = 1.34;

const WIDTH = {
    spine: 30, ribs: 26, skull: 18,
    arm: 13, leg: 16, brace: 0,
};

export function draw(ctx, fight, w, h, time) {
    ctx.save();
    const shake = fight.shake;
    if (shake > 0) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    backdrop(ctx, fight, w, h, time);

    // Камера приближает бойцов, но не фон: масштаб взят относительно линии
    // земли, поэтому ступни остаются на ней, а дальний план не разъезжается.
    ctx.save();
    ctx.translate(w / 2, fight.groundY);
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-w / 2, -fight.groundY);
    for (const fighter of fight.fighters) bloodOf(ctx, fighter);
    for (const fighter of fight.fighters) silhouette(ctx, fighter, fight);
    if (fight.phase === PHASE.juggle) juggleGlow(ctx, fight);
    ctx.restore();

    ctx.restore();

    if (fight.phase === PHASE.xray && fight.xray) xray(ctx, fight, w, h);
}

/* ─────────────────────────── фон ─────────────────────────── */

function backdrop(ctx, fight, w, h, time) {
    const sky = ctx.createLinearGradient(0, 0, 0, fight.groundY);
    // Небо намеренно светлее, чем просится по настроению: подброшенный
    // боец улетает высоко, и на чёрном небе чёрный силуэт исчезает —
    // в кадре остаются одни контурные линии. Силуэту нужен фон.
    sky.addColorStop(0, '#2b0812');
    sky.addColorStop(0.5, '#6b0f20');
    sky.addColorStop(1, '#c4172c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Диск за спинами: единственный источник света в кадре, он же делает
    // силуэты силуэтами.
    const cx = w * 0.5;
    const cy = fight.groundY - 150;
    const glow = ctx.createRadialGradient(cx, cy, 20, cx, cy, 420);
    glow.addColorStop(0, 'rgba(255,224,190,0.98)');
    glow.addColorStop(0.22, 'rgba(255,150,110,0.5)');
    glow.addColorStop(1, 'rgba(255,90,70,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 420, 0, Math.PI * 2);
    ctx.fill();

    const art = fight.arenaArt;
    if (art?.ready) {
        // Слои ставятся нижним краем на линию земли и чуть разъезжаются
        // по горизонтали — этим и держится глубина.
        const shift = [10, -6, -22];
        art.order.forEach((id, i) => {
            const img = art.images[id];
            const scale = (w * 1.12) / img.naturalWidth;
            const dh = img.naturalHeight * scale;
            ctx.drawImage(img, -w * 0.06 + shift[i], fight.groundY - dh, w * 1.12, dh);
        });
    } else {
        ridge(ctx, w, fight.groundY, 128, '#5c0b16', 0.7, time * 0.004);
        ridge(ctx, w, fight.groundY, 78, '#33060e', 1.3, time * 0.009);
    }

    ctx.fillStyle = '#0c0710';
    ctx.fillRect(0, fight.groundY, w, h - fight.groundY);
    ctx.fillStyle = 'rgba(255,120,90,0.3)';
    ctx.fillRect(0, fight.groundY, w, 2);
}

function ridge(ctx, w, groundY, height, color, freq, phase) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    for (let x = 0; x <= w; x += 12) {
        const k = (x / w) * Math.PI * 2 * freq + phase;
        const y = groundY - height * (0.45 + 0.55 * Math.abs(Math.sin(k) * Math.cos(k * 0.6 + 1)));
        ctx.lineTo(x, y);
    }
    ctx.lineTo(w, groundY);
    ctx.closePath();
    ctx.fill();
}

/* ─────────────────────────── боец ─────────────────────────── */

function silhouette(ctx, fighter, fight) {
    const sk = fighter.sk;
    const body = fighter.body;

    // Тень: без неё боец висит в воздухе даже когда стоит.
    const feet = Math.max(sk.points.footF.x, sk.points.footB.x);
    const mid = (sk.points.footF.x + sk.points.footB.x) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(mid, fighter.groundY + 3, Math.max(26, Math.abs(feet - mid) + 20), 7, 0, 0, Math.PI * 2);
    ctx.fill();

    if (fighter.art?.ready) {
        sprites(ctx, fighter);
    } else {
        sticks(ctx, fighter);
        rim(ctx, fighter);
    }
    breaks(ctx, fighter);
}

/** Тело из спрайтов: каждая часть садится своими суставами на суставы скелета. */
function sprites(ctx, fighter) {
    const sk = fighter.sk;
    for (const layer of LAYERS) {
        if (fighter.body.bones[BONE_OF_LAYER[layer.piece]]?.state === TORN) continue;
        const img = layer.back ? fighter.art.dark[layer.piece] : fighter.art.images[layer.piece];
        if (!img) continue;
        const a = sk.points[layer.a];
        const b = sk.points[layer.b];
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        ctx.save();
        const fit = fighter.art.fit[layer.piece];
        if (!fit) { ctx.restore(); continue; }
        if (layer.head) {
            // Голова садится на сустав СЕРЕДИНОЙ, а не низом: сустав головы
            // в скелете — это её центр, а не основание черепа.
            ctx.translate(b.x, b.y);
            ctx.rotate(angle + Math.PI / 2);
            ctx.scale(HEAD_SCALE, HEAD_SCALE * sk.facing);
            ctx.drawImage(img, -fit.ax, -fit.y);
        } else {
            const scale = Math.hypot(b.x - a.x, b.y - a.y) / (fit.bx - fit.ax);
            ctx.translate(a.x, a.y);
            ctx.rotate(angle);
            ctx.scale(scale, scale * sk.facing);
            ctx.drawImage(img, -fit.ax, -fit.y);
        }
        ctx.restore();
    }
}

/** Запасное тело из палок: игра обязана работать и без графики. */
function sticks(ctx, fighter) {
    const sk = fighter.sk;
    for (const stick of sk.sticks) {
        if (!stick.bone) continue;
        if (fighter.body.bones[stick.bone].state === TORN) continue;
        const a = sk.points[stick.a];
        const b = sk.points[stick.b];
        ctx.strokeStyle = SKIN[fighter.side];
        ctx.lineWidth = WIDTH[stick.bone] ?? 12;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }
    if (fighter.body.bones.skull.state !== TORN) {
        ctx.fillStyle = SKIN[fighter.side];
        ctx.beginPath();
        ctx.arc(sk.points.head.x, sk.points.head.y, 15, 0, Math.PI * 2);
        ctx.fill();
    }
}

/** Контровой свет: два чёрных силуэта иначе неразличимы. */
function rim(ctx, fighter) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = RIM[fighter.side];
    ctx.lineWidth = 2.5;
    const sk = fighter.sk;
    for (const stick of sk.sticks) {
        if (!stick.bone) continue;
        if (fighter.body.bones[stick.bone].state === TORN) continue;
        const a = sk.points[stick.a];
        const b = sk.points[stick.b];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const half = (WIDTH[stick.bone] ?? 12) / 2;
        const nx = (-dy / len) * half * sk.facing;
        const ny = (dx / len) * half * sk.facing;
        ctx.beginPath();
        ctx.moveTo(a.x + nx, a.y + ny);
        ctx.lineTo(b.x + nx, b.y + ny);
        ctx.stroke();
    }
    ctx.restore();
}

/** Сломанное светится красным прямо на силуэте — статус читается без текста. */
function breaks(ctx, fighter) {
    const sk = fighter.sk;
    for (const stick of sk.sticks) {
        if (!stick.bone) continue;
        const state = fighter.body.bones[stick.bone].state;
        if (state === INTACT) continue;
        const a = sk.points[stick.a];
        const b = sk.points[stick.b];
        if (state === TORN) {
            ctx.fillStyle = '#c1121f';
            ctx.beginPath();
            ctx.arc(a.x, a.y, 9, 0, Math.PI * 2);
            ctx.fill();
            continue;
        }
        ctx.save();
        ctx.strokeStyle = 'rgba(220,30,45,0.9)';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
    }
}

function bloodOf(ctx, fighter) {
    for (const drop of fighter.blood) {
        ctx.globalAlpha = drop.stuck ? Math.min(0.75, drop.life / 8) : Math.min(1, drop.life);
        ctx.fillStyle = drop.stuck ? '#5c0a12' : '#e01020';
        ctx.beginPath();
        ctx.arc(drop.x, drop.y, drop.r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

/** Пока идёт джагл, поле подсвечено: слой чтения выключен, и это видно. */
function juggleGlow(ctx, fight) {
    const victim = fight.fighters[fight.victim];
    const p = victim.sk.points.pelvis;
    ctx.save();
    ctx.globalAlpha = 0.5;
    const glow = ctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, 190);
    glow.addColorStop(0, 'rgba(255,60,70,0.5)');
    glow.addColorStop(1, 'rgba(255,60,70,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - 200, p.y - 200, 400, 400);
    ctx.restore();
}

/* ─────────────────────────── рентген ─────────────────────────── */

/**
 * Икс-рэй не нарисован заранее и не свой у каждого персонажа: движок и так
 * знает, какая кость приняла импульс, — камера просто ныряет к ней. Поэтому
 * он разный каждый раз и стоит один раз написанного кода, а не сорока
 * отрисованных роликов.
 */
function xray(ctx, fight, w, h) {
    const info = fight.xray;
    const victim = fight.fighters[info.side];
    const t = 1 - fight.timer / 1.6;
    // Камера именно ныряет, а не подъезжает: кость должна занять кадр.
    const zoom = 2.4 + Math.min(1, t * 2.2) * 1.9;

    ctx.save();
    ctx.fillStyle = `rgba(6,0,4,${Math.min(0.92, t * 4)})`;
    ctx.fillRect(0, 0, w, h);

    // Смещаем ниже середины: верхняя пятая кадра занята надписью.
    ctx.translate(w / 2, h * 0.6);
    ctx.scale(zoom, zoom);
    ctx.translate(-info.at.x, -info.at.y);

    const sk = victim.sk;
    ctx.lineCap = 'round';
    for (const stick of sk.sticks) {
        if (!stick.bone) continue;
        const a = sk.points[stick.a];
        const b = sk.points[stick.b];
        const target = stick.bone === info.bone;
        ctx.strokeStyle = target ? '#ffffff' : 'rgba(190,205,225,0.35)';
        ctx.lineWidth = target ? (WIDTH[stick.bone] ?? 12) * 0.55 : (WIDTH[stick.bone] ?? 12) * 0.4;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        if (target && t > 0.28) crack(ctx, a, b, t);
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(6,0,4,0.78)';
    ctx.fillRect(0, h * 0.09, w, h * 0.19);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff2436';
    ctx.font = '700 46px ui-monospace, monospace';
    const label = info.lethal ? 'НАСМЕРТЬ' : info.tore ? 'ОТОРВАНО' : 'ПЕРЕЛОМ';
    ctx.fillText(label, w / 2, h * 0.2);
    ctx.fillStyle = '#f7d7da';
    ctx.font = '600 22px ui-monospace, monospace';
    ctx.fillText(BONES[info.bone].name, w / 2, h * 0.2 + 32);
    ctx.fillStyle = '#ff8b95';
    ctx.font = '500 15px ui-monospace, monospace';
    ctx.fillText(consequence(info), w / 2, h * 0.2 + 58);
    ctx.restore();
}

/** Перелом всегда что-то отнимает — и это говорится словами, а не значком. */
function consequence(info) {
    if (info.lethal) return 'ЭТОГО ТЕЛО УЖЕ НЕ ДЕРЖИТ';
    const bone = BONES[info.bone];
    if (bone.disables.length) return 'ЭТО ДЕЙСТВИЕ БОЛЬШЕ НЕДОСТУПНО';
    if (bone.frailty) return 'ВЕСЬ УРОН ПО ТЕЛУ РАСТЁТ';
    return 'СЛЕДУЮЩИЙ ПЕРЕЛОМ ПРИДЁТ ВДВОЕ БЫСТРЕЕ';
}

function crack(ctx, a, b, t) {
    const k = Math.min(1, (t - 0.28) / 0.35);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    ctx.save();
    ctx.strokeStyle = '#ff2436';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2 + 0.6;
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + Math.cos(angle) * 26 * k, my + Math.sin(angle) * 26 * k);
    }
    ctx.stroke();
    ctx.fillStyle = `rgba(255,36,54,${0.5 * k})`;
    ctx.beginPath();
    ctx.arc(mx, my, 16 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

export { BONE_IDS };
