/**
 * Сборка игры в один самодостаточный файл.
 *
 *   node tools/bundle.mjs > perelom.html
 *
 * Нужна затем, что игра живёт из десятка ES-модулей и полусотни картинок, а
 * поделиться ссылкой хочется одним файлом, который откроется где угодно и
 * никуда не полезет за ресурсами. Поэтому модули склеиваются в один
 * скрипт, стили и картинки — внутрь, наружу не остаётся ни одного запроса.
 *
 * Сборка ничего не минифицирует: если в собранном файле что-то сломается,
 * его должно быть можно читать глазами.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/*
 * Список склеиваемых модулей собирается по связям, а не пишется руками.
 *
 * Руками он уже подвёл: новый `schet.js` в список не вписали, сборка
 * вышла без него — и звала три несуществующие функции. Синтаксис верный,
 * все пятьдесят восемь тестов зелёные, потому что они берут `src/`
 * напрямую. Упало бы у человека на первом нажатии.
 *
 * Обход идёт от `main.js` вглубь, порядок — от листьев к корню, чтобы
 * объявления стояли раньше вызовов. Цикл ловится и называется вслух.
 */
function собратьПорядок(корень = 'main') {
    const порядок = [];
    const состояние = new Map(); // 'идём' | 'готов'

    const обойти = (имя, путь) => {
        if (состояние.get(имя) === 'готов') return;
        if (состояние.get(имя) === 'идём') {
            throw new Error(`круг в зависимостях: ${[...путь, имя].join(' → ')}`);
        }
        состояние.set(имя, 'идём');
        const текст = read(`src/${имя}.js`);
        for (const [, сосед] of текст.matchAll(/^\s*import\s[^']*'\.\/([\w-]+)\.js'/gm)) {
            обойти(сосед, [...путь, имя]);
        }
        состояние.set(имя, 'готов');
        порядок.push(имя);
    };

    обойти(корень, []);
    return порядок;
}

const MODULES = собратьПорядок();

const MIME = { '.png': 'image/png', '.webp': 'image/webp', '.wav': 'audio/wav' };

function pack(dir) {
    const map = {};
    for (const name of readdirSync(join(ROOT, dir))) {
        const type = MIME[extname(name).toLowerCase()];
        if (!type) continue;
        map[name] = `data:${type};base64,${readFileSync(join(ROOT, dir, name)).toString('base64')}`;
    }
    return map;
}

/** Снять модульную обвязку: импорты не нужны, всё окажется в одной области. */
function flatten(source) {
    return source
        .replace(/import\s+[^;]*?from\s+'[^']*';/g, '')
        .replace(/export\s*\{[^}]*\};/g, '')
        .replace(/^export\s+/gm, '')
        .trim();
}

const art = pack('assets/art');
const sfx = pack('sfx');
const css = read('styles/game.css')
    .replace(/url\('\.\.\/assets\/art\/([^']+)'\)/g, (_, name) => `url('${art[name] ?? ''}')`);

const html = read('index.html');
const bodyStart = html.indexOf('<main class="app">');
const bodyEnd = html.indexOf('</main>') + '</main>'.length;
const markup = html.slice(bodyStart, bodyEnd);

/*
 * Счётчик берётся из `index.html`, а не пишется тут второй раз.
 *
 * Он стоит в шапке, а сборка вырезала только `<main>` — тег молча не
 * доезжал до однофайловой сборки, то есть ровно до того файла, который
 * выкладывают. Разметка была правильной, выложенное — без счётчика.
 * Копия здесь повторила бы ту же ошибку через месяц, поэтому источник один.
 */
const counter = (html.match(/<script[^>]*data-website-id[^>]*><\/script>/) ?? [''])[0];
if (!counter) throw new Error('в index.html нет тега счётчика — выкладывать нечего');

const code = MODULES.map((name) => {
    const source = flatten(read(`src/${name}.js`));
    return `/* ───────── src/${name}.js ───────── */\n${source}`;
}).join('\n\n');

/*
 * Кодировка объявляется в самом файле.
 *
 * Наш дев-сервер шлёт `charset=utf-8` заголовком, и потому сборка у нас
 * выглядела правильной. На чужом сервере без заголовка и по `file://`
 * браузер угадывает — и весь русский текст рассыпается в «РџР•Р Р•Р›РћРњ».
 * Соседняя сессия поймала это, готовя выкладку. Одна строка, и файл
 * перестаёт зависеть от того, как его отдают.
 */
process.stdout.write(`<meta charset="utf-8">
<title>ПЕРЕЛОМ</title>
<style>
${css}
</style>

${markup}

${counter}

<script type="module">
globalThis.__PERELOM_ASSETS = ${JSON.stringify(art)};
globalThis.__PERELOM_SFX = ${JSON.stringify(sfx)};

${code}
</` + `script>
`);
