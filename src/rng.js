/** Детерминированный генератор: с одним семенем бой воспроизводится в тестах. */
export function makeRng(seed = 1) {
    let state = seed >>> 0;
    return function next() {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];
