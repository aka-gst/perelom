/**
 * Неподвижные сцены для витрины.
 *
 * Это не отдельная анимация и не подмена боя: мы ставим бойцов в центр,
 * прогоняем обычный `stepFrame` с обычным вводом и останавливаем именно тот
 * кадр, на котором механика зафиксировала попадание. Поэтому витрина не
 * обещает того, чего нет в игре.
 */

import { createFight, stepFrame } from './fight.js';

const STILL = () => ({
    left: false, right: false, up: false, down: false, pull: false,
    hand: false, foot: false, grab: false, dashLeft: false, dashRight: false,
});

/** Поставить бойцов симметрично вокруг центра, не у скалы. */
function поставитьВЦентре(fight, gap = 140) {
    fight.fighters[0].x = fight.centerX - gap / 2;
    fight.fighters[1].x = fight.centerX + gap / 2;
    for (const fighter of fight.fighters) fighter.sk.facing = fighter.facing;
    stepFrame(fight, [STILL, STILL]);
}

/**
 * Кадр удара ногой в момент попадания.
 *
 * Нога выбрана намеренно: на расстоянии в 140 мировых пикселей виден её
 * полный вылет, но ни один боец не уходит от центра камеры. Цикл кончается
 * по последствию (вспышка от настоящего попадания), а не по хрупкому номеру
 * кадра: изменения тайминга не превратят витрину в промах.
 */
export function ударнаяСцена() {
    const fight = createFight({ seed: 271828 });
    поставитьВЦентре(fight);
    let ударНажат = false;
    const kick = () => {
        if (ударНажат) return STILL();
        ударНажат = true;
        return { ...STILL(), foot: true };
    };

    for (let frame = 0; frame < 32; frame += 1) {
        stepFrame(fight, [kick, STILL]);
        if (fight.sparks.length > 0) return fight;
    }
    throw new Error('Витринный удар не дошёл до попадания');
}

/** Названия URL намеренно даны и по-русски, и латиницей — ссылка не хрупкая. */
export function витриннаяСцена(name) {
    if (name === 'удар' || name === 'hit') return ударнаяСцена();
    return null;
}

/** Компактный отпечаток: его сравнивает тест, а не картинка на глаз. */
export function снимокСцены(fight) {
    return {
        frame: fight.frame,
        freeze: fight.freeze,
        spark: fight.sparks.map((spark) => ({ kind: spark.kind, x: spark.x, y: spark.y, dir: spark.dir, life: spark.life })),
        fighters: fight.fighters.map((fighter) => ({
            x: fighter.x,
            state: fighter.state,
            action: fighter.action,
            hp: fighter.body.hp,
        })),
    };
}
