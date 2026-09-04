/**
 * Привести позы к единым длинам костей.
 *
 *   node tools/normalize-poses.mjs > /tmp/poses.txt
 *
 * Замысел позы — это ГДЕ кисть и стопа, а не где локоть; поэтому концы
 * остаются на месте, а промежуточный сустав досчитывается обратной
 * кинематикой. Локоть уходит вниз и чуть назад, колено — вперёд.
 */

import { POSES } from '../src/poses.js';

const TORSO = [['pelvis', 'chest', 30], ['chest', 'neck', 22], ['neck', 'head', 18]];
const LIMBS = [
    ['neck', 'elbowF', 'handF', 34, 32, 'down'],
    ['neck', 'elbowB', 'handB', 34, 32, 'down'],
    ['pelvis', 'kneeF', 'footF', 43, 41, 'fwd'],
    ['pelvis', 'kneeB', 'footB', 43, 41, 'fwd'],
];

function ik(root, target, l1, l2, bend) {
    const dx = target[0] - root[0];
    const dy = target[1] - root[1];
    const d = Math.hypot(dx, dy) || 0.001;
    const reach = Math.max(Math.abs(l1 - l2) + 0.01, Math.min(l1 + l2 - 0.01, d));
    const tx = root[0] + (dx / d) * reach;
    const ty = root[1] + (dy / d) * reach;
    const a = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const ux = (tx - root[0]) / reach;
    const uy = (ty - root[1]) / reach;
    const mx = root[0] + ux * a;
    const my = root[1] + uy * a;
    const c1 = [mx - uy * h, my + ux * h];
    const c2 = [mx + uy * h, my - ux * h];
    const want = bend === 'fwd' ? [1, 0] : [-0.25, -1];
    const dot = (c) => (c[0] - mx) * want[0] + (c[1] - my) * want[1];
    return { joint: dot(c1) >= dot(c2) ? c1 : c2, end: [tx, ty] };
}

function normalize(pose) {
    const out = {};
    for (const k of Object.keys(pose)) out[k] = [...pose[k]];
    for (const [from, to, want] of TORSO) {
        const dx = pose[to][0] - pose[from][0];
        const dy = pose[to][1] - pose[from][1];
        const d = Math.hypot(dx, dy) || 1;
        out[to] = [out[from][0] + (dx / d) * want, out[from][1] + (dy / d) * want];
    }
    for (const [root, joint, end, l1, l2, bend] of LIMBS) {
        const solved = ik(out[root], pose[end], l1, l2, bend);
        out[joint] = solved.joint;
        out[end] = solved.end;
    }
    return out;
}

const r = (n) => Math.round(n);
const lines = [];
for (const [name, pose] of Object.entries(POSES)) {
    const p = normalize(pose);
    const row = (ids) => ids.map((id) => `${id}: [${r(p[id][0])}, ${r(p[id][1])}]`).join(', ');
    lines.push(`    ${name}: {
        ${row(['pelvis', 'chest', 'neck', 'head'])},
        ${row(['elbowF', 'handF', 'elbowB', 'handB'])},
        ${row(['kneeF', 'footF', 'kneeB', 'footB'])},
    },`);
}
console.log(lines.join('\n'));
