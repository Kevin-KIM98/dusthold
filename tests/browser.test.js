// 브라우저 확인: index.html을 실제 Chromium으로 열어 뼈대 완료 기준 5개를 본다.
// Playwright가 없으면 건너뛴다 (Node 테스트는 그래도 전부 돈다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { serve, loadPlaywright, sleep, nextFrame, collectErrors, skipHints } from './helpers/server.js';

const playwright = loadPlaywright();

test('브라우저: 뼈대 완료 기준 5개', { skip: !playwright && 'playwright 없음 — 브라우저 테스트 건너뜀', timeout: 120000 }, async (tc) => {
  const { server, url } = await serve();
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await skipHints(ctx);
  const page = await ctx.newPage();
  const errors = collectErrors(page);

  try {
    // ① 타이틀 → 게임 화면, 콘솔 에러 0건
    await page.goto(url);
    await page.waitForSelector('#title:not([hidden])');
    assert.equal(await page.isVisible('#btn-new'), true);
    assert.equal(await page.isVisible('#btn-continue'), false, '저장 없으면 이어하기 숨김');
    assert.equal(await page.isVisible('#game'), false);
    await page.click('#btn-new');
    await page.waitForSelector('#game:not([hidden])');
    assert.equal(await page.isVisible('#title'), false);
    assert.equal(await page.isVisible('#view'), true);

    // ② 상단 바 7칸, 값 바꾸면 즉시 갱신
    const ids = await page.$$eval('#topbar .res', (els) => els.map((e) => e.dataset.res));
    assert.deepEqual(ids, ['food', 'water', 'wood', 'scrap', 'power', 'parts', 'pop']);
    const vals = await page.$$eval('#topbar .res .val', (els) => els.map((e) => e.textContent));
    assert.deepEqual(vals, ['20', '20', '40', '25', '0/3', '0', '4/6']);
    await page.evaluate(() => { DUSTHOLD.state.resources.wood = 77; DUSTHOLD.state.resources.food = 1; });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.equal(await page.textContent('#topbar .res[data-res="wood"] .val'), '77');
    assert.ok(await page.$eval('#topbar .res[data-res="food"]', (e) => e.classList.contains('low')), '부족하면 low(빨간색)');

    // ③ 시계: 180초에 밤, 240초에 2일차 (틱을 직접 돌려 확인)
    assert.equal(await page.textContent('#clk-day'), '1일차');
    assert.equal(await page.textContent('#clk-time'), '06:00');
    await page.evaluate(() => { DUSTHOLD.setPaused(true); DUSTHOLD.setTick(1799); DUSTHOLD.stepTicks(1); });
    assert.equal(await page.$eval('#clk-phase', (e) => e.dataset.phase), 'night');
    assert.equal(await page.textContent('#clk-time'), '00:00');
    assert.ok((await page.textContent('#clk-count')).startsWith('새벽까지'));
    await page.evaluate(() => { DUSTHOLD.setTick(2399); DUSTHOLD.stepTicks(1); });
    assert.equal(await page.textContent('#clk-day'), '2일차');
    assert.equal(await page.$eval('#clk-phase', (e) => e.dataset.phase), 'day');

    // ④ 일시정지·배속이 실제 속도를 바꾼다 (실시간 1초씩 측정)
    const measure = async () => {
      const a = await page.evaluate(() => DUSTHOLD.state.time.tick);
      await sleep(1000);
      const b = await page.evaluate(() => DUSTHOLD.state.time.tick);
      return b - a;
    };
    await page.evaluate(() => DUSTHOLD.setPaused(true));
    assert.equal(await measure(), 0, '일시정지면 0틱');
    await page.click('[data-speed="1"]');
    const d1 = await measure();
    assert.ok(d1 >= 6 && d1 <= 14, `×1: 1초에 ${d1}틱`);
    await page.click('[data-speed="3"]');
    await nextFrame(page);
    assert.ok(await page.$eval('[data-speed="3"]', (e) => e.classList.contains('active')));
    const d3 = await measure();
    assert.ok(d3 >= 20 && d3 <= 40, `×3: 1초에 ${d3}틱`);
    assert.ok(d3 > d1 * 1.8, `×3(${d3})이 ×1(${d1})보다 확실히 빠르다`);
    await page.click('[data-speed="2"]');
    const d2 = await measure();
    assert.ok(d2 >= 13 && d2 <= 27, `×2: 1초에 ${d2}틱`);
    await page.click('[data-speed="pause"]');
    assert.equal(await measure(), 0);

    // 하단 탭 전환 + 기록 탭 내용 + 단축키
    await page.click('[data-tab="bunker"]');
    assert.equal(await page.evaluate(() => DUSTHOLD.view), 'bunker');
    await page.click('[data-tab="log"]');
    await nextFrame(page);
    assert.equal(await page.isVisible('#log-view'), true);
    assert.equal(await page.isVisible('#view'), false);
    const logText = await page.textContent('#log-view');
    assert.ok(logText.includes('밤이 왔다') && logText.includes('2일차 아침'), logText);
    await page.click('[data-tab="surface"]');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => DUSTHOLD.view), 'bunker');
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => DUSTHOLD.state.paused), false);
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => DUSTHOLD.state.paused), true);

    // 버튼 최소 44px
    const small = await page.$$eval('button', (els) => els.filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.className, w: r.width, h: r.height }; }).filter((b) => b.w < 44 || b.h < 44));
    assert.deepEqual(small, [], '44px 미만 버튼');

    // ⑤ 저장 → 새로고침 → 복원 (자동 저장 10초 + 이어하기)
    await page.evaluate(() => { DUSTHOLD.setSpeed(2); DUSTHOLD.state.resources.scrap = 55; });
    const tickBefore = await page.evaluate(() => DUSTHOLD.state.time.tick);
    const savedBefore = await page.evaluate(() => localStorage.getItem('dusthold.save.v1'));
    await sleep(10500); // 자동 저장 주기 10초
    const savedAfter = await page.evaluate(() => localStorage.getItem('dusthold.save.v1'));
    assert.ok(savedAfter && savedAfter !== savedBefore, '10초 안에 자동 저장됨');
    const saved = JSON.parse(savedAfter);
    assert.ok(saved.time.tick >= tickBefore);
    assert.equal(saved.resources.scrap, 55);
    assert.equal(saved.version, CONFIG.SAVE.VERSION);

    await page.reload();
    await page.waitForSelector('#title:not([hidden])');
    assert.equal(await page.isVisible('#btn-continue'), true, '저장 있으면 이어하기 보임');
    await page.click('#btn-continue');
    await page.waitForSelector('#game:not([hidden])');
    const restored = await page.evaluate(() => ({ tick: DUSTHOLD.state.time.tick, scrap: DUSTHOLD.state.resources.scrap, speed: DUSTHOLD.state.speed, day: document.getElementById('clk-day').textContent }));
    assert.ok(restored.tick >= saved.time.tick, '틱 복원');
    assert.equal(restored.scrap, 55);
    assert.equal(restored.speed, 2);
    assert.equal(restored.day, '2일차');
    assert.equal(await page.textContent('#topbar .res[data-res="scrap"] .val'), '55');

    // 새 게임은 저장이 있으면 두 번 눌러야 시작
    await page.reload();
    await page.waitForSelector('#title:not([hidden])');
    await page.click('#btn-new');
    assert.equal(await page.isVisible('#title'), true, '첫 탭은 확인만');
    await page.click('#btn-new');
    await page.waitForSelector('#game:not([hidden])');
    assert.equal(await page.textContent('#clk-day'), '1일차');

    assert.deepEqual(errors, [], '콘솔 에러 0건');
  } finally {
    await browser.close();
    server.close();
  }
});
