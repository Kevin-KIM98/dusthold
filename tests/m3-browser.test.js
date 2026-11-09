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

test('성주가 칼을 휘두르며 공격한다 (칼 움직임·칼바람·큰 노란 숫자·소리)', { skip }, async () => {
  // 일반 속도 페이지 따로 (4배속+느린 화면에선 매 프레임이 휘두르기의 같은 순간만 찍혀서 확인이 안 됨)
  const g2 = await openGame('?seed=1');
  const page = g2.page;
  try {
  await page.mouse.click(60, 700); // 소리 켜기용 첫 터치
  await page.evaluate(async () => {
    const s = __game.state, c = s.commander;
    const { spawnEnemy } = await import('./js/sim/units.js');
    s.waves.paused = true;
    // 큰 노란 숫자가 만들어지는 순간을 기록 (느린 화면에서 0.8초짜리 숫자를 놓치지 않게)
    window.__bigNums = [];
    new MutationObserver(list => {
      for (const m of list) {
        const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (el && el.classList && el.classList.contains('big')) window.__bigNums.push(el.textContent);
      }
    }).observe(document.getElementById('ui'), { subtree: true, attributes: true, attributeFilter: ['class'], childList: true, characterData: true });
    c.x = c.prevX = 0; c.z = c.prevZ = 18; c.cooldown = 0;
    const e = spawnEnemy(s, 'shield', 'south', __game.balance);
    e.x = e.prevX = 1.6; e.z = e.prevZ = 18.6; e.wp = 99;
    e.hp = e.maxHp = 1e6; // 오래 버티게 → 느린 화면에서도 휘두르는 순간이 잡히도록
    window.__swing = { min: 9, max: -9, fx: false };
    const sword = __game.view.commanderObject.getObjectByName('sword');
    const watch = () => {
      const r = sword.rotation.x; __swing.min = Math.min(__swing.min, r); __swing.max = Math.max(__swing.max, r);
      __game.view.scene.traverse(o => { if (o.name === 'slashFx' && o.visible) __swing.fx = true; });
      if (!__swing.done) requestAnimationFrame(watch);
    };
    watch();
  });
  try {
    // 칼이 평소 자세에서 움직였는지 + 칼바람 (휘두르기 곡선 자체는 m3-sim 테스트에서 정확히 확인)
    await page.waitForFunction(() => __swing.fx && __swing.max - __swing.min > 0.3, null, { timeout: 20000 });
  } catch (err) {
    const dbg = await page.evaluate(() => ({ sw: __swing, alive: __game.state.commander.alive, cd: __game.state.commander.cooldown, en: __game.state.enemies.map(e => [e.type, +e.x.toFixed(1), +e.z.toFixed(1), e.hp]), c: [__game.state.commander.x, __game.state.commander.z], paused: __game.isPaused(), result: __game.state.result }));
    throw new Error('휘두르기 안 보임 ' + JSON.stringify(dbg));
  }
  const big = await page.evaluate(() => __bigNums);
  await page.screenshot({ path: join(ROOT, 'test-results/m3-commander-attack.png') });
  await page.evaluate(() => { __swing.done = true; __game.state.enemies.forEach(e => { if (e.maxHp === 1e6) e.hp = 0; }); });
  const bal = await page.evaluate(() => __game.balance.commander.attack);
  assert.ok(big.includes(String(bal)), `큰 노란 숫자 ${bal} — ${JSON.stringify(big)}`);
  assert.ok((await page.evaluate(() => __game.sound.stats().slash)) > 0, '휘두르는 소리');
  } finally { await g2.close(); }
});

test('성주가 멀리 있는 적에게 손도끼를 던진다 (날아가는 도끼·소리·큰 노란 숫자)', { skip }, async () => {
  const g2 = await openGame('?seed=1');
  const page = g2.page;
  try {
    await page.mouse.click(60, 700); // 소리 켜기용 첫 터치
    await page.evaluate(async () => {
      const s = __game.state, c = s.commander;
      s.waves.paused = true;
      const { spawnEnemy } = await import('./js/sim/units.js');
      c.x = c.prevX = 0; c.z = c.prevZ = 18; c.cooldown = 0;
      const e = spawnEnemy(s, 'shield', 'south', __game.balance);
      e.x = e.prevX = 4.5; e.z = e.prevZ = 18; e.wp = 99; e.hp = e.maxHp = 1e6;
      window.__axe = { seen: false, hits: 0, e };
      const watch = () => {
        __game.view.scene.traverse(o => { if (o.name === 'axeFx' && o.count > 0) __axe.seen = true; });
        __axe.hits = 1e6 - e.hp;
        if (!__axe.done) requestAnimationFrame(watch);
      };
      watch();
    });
    await page.waitForFunction(() => __axe.seen && __axe.hits > 0, null, { timeout: 20000 });
    const r = await page.evaluate(() => { __axe.done = true; const h = __axe.hits; __axe.e.hp = 0; return { h, throw: __game.sound.stats().throw, d: __game.balance.commander.rangedAttack }; });
    assert.equal(r.h % r.d, 0, `손도끼 피해(${r.d})만큼씩 닳음: ${r.h}`);
    assert.ok(r.throw > 0, '던지는 소리');
  } finally { await g2.close(); }
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
