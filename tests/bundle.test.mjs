/*
 * Проверка выкладываемого файла, а не исходников.
 *
 * Однофайловая сборка — это то единственное, что видит человек. Исходники
 * могут быть безупречны, а до него доедет другое: сборка вырезает из
 * `index.html` только `<main>`, поэтому всё, что стоит в шапке, теряется
 * молча. Ровно так пропал счётчик — тег в разметке был, в выкладке его не
 * было, и обе половины выглядели сделанными.
 *
 * Поэтому спрашиваем собранный файл, а не тот, куда удобно писать.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = execFileSync('node', [join(root, 'tools/bundle.mjs')], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
});

test('сборка объявляет кодировку до первого русского слова', () => {
    const charset = bundle.indexOf('<meta charset="utf-8">');
    const title = bundle.indexOf('ПЕРЕЛОМ');
    assert.ok(charset >= 0, 'нет объявления кодировки — на чужом сервере текст рассыплется');
    assert.ok(charset < title, 'кодировка объявлена позже русского текста');
});

test('сборка несёт счётчик событий', () => {
    assert.match(bundle, /data-website-id="de024048-c4c3-4639-bbdf-808c558f6d71"/,
        'счётчик потерялся по дороге из index.html в выкладку');
    assert.match(bundle, /src="\/pulse\/script\.js"/,
        'путь к счётчику должен быть от корня сайта: stats.aka-gst.ru снаружи отдаёт 404');
});

test('из сборки можно выйти на главную', () => {
    assert.match(bundle, /class="site-home"/, 'нет кнопки «на главную»');
});

test('в сборку не уехали рабочие записи', () => {
    for (const след of ['ФИНИШ', 'CLAUDE.md', 'docs/JUGGLE']) {
        assert.ok(!bundle.includes(след), `в выкладке оказалось внутреннее: ${след}`);
    }
});
