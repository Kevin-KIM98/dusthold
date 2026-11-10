// M4 화면 테스트: 성벽·성문 · 망루 궁수 · 승리/패배 화면 · 다시 하기
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './helpers.js';
import { skip, openGame } from './browser.js';

let game, page, errors;
before(async () => {
  if (skip) return;
  game = await openGame('?seed=1');
  ({ page, errors } = game);
  await mkdir(join(ROOT, 'test-results'), { recursive: true });
});
after(async () => { if (game) await game.close(); });

const teleport = (x, z) => page.evaluate(([x, z]) => { const c = __game.state.commander; c.x = c.prevX = x; c.z = c.prevZ = z; }, [x, z]);
const padVisible = id => page.$eval(`.pad-label[data-pad="${id}"]`, el => el.style.display !== 'none').catch(() => false);
const instCount = cap => page.evaluate(cap => {
  let k = 0; __game.view.scene.traverse(o => { if (o.isInstancedMesh && o.instanceMatrix.count === cap) k += o.count; }); return k;
}, cap);

test('성벽 패드를 해금하면 목책과 성문이 나타나고 망루 패드가 열린다', { skip }, async () => {
  await page.evaluate(() => { const s = __game.state; s.spawn.paused = true; s.unlocked.barracks = s.unlocked.taxTable = true; s.commander.coins = 100; });
  await page.waitForTimeout(200);
  assert.equal(await padVisible('walls'), true, '성벽 패드 보임');
  const p = await page.evaluate(() => __game.state.pads.find(p => p.id === 'walls'));
  await teleport(p.x, p.z);
  await page.waitForFunction(() => __game.state.unlocked.walls, null, { timeout: 8000 });
  await page.waitForTimeout(300);
  const posts = await instCount(await page.evaluate(() => __game.balance.render.maxWallPosts));
  assert.ok(posts > 100, `목책 기둥 ${posts}`);
  for (const id of ['tower1', 'tower2', 'tower3', 'tower4']) assert.equal(await page.evaluate(id => __game.state.pads.find(p => p.id === id).open, id), true, id);
  assert.equal(await padVisible('tower1'), true, '화면 안 망루 패드 숫자 표시');
  await teleport(0, 7);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(ROOT, 'test-results/m4-walls.png') });
});

test('망루를 해금하면 궁수 4명이 올라가 적을 쏜다', { skip }, async () => {
  const p = await page.evaluate(() => __game.state.pads.find(p => p.id === 'tower1'));
  const archersDrawn = () => page.evaluate(() => { let k = 0; __game.view.scene.traverse(o => { if (o.name === 'archer') k = o.count; }); return k; });
  const before = await archersDrawn();
  await page.evaluate(() => { __game.state.commander.coins = 100; });
  await teleport(p.x, p.z);
  await page.waitForFunction(() => __game.state.buildings.some(b => b.kind === 'tower'), null, { timeout: 8000 });
  await page.waitForTimeout(300);
  assert.equal(await archersDrawn() - before, 4, '망루 위 궁수 4명');
  // 성문 밖에 적을 두고 망루가 쏘는지
  await page.evaluate(async () => {
    const { spawnEnemy } = await import('./js/sim/units.js');
    const s = __game.state;
    const t = s.buildings.find(b => b.kind === 'tower');
    const e = spawnEnemy(s, 'shield', 'south', __game.balance);
    e.x = e.prevX = t.x + 1; e.z = e.prevZ = t.z + 5;
    window.__towerTarget = e;
  });
  // 망루 화살에 맞아 체력이 줄거나 쓰러질 때까지 (한 틱짜리 이벤트를 놓치지 않도록 상태로 확인)
  await page.waitForFunction(() => __towerTarget.hp < __towerTarget.maxHp, null, { timeout: 15000 });
  await teleport(-1, 6);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(ROOT, 'test-results/m4-tower.png') });
});

test('거인이 성문 앞에 오면 성벽을 친다 (화면)', { skip }, async () => {
  await page.evaluate(async () => {
    const { spawnEnemy } = await import('./js/sim/units.js');
    const s = __game.state;
    s.buildings.filter(b => b.kind === 'tower').forEach(t => t.towerArchers.forEach(a => { a.cooldown = 1e9; }));
    const g = spawnEnemy(s, 'giant', 'south', __game.balance);
    g.x = g.prevX = -0.7; g.z = g.prevZ = 14;
    g.wp = 3;
  });
  // 거인이 성문까지 걸어와 칠 때까지 (게임 시간 기준이라 느린 화면에선 오래 걸림)
  await page.waitForFunction(() => __game.state.walls.some(w => w.hp < w.maxHp), null, { timeout: 60000 });
  await teleport(-2, 8);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(ROOT, 'test-results/m4-giant.png') });
});

test('성채 체력이 0이면 패배 화면이 뜬다', { skip }, async () => {
  await page.evaluate(() => { __game.state.castle.hp = 0; });
  await page.waitForSelector('.result:not(.hidden)', { timeout: 5000 });
  assert.equal(await page.$eval('.result .r-title', el => el.textContent), '성채가 무너졌어요');
  assert.match(await page.$eval('.result .r-wave', el => el.textContent), /버틴 시간 \d+분 \d+초/);
  await page.screenshot({ path: join(ROOT, 'test-results/m4-lose.png') });
});

test('"다시 하기"를 누르면 처음 상태로 돌아간다', { skip }, async () => {
  await page.click('.result .r-again');
  await page.waitForFunction(() => window.__game && window.__game.ready && __game.state.tick < 200, null, { timeout: 20000 });
  const castleHp = await page.evaluate(() => __game.balance.castle.hp);
  const s = await page.evaluate(() => ({
    result: __game.state.result, buildings: __game.state.buildings.length, walls: __game.state.walls.length,
    coins: __game.state.coins.length, castle: __game.state.castle.hp, wave: __game.state.camps.filter(c => c.captured).length, carried: __game.state.commander.coins,
  }));
  // 시작 은화 25개는 바닥 + 이미 주운 것(줍기 반경 5m라 바로 주워짐)
  assert.equal(s.coins + s.carried, 25, '시작 은화 25개');
  delete s.coins; delete s.carried;
  assert.deepEqual(s, { result: null, buildings: 0, walls: 0, castle: castleHp, wave: 0 });
  assert.equal(await page.$eval('.result', el => el.classList.contains('hidden')), true);
});

test('적 기지를 모두 점령하면 클리어 화면이 뜬다', { skip }, async () => {
  await page.evaluate(() => { for (const c of __game.state.camps) c.hp = 0; });
  await page.waitForSelector('.result:not(.hidden)', { timeout: 5000 });
  assert.equal(await page.$eval('.result .r-title', el => el.textContent), '스테이지 1 클리어!');
  assert.equal(await page.$eval('.result .r-wave', el => el.textContent), '적 기지 2곳 점령');
  await page.screenshot({ path: join(ROOT, 'test-results/m4-win.png') });
  assert.deepEqual(errors, []);
});

test('클리어 화면에서 "다음 판" → 스테이지 2: 건물·은화 그대로, 적 기지 새로, 성채 가득', { skip }, async () => {
  const before = await page.evaluate(() => {
    const s = __game.state;
    s.castle.hp = 100; s.commander.coins = 42;
    return { built: s.buildings.length, coins: 42 };
  });
  await page.click('.result .r-next');
  await page.waitForFunction(() => __game.state.stage === 2 && !__game.state.result, null, { timeout: 5000 });
  const after = await page.evaluate(() => ({
    built: __game.state.buildings.length, coins: __game.state.commander.coins, wave: __game.state.camps.filter(c => c.captured).length,
    castle: __game.state.castle.hp, max: __game.state.castle.maxHp,
    label: document.querySelector('.wave-s').textContent, waveText: document.querySelector('.wave-n').textContent,
    hidden: document.querySelector('.result').classList.contains('hidden'),
  }));
  assert.equal(after.built, before.built, '건물 그대로');
  assert.equal(after.coins, before.coins, '은화 그대로');
  assert.equal(after.wave, 0);
  assert.equal(after.castle, after.max, '성채 정비');
  assert.equal(after.label, '스테이지 2');
  assert.equal(after.waveText, '적 기지 점령 0/2');
  assert.equal(after.hidden, true, '결과 화면 닫힘');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(ROOT, 'test-results/stage2.png') });
  assert.deepEqual(errors, []);
});
