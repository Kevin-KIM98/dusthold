// CLAUDE.md 기술 규칙 검사: sim은 DOM 금지, Math.random 금지, 파일 구조, index.html 참조
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
// 주석을 뺀 코드만 (규칙 설명 주석에 금지 단어가 들어갈 수 있음)
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"])\/\/.*$/gm, '$1');
const listJs = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.js')).map((f) => dir + '/' + f);

test('js/sim/** 은 document·window·canvas·localStorage를 쓰지 않는다', () => {
  for (const f of listJs('js/sim')) {
    const src = code(f);
    for (const word of ['document', 'window', 'canvas', 'localStorage', 'requestAnimationFrame']) {
      assert.ok(!new RegExp('\\b' + word + '\\b').test(src), `${f}에 ${word} 사용`);
    }
  }
});

test('Math.random()은 어디에도 없다 (연출용 fx.js 제외)', () => {
  const files = [...listJs('js'), ...listJs('js/sim'), ...listJs('js/render')].filter((f) => !f.endsWith('fx.js'));
  for (const f of files) assert.ok(!code(f).includes('Math.random'), `${f}에 Math.random`);
});

test('기획서 폴더 구조가 있다', () => {
  for (const f of [
    'index.html', 'css/style.css', 'js/main.js', 'js/config.js', 'js/strings.js', 'js/input.js',
    'js/sim/state.js', 'js/sim/time.js', 'js/sim/economy.js', 'js/sim/surface.js', 'js/sim/bunker.js', 'js/sim/raid.js', 'js/sim/rng.js',
    'js/render/surfaceView.js', 'js/render/bunkerView.js', 'js/render/fx.js', 'js/render/ui.js',
    'design/plan.md', 'design/progress.md',
  ]) assert.ok(fs.existsSync(path.join(ROOT, f)), f + ' 없음');
});

test('index.html: 모듈 스크립트, 하단 탭 3개(지상/벙커/기록), 배속 버튼 4개, 뷰포트', () => {
  const html = read('index.html');
  assert.ok(html.includes('type="module"'));
  assert.ok(html.includes('src="js/main.js"'));
  assert.ok(html.includes('name="viewport"'));
  assert.equal((html.match(/data-tab="/g) || []).length, 3);
  for (const tab of ['surface', 'bunker', 'log']) assert.ok(html.includes(`data-tab="${tab}"`));
  assert.equal((html.match(/data-speed="/g) || []).length, 4);
  assert.ok(html.includes('id="topbar"'));
  assert.ok(html.includes('<canvas id="view">'));
});

test('import 경로가 모두 실제 파일을 가리킨다', () => {
  const all = [...listJs('js'), ...listJs('js/sim'), ...listJs('js/render')];
  for (const f of all) {
    const src = read(f);
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
      const target = path.resolve(path.join(ROOT, path.dirname(f)), m[1]);
      assert.ok(fs.existsSync(target), `${f} → ${m[1]} 없음`);
    }
  }
});

test('문자열은 strings.js에 있고, 사용된 키는 전부 정의돼 있다', async () => {
  const { STRINGS } = await import('../js/strings.js');
  const all = [...listJs('js'), ...listJs('js/sim'), ...listJs('js/render')].filter((f) => !f.endsWith('strings.js'));
  for (const f of all) {
    for (const m of read(f).matchAll(/\bt\('([a-zA-Z.]+)'\s*[,)]/g)) {
      assert.ok(STRINGS.ko[m[1]] !== undefined, `${f}: 문자열 키 ${m[1]} 없음`);
    }
  }
});

test('package.json에 런타임 의존성이 없다 (빌드 도구 금지)', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0);
  assert.ok(!pkg.devDependencies || Object.keys(pkg.devDependencies).length === 0);
  assert.equal(pkg.type, 'module');
});
