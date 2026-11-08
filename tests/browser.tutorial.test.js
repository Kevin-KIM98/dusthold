// 브라우저 확인: 1일차 가이드를 실제로 탭해서 끝까지 따라간다 (plan v0.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright, nextFrame, collectErrors, skipHints } from './helpers/server.js';

const playwright = loadPlaywright();
const SKIP = !playwright && 'playwright 없음';

test('브라우저: 1일차 가이드 7단계를 탭으로 끝까지 — 깜빡이는 탭·버튼, 잘했어요, 끝나면 카드가 사라진다', { skip: SKIP, timeout: 120000 }, async () => {
  const { server, url } = await serve();
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await skipHints(ctx); // 힌트 카드 말고 가이드만 본다
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  const st = (fn, arg) => page.evaluate(fn, arg);
  const guideTitle = () => page.textContent('#gd-title');
  const step = async (n) => {
    await st(() => DUSTHOLD.stepTicks(1));
    await nextFrame(page);
    assert.equal(await guideTitle(), `1일차 가이드 ${n}/7`);
  };
  const tapCell = async (f, c) => {
    const p = await st(([a, b]) => DUSTHOLD.cellToPage(a, b), [f, c]);
    await page.mouse.click(p.x, p.y);
    await nextFrame(page);
  };
  const tapTile = async (i) => {
    const p = await st((k) => DUSTHOLD.tileToPage(k), i);
    await page.mouse.click(p.x, p.y);
    await nextFrame(page);
  };
  const pulsing = (sel) => page.$eval(sel, (e) => e.classList.contains('pulse'));

  try {
    await page.goto(url);
    await page.click('#btn-new');
    await page.waitForSelector('#game:not([hidden])');
    await st(() => DUSTHOLD.setPaused(true));
    await nextFrame(page);
    assert.equal(await page.isVisible('#guide'), true, '가이드 카드');
    assert.equal(await guideTitle(), '1일차 가이드 1/7');
    assert.ok((await page.textContent('#gd-body')).includes('발전실'));
    assert.equal(await pulsing('[data-tab="bunker"]'), true, '벙커 탭이 깜빡인다');

    // 1. 발전실
    await page.click('[data-tab="bunker"]');
    await nextFrame(page);
    assert.equal(await pulsing('[data-tab="bunker"]'), false, '이미 벙커면 탭은 안 깜빡임');
    await tapCell(1, 1);
    assert.equal(await pulsing('[data-action="addWorker"]'), true, '+ 배치가 깜빡인다');
    await page.click('[data-action="addWorker"]');
    await page.locator('[data-action="assign"]').nth(0).click();
    await step(2);
    assert.ok((await page.textContent('#toasts')).includes('잘했어요'));
    // 2. 정수실
    await tapCell(1, 4);
    await page.click('[data-action="addWorker"]');
    await page.locator('[data-action="assign"]').nth(0).click();
    await step(3);
    // 3. 굴착
    await tapCell(1, 6);
    assert.equal(await pulsing('[data-action="dig"]'), true);
    await page.click('[data-action="dig"]');
    await page.locator('[data-action="assign"]').nth(0).click();
    await step(4);
    assert.equal(await pulsing('[data-tab="surface"]'), true, '지상 탭이 깜빡인다');
    // 4. 탐험
    await page.click('[data-tab="surface"]');
    await nextFrame(page);
    await tapTile(3 * 11 + 5);
    assert.equal(await pulsing('[data-action="explore"]'), true);
    await page.click('[data-action="explore"]');
    await page.locator('[data-action="pick"]').nth(0).click();
    await page.click('[data-action="depart"]');
    await step(5);
    // 5. 경비실 (굴착이 끝난 뒤)
    await page.click('[data-tab="bunker"]');
    await st(() => DUSTHOLD.stepTicks(120));
    await tapCell(1, 6);
    assert.equal(await pulsing('[data-action="build"][data-arg="guard"]'), true, '경비실 버튼이 깜빡인다');
    await page.click('[data-action="build"][data-arg="guard"]');
    await page.locator('[data-action="assign"]').nth(0).click();
    await step(6);
    assert.ok((await page.textContent('#gd-extra')).includes('공사가 끝나기를'), '기다리라는 안내');
    // 6. 경비 세우기
    await st(() => DUSTHOLD.stepTicks(250));
    await tapCell(1, 6);
    await page.click('[data-action="addWorker"]');
    await page.locator('[data-action="assign"]').nth(0).click();
    await step(7);
    // 7. 폐허 채집 (원정대가 돌아올 때까지)
    await st(() => DUSTHOLD.stepTicks(300));
    await page.click('[data-tab="surface"]');
    await nextFrame(page);
    const ruins = await st(() => DUSTHOLD.state.surface.tiles.findIndex((t) => t.type === 'ruins' && t.revealed));
    await tapTile(ruins);
    await page.click('[data-action="gather"]');
    await page.locator('[data-action="assign"]').nth(0).click();
    await st(() => DUSTHOLD.stepTicks(1));
    await nextFrame(page);
    assert.equal(await page.isVisible('#guide'), false, '끝나면 카드가 사라진다');
    assert.ok((await page.textContent('#toasts')).includes('첫날 준비 끝'));
    assert.equal(await st(() => DUSTHOLD.state.tutorial.done), true);
    assert.ok(await st(() => DUSTHOLD.state.time.tick < 1800), '첫날 낮 안에 끝');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('브라우저: 가이드 건너뛰기 (버튼 44px), 이어하기 때 진행 단계 유지', { skip: SKIP, timeout: 120000 }, async () => {
  const { server, url } = await serve();
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await skipHints(ctx);
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  try {
    await page.goto(url);
    await page.click('#btn-new');
    await page.evaluate(() => DUSTHOLD.setPaused(true));
    await nextFrame(page);
    // 1단계를 하고 저장 → 새로고침 → 이어하기: 2단계부터
    await page.evaluate(async () => {
      const B = await import('/js/sim/bunker.js');
      const s = DUSTHOLD.state;
      B.assignWorker(s, s.survivors[0].id, s.bunker.rooms.find((r) => r.type === 'generator').id);
      DUSTHOLD.stepTicks(1);
      DUSTHOLD.saveNow();
    });
    await page.reload();
    await page.click('#btn-continue');
    await page.evaluate(() => DUSTHOLD.setPaused(true));
    await nextFrame(page);
    assert.equal(await page.textContent('#gd-title'), '1일차 가이드 2/7');
    const box = await page.$eval('#gd-skip', (e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; });
    assert.ok(box.w >= 44 && box.h >= 44, `건너뛰기 버튼 ${box.w}x${box.h}`);
    await page.click('#gd-skip');
    await nextFrame(page);
    assert.equal(await page.isVisible('#guide'), false);
    assert.ok((await page.textContent('#toasts')).includes('건너뛰었어요'));
    await page.reload();
    await page.click('#btn-continue');
    await nextFrame(page);
    assert.equal(await page.isVisible('#guide'), false, '건너뛴 게 저장된다');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
