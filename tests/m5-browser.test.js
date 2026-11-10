// M5 화면 테스트: 효과음·음소거 · 바닥 화살표 · 실제 페이지에서 한 판 끝까지(자동 플레이)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, loadBalance } from './helpers.js';
import { skip, openGame } from './browser.js';
import { createState } from '../js/sim/state.js';
import { playGame } from './bot.js';

let game, page, errors;
before(async () => {
  if (skip) return;
  game = await openGame('?seed=1');
  ({ page, errors } = game);
  await mkdir(join(ROOT, 'test-results'), { recursive: true });
});
after(async () => { if (game) await game.close(); });

test('바닥 화살표가 다음 목표(처음엔 은화 더미)를 가리키고, 도착하면 사라진다', { skip }, async () => {
  const arrows = () => page.evaluate(() => {
    let n = 0, m = false;
    __game.view.scene.traverse(o => { if (o.name === 'guideArrows') n = o.count; if (o.name === 'guideMarker') m = o.visible; });
    return { n, m };
  });
  await page.evaluate(() => { const c = __game.state.commander; c.x = c.prevX = -4; c.z = c.prevZ = 8; });
  await page.waitForTimeout(800);
  const a = await arrows();
  assert.ok(a.n >= 1 && a.m, `화살표 ${a.n}, 표시 ${a.m}`);
  await page.screenshot({ path: join(ROOT, 'test-results/m5-guide-coins.png') });
  // 은화를 다 주우면 막사 패드를 가리킨다
  await page.evaluate(() => { const s = __game.state; s.commander.coins = 25; s.coins = []; });
  await page.waitForTimeout(300);
  const target = await page.evaluate(async () => (await import('./js/sim/guide.js')).guideTarget(__game.state, __game.balance));
  assert.equal(target.id, 'barracks');
  await page.screenshot({ path: join(ROOT, 'test-results/m5-guide-pad.png') });
  await page.evaluate(([x, z]) => { const c = __game.state.commander; c.x = c.prevX = x; c.z = c.prevZ = z; }, [target.x, target.z]);
  await page.waitForTimeout(200);
  const b = await arrows();
  assert.equal(b.n, 0, '목표에 서 있으면 화살표 없음');
});

test('효과음: 줍기·납부·해금·타격·적 기지 점령(나팔)에 소리가 나고, 음소거 버튼이 동작한다', { skip }, async () => {
  // 첫 터치로 소리 켜짐
  await page.mouse.click(100, 600);
  await page.waitForFunction(() => __game.sound.stats().ready, null, { timeout: 3000 });
  await page.evaluate(async () => {
    const s = __game.state;
    const { spawnCoin } = await import('./js/sim/coins.js');
    const { spawnEnemy } = await import('./js/sim/units.js');
    s.coins = []; s.commander.coins = 20;
    const tp = s.pads.find(p => p.id === 'taxTable'); // 막사는 앞 테스트에서 해금됨 → 세금 탁자 패드
    const c = s.commander;
    c.x = c.prevX = tp.x; c.z = c.prevZ = tp.z;
    spawnCoin(s, c.x + 0.5, c.z, false, __game.balance);
    const e = spawnEnemy(s, 'raider', 'south', __game.balance);
    e.x = e.prevX = c.x + 1; e.z = e.prevZ = c.z + 0.5; e.wp = 99;
  });
  await page.waitForTimeout(1500); // 줍기 + 납부(막사 6) + 해금 + 타격
  await page.evaluate(() => { __game.state.camps[0].hp = 0; }); // 적 기지 점령 → 나팔
  await page.waitForFunction(() => __game.state.camps[0].captured, null, { timeout: 3000 });
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => __game.sound.stats());
  for (const k of ['pickup', 'pay', 'unlock', 'hit', 'wave']) assert.ok(st[k] > 0, `${k} 소리 ${JSON.stringify(st)}`);
  // 음소거 버튼: 44px 이상, 누르면 켜짐/꺼짐 전환·기억
  const box = await page.$eval('.btn.mute', el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; });
  assert.ok(box.w >= 44 && box.h >= 44, `버튼 크기 ${JSON.stringify(box)}`);
  assert.equal(await page.$eval('.btn.mute', el => el.getAttribute('aria-pressed')), 'false');
  await page.click('.btn.mute');
  assert.equal(await page.evaluate(() => __game.sound.isMuted()), true);
  assert.equal(await page.$eval('.btn.mute', el => el.getAttribute('aria-pressed')), 'true');
  assert.equal(await page.evaluate(() => localStorage.getItem('lastgate.muted')), '1');
  await page.click('.btn.mute');
  assert.equal(await page.evaluate(() => __game.sound.isMuted()), false);
  assert.deepEqual(errors, []);
});

test('실제 페이지에서 한 판을 끝까지(자동 플레이) — 결과 화면까지, Node 결과와 같다', { skip, timeout: 420000 }, async () => {
  const B = loadBalance();
  const seed = 5;
  const expect = playGame(createState, B, seed, 900);
  const g = await openGame(`?seed=${seed}&fast=40`);
  try {
    // 자동 플레이어를 붙이면서 같은 작업 안에서 상태를 처음으로 되돌림 → Node와 같은 출발점
    await g.page.evaluate(async () => {
      const { botInput } = await import('./tests/bot.js');
      const { createState } = await import('./js/sim/state.js');
      const s = __game.state;
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, createState(__game.balance, 5));
      __game.inputOverride = () => botInput(__game.state, __game.balance);
    });
    await g.page.waitForSelector('.result:not(.hidden)', { timeout: 400000 });
    const got = await g.page.evaluate(() => ({ result: __game.state.result, tick: __game.state.tick, title: document.querySelector('.r-title').textContent }));
    await g.page.screenshot({ path: join(ROOT, 'test-results/m5-fullgame.png') });
    console.log(`  페이지 자동 플레이: ${got.result} (${got.tick}틱) / Node: ${expect.result} (${expect.tick}틱)`);
    assert.equal(got.result, expect.result);
    assert.equal(got.tick, expect.tick, '같은 틱에 끝남');
    assert.equal(got.title, expect.result === 'win' ? '스테이지 1 클리어!' : '성채가 무너졌어요');
    assert.deepEqual(g.errors, []);
  } finally { await g.close(); }
});
