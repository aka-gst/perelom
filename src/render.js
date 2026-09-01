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
import { STATE } from './fight.js';
import { ACTION } from './rules.js';
import { centerOf } from './physics.js';
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
    const cam = cameraOf(fight, w, h);
    ctx.save();
    if (fight.shake > 0.4) {
        ctx.translate((Math.random() - 0.5) * fight.shake, (Math.random() - 0.5) * fight.shake);
    }

    // Фон рисуется в экранных координатах, а бойцы — в координатах камеры.
    // Чтобы линия земли у них совпала, её положение считается один раз здесь.
    const horizon = h * 0.62 + (fight.groundY - cam.y) * cam.zoom;
    backdrop(ctx, fight, w, h, time, cam, horizon);

    ctx.save();
    ctx.translate(w / 2, h * 0.62);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    ground(ctx, fight, cam, w);
    for (const fighter of fight.fighters) bloodOf(ctx, fighter);
    for (const fighter of fight.fighters) silhouette(ctx, fighter, fight);
    for (const fighter of fight.fighters) telegraph(ctx, fighter);
    for (const fighter of fight.fighters) if (fighter.state === STATE.launched) juggleGlow(ctx, fighter);
    sparks(ctx, fight);
    ctx.restore();

    numbers(ctx, fight, cam, w, h);
    ctx.restore();

    if (fight.banner) bannerOf(ctx, fight, w, h);
    if (fight.xray) xray(ctx, fight, w, h);
}

/**
 * Крупная надпись о том, что произошло.
 *
 * Взято у Mortal Kombat: он называет словом каждое заметное событие —
 * KOUNTER, PUNISH, GETUP PUNISH. Без этого игрок видит, что урон разный, но
 * не понимает почему, а у нас разница между обычным попаданием и встречным
 * — это вся суть перехвата.
 */
function bannerOf(ctx, fight, w, h) {
    const b = fight.banner;
    const k = Math.min(1, b.frames / 12);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.textAlign = 'center';
    ctx.font = '700 44px ui-monospace, monospace';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(5,6,10,0.9)';
    ctx.strokeText(b.text, w / 2, h * 0.24);
    ctx.fillStyle = b.tone;
    ctx.fillText(b.text, w / 2, h * 0.24);
    ctx.restore();
}

/**
 * Вспышка в точке касания — главный сигнал «удар был».
 *
 * Три вида различаются намеренно и различаются формой, а не только цветом:
 * попадание — звезда лучами наружу, встречный — та же звезда крупнее и
 * краснее, блок — дуга поперёк удара, будто щит. По ней должно быть видно,
 * прошло или закрыли, не читая ни полосок, ни лога.
 */
const SPARK = {
    hit: { tone: '#fff3c4', rays: 7, reach: 30, spread: 0.95 },
    counter: { tone: '#ff8a3d', rays: 9, reach: 44, spread: 1.05 },
    block: { tone: '#7dd3fc', rays: 5, reach: 26, spread: 0.6, arc: true },
};

/**
 * Лучи вспышки — конусом по направлению, а не звездой во все стороны.
 *
 * Направление читается боковым зрением раньше, чем цвет и форма: у
 * попадания искры уходят СКВОЗЬ противника по ходу удара, у звона —
 * НАЗАД, в бьющего. Цветом развести нельзя: палитра уже занята смыслами,
 * и четвёртый сломал бы прежние.
 *
 * Функция чистая, потому что по ней же и запирается тестом: средний ход
 * лучей по горизонтали у попадания положительный, у звона отрицательный.
 */
export function sparkRays(kind, dir = 1) {
    const spec = SPARK[kind] ?? SPARK.hit;
    const base = dir >= 0 ? 0 : Math.PI;
    const out = [];
    for (let i = 0; i < spec.rays; i += 1) {
        const t = spec.rays === 1 ? 0 : (i / (spec.rays - 1)) * 2 - 1;
        const angle = base + t * spec.spread;
        // Крайние лучи короче — конус, а не веер.
        out.push({ angle, reach: spec.reach * (1 - Math.abs(t) * 0.35) });
    }
    return out;
}

/** Средний ход лучей по горизонтали. По нему исход и отличается числом. */
export function sparkDrift(kind, dir = 1) {
    const rays = sparkRays(kind, dir);
    if (!rays.length) return 0;
    return rays.reduce((sum, r) => sum + Math.cos(r.angle) * r.reach, 0) / rays.length;
}

function sparks(ctx, fight) {
    if (!fight.sparks.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const s of fight.sparks) {
        const spec = SPARK[s.kind] ?? SPARK.hit;
        const k = s.life / (s.kind === 'block' ? 10 : 13);
        const reach = spec.reach * s.size * (1.3 - k * 0.5);
        ctx.globalAlpha = Math.min(1, k * 1.6);

        const grow = s.size * (1.3 - k * 0.5);
        ctx.strokeStyle = spec.tone;
        ctx.lineWidth = (spec.arc ? 3 : 3.5) * s.size * k;
        ctx.beginPath();
        for (const ray of sparkRays(s.kind, s.dir)) {
            const inner = ray.reach * grow * 0.28;
            const outer = ray.reach * grow;
            ctx.moveTo(s.x + Math.cos(ray.angle) * inner, s.y + Math.sin(ray.angle) * inner);
            ctx.lineTo(s.x + Math.cos(ray.angle) * outer, s.y + Math.sin(ray.angle) * outer);
        }
        ctx.stroke();

        if (spec.arc) {
            // Звон вдобавок к конусу назад даёт дугу — щит поперёк удара.
            const face = s.dir >= 0 ? 0 : Math.PI;
            ctx.lineWidth = 4.5 * k;
            ctx.beginPath();
            ctx.arc(s.x, s.y, spec.reach * grow * 1.2, face - 0.85, face + 0.85);
            ctx.stroke();
        } else {
            const core = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, spec.reach * grow * 0.55);
            core.addColorStop(0, '#ffffff');
            core.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = core;
            ctx.beginPath();
            ctx.arc(s.x, s.y, spec.reach * grow * 0.55, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

/** Цифры урона у места попадания — тоже из Mortal Kombat. */
function numbers(ctx, fight, cam, w, h) {
    if (!fight.numbers.length) return;
    ctx.save();
    ctx.translate(w / 2, h * 0.62);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    ctx.textAlign = 'center';
    ctx.font = '700 17px ui-monospace, monospace';
    ctx.lineWidth = 3;
    for (const n of fight.numbers) {
        ctx.globalAlpha = Math.min(1, n.life / 16);
        ctx.strokeStyle = 'rgba(5,6,10,0.85)';
        ctx.strokeText(String(n.value), n.x, n.y);
        ctx.fillStyle = '#ffd166';
        ctx.fillText(String(n.value), n.x, n.y);
    }
    ctx.restore();
}

/**
 * Камера. В файтинге без неё нельзя: бойцы расходятся на всю арену, и без
 * слежения половина боя уезжает за край. Наезжает, когда сходятся вплотную,
 * и отъезжает, когда разбегаются, но за границы арены не выходит.
 */
function cameraOf(fight, w, h) {
    const [a, b] = fight.fighters;
    const ax = a.sk.mode === 'ragdoll' ? centerOf(a.sk).x : a.x;
    const bx = b.sk.mode === 'ragdoll' ? centerOf(b.sk).x : b.x;
    // Ближе, чем было: в Tekken и SF6 боец занимает больше половины высоты
    // кадра, а у нас занимал две пятых, и от этого бой казался мелким.
    const span = Math.abs(ax - bx) + 260;
    const zoom = Math.max(1.3, Math.min(2.4, w / span));
    const half = w / (2 * zoom);
    const left = fight.centerX - fight.wall;
    const right = fight.centerX + fight.wall;
    let x = (ax + bx) / 2;
    if (right - left > half * 2) x = Math.max(left + half, Math.min(right - half, x));
    else x = (left + right) / 2;

    // Когда кого-то подбросили, кадр идёт следом вверх — иначе джагл уходит
    // за верхний край именно в тот момент, ради которого он и затевался.
    const top = Math.min(topOf(a), topOf(b));
    const lift = Math.max(0, fight.groundY - 150 - top);
    const y = fight.groundY - 96 - Math.min(150, lift * 0.65);
    return { x, y, zoom };
}

function topOf(f) {
    let top = Infinity;
    for (const id of Object.keys(f.sk.points)) top = Math.min(top, f.sk.points[id].y);
    return top;
}

function ground(ctx, fight, cam, w) {
    const left = fight.centerX - fight.wall;
    const right = fight.centerX + fight.wall;
    const span = (right - left) + 4000;
    ctx.fillStyle = '#0c0710';
    ctx.fillRect(left - 2000, fight.groundY, span, 600);
    ctx.fillStyle = 'rgba(255,120,90,0.3)';
    ctx.fillRect(left - 2000, fight.groundY, span, 2);
    // Края арены отмечены: в них ломают кости, и это должно быть видно.
    ctx.fillStyle = 'rgba(255,60,70,0.16)';
    ctx.fillRect(left - 26, fight.groundY - 190, 26, 190);
    ctx.fillRect(right, fight.groundY - 190, 26, 190);
}

/**
 * Телеграф удара: цвет типа на разгоне.
 *
 * Это не украшение, а условие честности. Перехват ловится реакцией, значит
 * тип удара обязан читаться с первого кадра замаха — иначе перехват снова
 * становится угадайкой, то есть тем же самым, от чего ушли.
 */
function telegraph(ctx, f) {
    if (f.state !== STATE.attack || !f.action) return;
    const spec = ACTION[f.action];
    const total = spec.startup + spec.active;
    if (f.frame > total + 2) return;

    const joint = spec.joint ?? 'handF';
    const point = f.sk.points[joint];
    if (!point) return;
    const live = f.frame >= spec.startup;
    const k = live ? 1 : f.frame / Math.max(1, spec.startup);

    ctx.save();
    if (spec.kind === 'catch') {
        // Перехват светится вокруг бойца: видно, что он открыл окно.
        const c = centerOf(f.sk);
        ctx.globalAlpha = live ? 0.55 : 0.25;
        ctx.strokeStyle = spec.tell;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 46 + (live ? 8 : 0), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        return;
    }
    ctx.globalAlpha = live ? 0.9 : 0.25 + k * 0.5;
    ctx.strokeStyle = spec.tell;
    ctx.lineWidth = live ? 5 : 2 + k * 3;
    ctx.lineCap = 'round';
    const from = f.sk.points[joint === 'footF' ? 'kneeF' : 'elbowF'];
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    if (live) {
        // Вспышка удара, а не зона поражения: зона щедрее рисунка, и рисовать
        // её честным размером — значит показывать игроку отладку.
        const glow = ctx.createRadialGradient(point.x, point.y, 1, point.x, point.y, 18);
        glow.addColorStop(0, spec.tell);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 18, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

/* ─────────────────────────── фон ─────────────────────────── */

function backdrop(ctx, fight, w, h, time, cam, horizon) {
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
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
    const cy = horizon - 150;
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
        // Параллакс наконец заработал: пока бойцы стояли на месте, слои
        // ездить было не от чего. Дальний план почти не двигается, ближний
        // идёт следом за камерой.
        const rate = [0.12, 0.34, 0.62];
        const drift = cam ? cam.x - fight.centerX : 0;
        art.order.forEach((id, i) => {
            const img = art.images[id];
            const scale = (w * 1.35) / img.naturalWidth;
            const dh = img.naturalHeight * scale;
            const dw = w * 1.35;
            ctx.drawImage(img, -(dw - w) / 2 - drift * rate[i], horizon - dh, dw, dh);
        });
    } else {
        ridge(ctx, w, horizon, 128, '#5c0b16', 0.7, time * 0.004);
        ridge(ctx, w, horizon, 78, '#33060e', 1.3, time * 0.009);
    }

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

    /*
     * Подсветка на попадании.
     *
     * Поле `flash` выставлялось с самого начала и не рисовалось нигде — из-за
     * этого боец при ударе не менялся вовсе, и попадание читалось только по
     * полоске здоровья. Первый живой отзыв так и звучал: «слабо понятно, что
     * удар был».
     */
    const lit = fighter.flash > 0;
    if (lit) ctx.filter = `brightness(${1 + fighter.flash * 0.26}) saturate(0.5)`;
    if (fighter.art?.ready) {
        sprites(ctx, fighter);
    } else {
        sticks(ctx, fighter);
        rim(ctx, fighter);
    }
    if (lit) ctx.filter = 'none';
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

/** Пока тело в воздухе, оно подсвечено: идёт джагл, и это видно. */
function juggleGlow(ctx, victim) {
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
    const t = 1 - fight.xrayFrames / 96;
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
