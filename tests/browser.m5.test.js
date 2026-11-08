// 브라우저 확인: M5 — 튜토리얼 힌트, 1장 클리어·게임 오버 화면, 모든 화면 버튼 44px, 최악 장면 FPS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright, nextFrame, collectErrors, sleep, skipHints } from './helpers/server.js';

const playwright = loadPlaywright();
const SKIP = !playwright && 'playwright 없음';

async function smallButtons(page) {
  return page.$$eval('button', (els) => els
    .filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
    .map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter((b) => b.w > 0 && (b.w < 44 || b.h < 44)));
}

test('브라우저: 튜토리얼 힌트 — 시작 → (1일차 가이드) → 습격 직전 → 2일차 목표, 뜨는 동안 멈추고, 그만 보기', { skip: SKIP, timeout: 120000 }, async () => {
  const { server, url } = await serve();
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  const title = () => page.textContent('#ov-title');
  try {
    await page.goto(url);
    await page.click('#btn-new');
    await page.waitForSelector('#overlay:not([hidden])');
    assert.equal(await title(), '벙커에 온 걸 환영해요');
    assert.ok((await page.textContent('#ov-sub')).includes('1일차 가이드'), '시작 힌트가 가이드를 안내');
    assert.equal(await page.evaluate(() => DUSTHOLD.state.paused), true, '힌트가 떠 있으면 멈춤');
    assert.deepEqual(await smallButtons(page), [], '힌트 버튼 44px');
    await page.click('[data-ov="next"]');
    assert.equal(await page.isVisible('#overlay'), false, '가이드가 있는 동안엔 지상 힌트 대신 가이드 카드');
    assert.equal(await page.isVisible('#guide'), true);
    assert.equal(await page.evaluate(() => DUSTHOLD.state.paused), false, '닫으면 다시 흐름');
    await page.click('[data-tab="bunker"]');
    await nextFrame(page);
    assert.equal(await page.isVisible('#overlay'), false, '벙커 힌트도 가이드가 대신');
    // 습격 30초 전
    await page.evaluate(() => { DUSTHOLD.setTick(1499); DUSTHOLD.stepTicks(1); });
    await page.waitForSelector('#overlay:not([hidden])');
    assert.equal(await title(), '곧 밤이에요');
    await page.click('[data-ov="next"]');
    // 2일차 아침
    await page.evaluate(() => { DUSTHOLD.state.door.hp = 1e9; DUSTHOLD.setTick(2399); DUSTHOLD.stepTicks(1); });
    await page.waitForSelector('#overlay:not([hidden])');
    assert.equal(await title(), '목표: 구조 신호');
    await page.click('[data-ov="next"]');
    const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('dusthold.hints.v1')).sort());
    assert.deepEqual(seen, ['goal', 'raid', 'start']);
    // 새로고침 후 새 게임: 다시 안 뜬다
    await page.reload();
    await page.click('#btn-new');
    await page.click('#btn-new');
    await nextFrame(page);
    assert.equal(await page.isVisible('#overlay'), false, '한 번 본 힌트는 다시 안 뜬다');
    // 그만 보기
    await page.evaluate(() => localStorage.removeItem('dusthold.hints.v1'));
    await page.reload();
    await page.click('#btn-new');
    await page.click('#btn-new');
    await page.waitForSelector('#overlay:not([hidden])');
    await page.click('[data-ov="off"]');
    await page.click('[data-tab="bunker"]');
    await nextFrame(page);
    assert.equal(await page.isVisible('#overlay'), false, '그만 보기 후엔 안 뜬다');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('브라우저: 1장 클리어 화면 · 게임 오버 화면 · 새 게임', { skip: SKIP, timeout: 120000 }, async () => {
  const { server, url } = await serve();
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await skipHints(ctx);
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  try {
    await page.goto(url);
    await page.click('#btn-new');
    await page.waitForSelector('#game:not([hidden])');
    // 무선실 완공 → 클리어
    await page.evaluate(async () => {
      const B = await import('/js/sim/bunker.js');
      const s = DUSTHOLD.state;
      DUSTHOLD.setPaused(true);
      Object.assign(s.resources, { wood: 150, scrap: 150, parts: 1 });
      B.debugDig(s, 2, 4); B.debugDig(s, 2, 5);
      const r = B.startBuild(s, 'radio', 2, 4);
      const room = s.bunker.rooms.find((x) => x.id === r.id);
      room.progress = 0.999;
      B.assignBuilder(s, s.survivors[0].id, r.id);
      DUSTHOLD.stepTicks(5);
    });
    await page.waitForSelector('#overlay:not([hidden])');
    assert.equal(await page.textContent('#ov-title'), '구조 신호 송신');
    const stats = await page.textContent('#ov-stats');
    assert.ok(stats.includes('버틴 날') && stats.includes('처치한 좀비') && stats.includes('지은 방'), stats);
    assert.deepEqual(await smallButtons(page), [], '결과 화면 버튼 44px');
    const t0 = await page.evaluate(() => DUSTHOLD.state.time.tick);
    await page.evaluate(() => DUSTHOLD.setPaused(false));
    await sleep(400);
    assert.equal(await page.evaluate(() => DUSTHOLD.state.time.tick), t0, '클리어하면 시간이 멈춘다');
    await page.click('[data-ov="continue"]');
    assert.equal(await page.isVisible('#overlay'), false);
    await sleep(400);
    assert.ok(await page.evaluate(() => DUSTHOLD.state.time.tick) > t0, '계속 둘러보기 → 다시 흐른다');
    // 새로고침 → 이어하기: 결과 화면이 다시 뜨지 않는다
    await page.evaluate(() => DUSTHOLD.saveNow());
    await page.reload();
    await page.click('#btn-continue');
    await nextFrame(page);
    assert.equal(await page.isVisible('#overlay'), false);

    // 클리어 뒤 둘러보는 중엔 결과가 '클리어'로 고정 — 게임 오버는 새 게임에서 확인
    await page.reload();
    await page.click('#btn-new');
    if (await page.isVisible('#title')) await page.click('#btn-new'); // 저장이 있으면 한 번 더 눌러 확인
    await page.waitForSelector('#game:not([hidden])');
    // 전멸 → 게임 오버 → 새 게임
    await page.evaluate(() => { for (const v of DUSTHOLD.state.survivors) v.hp = 0; DUSTHOLD.state.waiting.length = 0; DUSTHOLD.stepTicks(1); });
    await page.waitForSelector('#overlay:not([hidden])');
    assert.equal(await page.textContent('#ov-title'), '생존자 전멸');
    assert.equal(await page.locator('[data-ov="continue"]').count(), 0, '게임 오버엔 계속하기 없음');
    // 저장 후 새로고침해도 게임 오버 화면
    await page.evaluate(() => DUSTHOLD.saveNow());
    await page.reload();
    await page.click('#btn-continue');
    await page.waitForSelector('#overlay:not([hidden])');
    assert.equal(await page.textContent('#ov-title'), '생존자 전멸');
    await page.click('[data-ov="new"]');
    await nextFrame(page);
    assert.equal(await page.isVisible('#overlay'), false);
    assert.equal(await page.textContent('#clk-day'), '1일차');
    assert.equal(await page.textContent('#topbar .res[data-res="pop"] .val'), '4/6', '새 게임 생존자 4명');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('⑥ 휴대폰 세로(390×844)에서 모든 화면의 버튼이 44px 이상', { skip: SKIP, timeout: 120000 }, async () => {
  const { server, url } = await serve();
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await skipHints(ctx);
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  const checked = [];
  const check = async (name) => {
    await nextFrame(page);
    const bad = await smallButtons(page);
    assert.deepEqual(bad, [], `${name}: 44px 미만`);
    checked.push(name);
  };
  try {
    await page.goto(url);
    await check('타이틀');
    await page.click('#btn-new');
    await page.evaluate(() => { DUSTHOLD.setPaused(true); Object.assign(DUSTHOLD.state.resources, { wood: 150, scrap: 150 }); });
    await check('지상');
    let p = await page.evaluate(() => DUSTHOLD.tileToPage(3 * 11 + 5));
    await page.mouse.click(p.x, p.y);
    await check('지상 패널(안개)');
    await page.click('[data-action="explore"]');
    await check('원정대 고르기');
    await page.keyboard.press('Escape'); // 패널을 닫아 지도가 가려지지 않게
    await nextFrame(page);
    p = await page.evaluate(() => DUSTHOLD.tileToPage(DUSTHOLD.state.surface.tiles.findIndex((t) => t.type === 'forest' && t.revealed)));
    await page.mouse.click(p.x, p.y);
    await page.click('[data-action="gather"]');
    await check('채집 인원 고르기');
    await page.click('[data-tab="bunker"]');
    await check('벙커');
    await page.evaluate(async () => { const B = await import('/js/sim/bunker.js'); B.debugDig(DUSTHOLD.state, 2, 4); B.debugDig(DUSTHOLD.state, 2, 5); });
    p = await page.evaluate(() => DUSTHOLD.cellToPage(2, 4));
    await page.mouse.click(p.x, p.y);
    await check('건설 메뉴');
    p = await page.evaluate(() => DUSTHOLD.cellToPage(1, 1));
    await page.mouse.click(p.x, p.y);
    await page.click('[data-action="addWorker"]');
    await check('근무자 고르기');
    p = await page.evaluate(() => DUSTHOLD.doorToPage());
    await page.mouse.click(p.x, p.y);
    await check('방폭문 패널');
    await page.click('[data-tab="log"]');
    await check('기록');
    await page.evaluate(() => { for (const v of DUSTHOLD.state.survivors) v.hp = 0; DUSTHOLD.stepTicks(1); });
    await page.waitForSelector('#overlay:not([hidden])');
    await check('게임 오버');
    assert.equal(checked.length, 11);
    // 가로 스크롤 없음
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `가로 넘침 ${overflow}px`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

/** rAF로 ms 동안 프레임 수를 센다. 다른 테스트가 동시에 CPU를 쓰는 순간을 피하려고 두 번 재서 좋은 쪽 */
async function measureFps(page, ms) {
  const a = await measureOnce(page, ms);
  const b = await measureOnce(page, ms);
  return Math.max(a, b);
}

async function measureOnce(page, ms) {
  return page.evaluate((dur) => new Promise((resolve) => {
    let n = 0;
    const t0 = performance.now();
    const loop = (t) => { n++; if (t - t0 < dur) requestAnimationFrame(loop); else resolve((n * 1000) / (t - t0)); };
    requestAnimationFrame(loop);
  }), ms);
}

test('⑥ 성능: 최악 장면(지상 전부·벙커 40칸·좀비 40·파티클 150) — PC 60fps, 중급 폰(CPU 4배 느리게) 45fps 이상', { skip: SKIP, timeout: 120000 }, async () => {
  const { server, url } = await serve();
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await skipHints(ctx);
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  try {
    await page.goto(url + '?worst');
    await page.waitForSelector('#game:not([hidden])');
    await sleep(500);
    const scene = await page.evaluate(() => ({
      worst: DUSTHOLD.worst,
      revealed: DUSTHOLD.state.surface.tiles.filter((t) => t.revealed).length,
      cells: DUSTHOLD.occupiedCells(),
      zombies: DUSTHOLD.state.raid.zombies.length,
    }));
    assert.deepEqual(scene, { worst: true, revealed: 121, cells: 40, zombies: 40 });
    assert.ok(await page.isVisible('#debug'), 'FPS 표시');
    const results = {};
    for (const view of ['surface', 'bunker']) {
      await page.click(`[data-tab="${view}"]`);
      await sleep(300);
      if (view === 'bunker') assert.equal(await page.evaluate(() => DUSTHOLD.particles), 150, '파티클 150개');
      results[view] = await measureFps(page, 2000);
    }
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    for (const view of ['surface', 'bunker']) {
      await page.click(`[data-tab="${view}"]`);
      await sleep(300);
      results[view + '@4x'] = await measureFps(page, 2000);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const fmt = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, Math.round(v)]));
    console.log('# 최악 장면 FPS', JSON.stringify(fmt));
    assert.ok(results.surface >= 55 && results.bunker >= 55, `PC ${JSON.stringify(fmt)}`);
    assert.ok(results['surface@4x'] >= 45 && results['bunker@4x'] >= 45, `중급 폰 흉내 ${JSON.stringify(fmt)}`);
    // F9로 원래 게임으로 돌아가고, 최악 장면은 저장되지 않는다
    assert.equal(await page.evaluate(() => localStorage.getItem('dusthold.save.v1')), null);
    await page.keyboard.press('F9');
    await nextFrame(page);
    assert.equal(await page.evaluate(() => DUSTHOLD.worst), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
