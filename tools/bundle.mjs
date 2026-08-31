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

/** Порядок склейки = порядок зависимостей. Циклов в проекте нет. */
const MODULES = ['rng', 'rules', 'body', 'physics', 'poses', 'sprites', 'audio', 'fight', 'ai', 'render', 'main'];

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

const code = MODULES.map((name) => {
    const source = flatten(read(`src/${name}.js`));
    return `/* ───────── src/${name}.js ───────── */\n${source}`;
}).join('\n\n');

process.stdout.write(`<title>ПЕРЕЛОМ</title>
<style>
${css}
</style>

${markup}

<script type="module">
globalThis.__PERELOM_ASSETS = ${JSON.stringify(art)};
globalThis.__PERELOM_SFX = ${JSON.stringify(sfx)};

${code}
</` + `script>
`);
