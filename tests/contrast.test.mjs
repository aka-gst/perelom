import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function run(...args) {
    const result = spawnSync('node', ['tools/contrast.mjs', ...args], { encoding: 'utf8' });
    return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

test('измеритель сравнивает все восемь частей на ширине карточки', () => {
    const { code, out } = run();
    assert.equal(code, 0, out);
    assert.match(out, /масштаб: 272 \/ 960/);
    assert.equal((out.match(/^  [^\n]+: RGB /gm) ?? []).length, 8, out);
    assert.match(out, /худшая в сером:/);
    assert.match(out, /лучшая в сером:/);
    assert.match(out, /в сером ухудшились:/);
});

test('одинаковые наборы — обязательный красный исход измерителя', () => {
    const { code, out } = run('--одинаковые');
    assert.equal(code, 1, out);
    assert.match(out, /НЕ РАЗЛИЧАЮТСЯ/);
});
