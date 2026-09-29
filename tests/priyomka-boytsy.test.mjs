import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function run(...args) {
    const result = spawnSync('node', ['tools/priyomka-boytsy.mjs', ...args], { encoding: 'utf8' });
    return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

test('пара бойцов принята на карточке и на мелком чек-размере', () => {
    const { code, out } = run();
    assert.equal(code, 0, out);
    assert.match(out, /карточка 272 px/);
    assert.match(out, /мелкий чек 40 px/);
    // 8 частей на каждый масштаб — разбивка, а не одно среднее.
    assert.equal((out.match(/^  [^\n]+: ΔE /gm) ?? []).length, 16, out);
    assert.match(out, /Пара принята/);
});

test('одинаковые файлы — обязательный красный исход измерителя', () => {
    const { code, out } = run('--одинаковые');
    assert.equal(code, 1, out);
    assert.match(out, /НЕ ПРИНЯТО/);
});
