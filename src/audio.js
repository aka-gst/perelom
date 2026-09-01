/**
 * Звук.
 *
 * Игра держится на ощущении удара, и хруст ломающейся кости здесь не
 * украшение, а половина эффекта от главной механики: перелом отнимает
 * действие, и это должно быть слышно, а не только написано.
 *
 * Два правила, оба выстраданы не здесь, но дорого.
 *
 * **Немой запуск по адресу.** Сессии проверяют игру в браузерной панели, и
 * звук идёт в колонки владельца. Поэтому `?тихо` (или `?quiet`) выключает
 * звук целиком. Параметр сильнее сохранённого выбора, в память не пишется,
 * и `?l=ABC` под него не попадает.
 *
 * **Не приглушать, а не создавать `AudioContext` вовсе.** Приглушённый
 * контекст оживает сам: при первом жесте, при возврате во вкладку, при
 * переразмере. Это проверено замером в соседних играх, а не рассуждением.
 */

/**
 * Наборы вариантов заданы списком файлов, а не диапазоном номеров.
 *
 * У `punch-heavy` нет второго варианта — файлы называются `-1` и `-3`.
 * Случайный выбор циклом от одного до трёх промахивался бы на каждом
 * третьем ударе ногой, и промах был бы тихим: звука просто нет, а причину
 * искали бы в логике удара.
 */
export const PACK = {
    hand: ['punch-light-1.wav', 'punch-light-2.wav', 'punch-light-3.wav'],
    heavy: ['punch-heavy-1.wav', 'punch-heavy-3.wav'],
    crack: ['bone-crack-1.wav', 'bone-crack-2.wav', 'bone-crack-3.wav'],
    tear: ['limb-tear-1.wav', 'limb-tear-2.wav', 'limb-tear-3.wav'],
};

/** Громкость по видам: перелом должен быть слышен поверх размена. */
const GAIN = { hand: 0.5, heavy: 0.72, crack: 1, tear: 0.95 };

export function isQuiet(location = globalThis.location) {
    if (!location) return true;
    const raw = `${location.search ?? ''}${location.hash ?? ''}`;
    // Браузер отдаёт кириллицу в адресе процентно-закодированной: набранное
    // человеком `?тихо` приходит сюда как `?%D1%82%D0%B8%D1%85%D0%BE`.
    // Без раскодирования русское написание не срабатывает вовсе — а именно
    // его и набирают.
    let where = raw;
    try {
        where = decodeURIComponent(raw);
    } catch {
        // Битая последовательность — судим по сырой строке, латиница в ней цела.
    }
    // Написаний три, а не два: `тихо`, `tiho`, `quiet`. Соглашение общее на
    // девять игр, и один адрес должен глушить любую из форм. Транслитерация
    // нужна там, где кириллицу неудобно набрать или она теряется при
    // переносе ссылки. Рецепт взят дословно из навыка `zvuk` — семь игр
    // писали разбор адреса сами и получили шесть разных поломок; у меня
    // была своя, отсутствие `tiho`.
    return /(^|[?&#])(тихо|tiho|quiet)(=1|=true)?([&#]|$)/i.test(where);
}

export function createAudio({ base = './sfx', quiet = isQuiet() } = {}) {
    const audio = { quiet, ready: false, ctx: null, buffers: new Map() };
    if (quiet) return audio; // контекста не создаём вовсе — см. заголовок

    /**
     * Контекст рождается на первом жесте: до него браузер всё равно не даст
     * звучать, а создать заранее — значит получить подвешенный контекст,
     * который потом сам оживёт в неудобный момент.
     */
    audio.wake = () => {
        if (audio.ctx) return audio.ctx;
        const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
        if (!Ctor) return null;
        audio.ctx = new Ctor();
        /**
         * Всё идёт через общий узел, а за ним — анализатор.
         *
         * Он нужен не для красоты: без него проверить звук можно только
         * подсчётом вызовов `play`, а это измеряет намерение, а не звук.
         * С анализатором вопрос «звучит ли» становится замером.
         */
        audio.master = audio.ctx.createGain();
        audio.analyser = audio.ctx.createAnalyser();
        audio.analyser.fftSize = 256;
        audio.master.connect(audio.analyser).connect(audio.ctx.destination);
        load(audio, base);
        return audio.ctx;
    };
    return audio;
}

async function load(audio, base) {
    const names = [...new Set(Object.values(PACK).flat())];
    await Promise.all(names.map(async (name) => {
        try {
            const url = globalThis.__PERELOM_SFX?.[name] ?? `${base}/${name}`;
            const bytes = await (await fetch(url)).arrayBuffer();
            audio.buffers.set(name, await audio.ctx.decodeAudioData(bytes));
        } catch {
            // Звука может не быть — игра обязана работать и без него.
        }
    }));
    audio.ready = audio.buffers.size > 0;
}

/**
 * Уровень сигнала прямо сейчас, от нуля до единицы.
 *
 * Приёмка поломкой: под `?тихо` здесь обязан быть **ровно ноль**, а не
 * маленькое число, потому что контекста нет вовсе. На обычном адресе после
 * удара — заметно больше нуля.
 */
export function level(audio) {
    if (!audio?.analyser) return 0;
    const data = new Uint8Array(audio.analyser.frequencyBinCount);
    audio.analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
    return peak;
}

/** Сыграть вид звука. Молча ничего не делает, если звук выключен или не готов. */
export function play(audio, cue, strength = 1) {
    if (!audio || audio.quiet || !audio.ctx || !audio.ready) return false;
    const list = PACK[cue];
    if (!list) return false;
    const name = list[Math.floor(Math.random() * list.length)];
    const buffer = audio.buffers.get(name);
    if (!buffer) return false;

    const source = audio.ctx.createBufferSource();
    source.buffer = buffer;
    // Небольшой разброс высоты: одинаковые удары подряд иначе слышны как эхо.
    source.playbackRate.value = 0.94 + Math.random() * 0.12;
    const gain = audio.ctx.createGain();
    gain.gain.value = Math.min(1, (GAIN[cue] ?? 0.6) * strength);
    source.connect(gain).connect(audio.master ?? audio.ctx.destination);
    source.start();
    return true;
}
