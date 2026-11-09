// M3 화면 테스트: 웨이브 표시·적 등장 · 궁수 따라다니기 · 전투 연출 · 쓰러짐/부활 · 최악 장면 성능 상한
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './helpers.js';
import { skip, openGame } from './browser.js';

let game, page, errors;
before(async () => {
  if (skip) return;
  game = await openGame('?seed=1&fast');
  ({ page, errors } = game);
  await mkdir(join(ROOT, 'test-results'), { recursive: true });
});
after(async () => { if (game) await game.close(); });

const teleport = (x, z) => page.evaluate(([x, z]) => { const c = __game.state.commander; c.x = c.prevX = x; c.z = c.prevZ = z; }, [x, z]);
/** 이름(부위 개수 기준)으로 InstancedMesh 그려진 수 찾기 — maxEnemies 크기 메시 중 최대 */
const drawn = (cap) => page.evaluate(cap => {
  let k = 0;
  __game.view.scene.traverse(o => { if (o.isInstancedMesh && o.instanceMatrix.count === cap) k = Math.max(k, o.count); });
  return k;
}, cap);

test('웨이브 표시가 뜨고, 25초 뒤 첫 웨이브가 길을 따라 나타난다', { skip }, async () => {
  const txt = await page.$eval('.wave-n', el => el.textContent);
  assert.equal(txt, '웨이브 0/10');
  assert.match(await page.$eval('.wave-t', el => el.textContent), /적이 와요 \d+초/);
  await page.waitForFunction(() => __game.state.waves.current === 1, null, { timeout: 30000 });
  assert.equal(await page.$eval('.wave-n', el => el.textContent), '웨이브 1/10');
  assert.equal(await page.$eval('.banner', el => el.classList.contains('hidden')), false, '웨이브 시작 알림');
  await page.waitForFunction(() => __game.state.enemies.length >= 3, null, { timeout: 10000 });
  const enemiesDrawn = await page.evaluate(() => { let k = 0; __game.view.scene.traverse(o => { if (o.name === 'raider' || o.name === 'shield') k += o.count; }); return k; });
  assert.ok(enemiesDrawn >= 3, '적 모델이 그려짐');
  // 남쪽 길에서 오는 적을 보러 카메라 이동
  const e = await page.evaluate(() => ({ x: __game.state.enemies[0].x, z: __game.state.enemies[0].z }));
  await teleport(e.x - 4, e.z - 4);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(ROOT, 'test-results/m3-wave.png') });
});

test('모집 패드를 해금하면 궁수 3명이 생겨 성주를 따라다닌다', { skip }, async () => {
  await page.evaluate(() => { __game.state.commander.coins = 60; });
  const bp = await page.evaluate(() => __game.state.pads.find(p => p.id === 'barracks'));
  await teleport(bp.x, bp.z);
  await page.waitForFunction(() => __game.state.unlocked.barracks, null, { timeout: 5000 });
  const rp = await page.evaluate(() => __game.state.pads.find(p => p.id === 'recruit'));
  await teleport(rp.x, rp.z);
  await page.waitForFunction(() => __game.state.archers.length === 3, null, { timeout: 5000 });
  const archersDrawn = await page.evaluate(() => { let k = -1; __game.view.scene.traverse(o => { if (o.name === 'archer') k = o.count; }); return k; });
  assert.equal(archersDrawn, 3, '궁수 3명 그려짐');
  await page.keyboard.down('s'); await page.waitForTimeout(600); await page.keyboard.up('s');
  await page.waitForTimeout(800);
  const far = await page.evaluate(() => Math.max(...__game.state.archers.map(a => Math.hypot(a.x - __game.state.commander.x, a.z - __game.state.commander.z))));
  assert.ok(far < 4.5, `궁수가 성주 근처 ${far}`);
});

test('궁수·성주가 적을 자동 공격 → 화살·데미지 숫자, 처치하면 은화가 떨어진다', { skip }, async () => {
  const kills0 = await page.evaluate(() => __game.state.kills);
  // 가장 가까운 적 앞으로
  await page.evaluate(async () => {
    const s = __game.state, c = s.commander;
    const { spawnEnemy } = await import('./js/sim/units.js');
    const e = spawnEnemy(s, 'shield', 'south', __game.balance);
    c.x = c.prevX = 2; c.z = c.prevZ = 18;
    e.x = e.prevX = 5; e.z = e.prevZ = 20;
    s.archers.forEach(a => { a.x = a.prevX = c.x; a.z = a.prevZ = c.z - 1; });
  });
  let sawArrow = false, sawDmg = false;
  for (let i = 0; i < 40 && !(sawArrow && sawDmg); i++) {
    await page.waitForTimeout(100);
    const maxArrows = await page.evaluate(() => __game.balance.render.maxArrows);
    sawArrow = sawArrow || (await drawn(maxArrows)) > 0;
    sawDmg = sawDmg || await page.$$eval('.dmg', els => els.some(el => el.style.display !== 'none'));
  }
  assert.ok(sawArrow, '화살이 날아감');
  assert.ok(sawDmg, '데미지 숫자');
  await page.screenshot({ path: join(ROOT, 'test-results/m3-fight.png') });
  await page.waitForFunction(k => __game.state.kills > k, kills0, { timeout: 15000 });
  assert.ok(await page.evaluate(() => __game.state.coins.length) > 0, '은화가 떨어짐');
});

test('성주가 쓰러지면 안내가 뜨고 모습이 사라졌다가 5초 뒤 부활한다', { skip }, async () => {
  await page.evaluate(async () => {
    const s = __game.state, c = s.commander;
    const { spawnEnemy } = await import('./js/sim/units.js');
    c.hp = 1; c.cooldown = 1e9;
    s.archers.forEach(a => { a.cooldown = 1e9; });
    const e = spawnEnemy(s, 'shield', 'south', __game.balance);
    e.x = e.prevX = c.x + 1; e.z = e.prevZ = c.z;
  });
  await page.waitForFunction(() => !__game.state.commander.alive, null, { timeout: 8000 });
  await page.waitForTimeout(150);
  assert.equal(await page.$eval('.down', el => el.classList.contains('hidden')), false, '쓰러짐 안내');
  assert.match(await page.$eval('.down', el => el.textContent), /초 뒤 부활/);
  assert.equal(await page.evaluate(() => __game.view.commanderObject.visible), false);
  await page.waitForFunction(() => __game.state.commander.alive, null, { timeout: 8000 });
  await page.waitForTimeout(150);
  assert.equal(await page.$eval('.down', el => el.classList.contains('hidden')), true);
  assert.equal(await page.evaluate(() => __game.view.commanderObject.visible), true);
  assert.deepEqual(errors, []);
});

test('최악 장면(?worst)도 draw call ≤150, 삼각형 ≤20만, 에러 0', { skip }, async () => {
  const w = await openGame('?seed=1&worst');
  try {
    await w.page.waitForTimeout(1500);
    const info = await w.page.evaluate(() => {
      const r = __game.view.renderer.info.render;
      return { calls: r.calls, tris: r.triangles, enemies: __game.state.enemies.length, archers: __game.state.archers.length, coins: __game.state.coins.length, carried: __game.state.commander.coins };
    });
    await w.page.screenshot({ path: join(ROOT, 'test-results/m3-worst.png') });
    console.log('  최악 장면:', JSON.stringify(info));
    assert.ok(info.enemies >= 40 && info.archers >= 20 && info.coins >= 100, '최악 장면 구성 (망루가 일부 처치)');
    assert.ok(info.calls <= 150, `draw call ${info.calls}`);
    assert.ok(info.tris <= 200000, `삼각형 ${info.tris}`);
    assert.ok(await w.page.$eval('.fps', el => /FPS \d+/.test(el.textContent)), 'FPS 표시');
    assert.deepEqual(w.errors, []);
  } finally { await w.close(); }
});
