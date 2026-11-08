// 브라우저 확인: M6 — 이미지가 모두 불러와져 그려지고, 이미지가 없으면 도형으로 자동 대체된다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright, nextFrame, collectErrors, skipHints, sleep } from './helpers/server.js';

const playwright = loadPlaywright();
const SKIP = !playwright && 'playwright 없음';

/** 지상 화면에서 입구(가운데 칸) 픽셀 색 */
async function entrancePixel(page) {
  return page.evaluate(() => {
    const c = document.getElementById('view');
    const g = c.getContext('2d');
    const r = c.getBoundingClientRect();
    const dpr = c.width / r.width;
    const p = DUSTHOLD.tileToPage(60);
    return Array.from(g.getImageData(Math.round((p.x - r.left) * dpr), Math.round((p.y - r.top) * dpr), 1, 1).data);
  });
}

async function start(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await skipHints(ctx);
  if (opts.blockAssets) await ctx.route('**/assets/**', (r) => r.abort());
  const page = await ctx.newPage();
  return { ctx, page };
}

test('브라우저: 이미지 54개가 불러와지고 화면에 그려진다 (콘솔 에러 0)', { skip: SKIP, timeout: 120000 }, async () => {
  const { server, url } = await serve();
  const browser = await playwright.chromium.launch();
  try {
    const { page } = await start(browser);
    const errors = collectErrors(page);
    await page.goto(url);
    await page.waitForFunction(() => window.DUSTHOLD && DUSTHOLD.spriteStats().loaded);
    assert.deepEqual(await page.evaluate(() => DUSTHOLD.spriteStats()), { loaded: true, images: 6, sprites: 54 });
    await page.click('#btn-new');
    await page.evaluate(() => DUSTHOLD.setPaused(true));
    await sleep(200);
    // 상단 바 아이콘이 이미지 배경
    const bg = await page.$eval('#topbar .res[data-res="food"] .ico', (e) => getComputedStyle(e).backgroundImage);
    assert.ok(bg.includes('assets/icons.png'), bg);
    // 입구 칸: 도형(갈색 단색 #7a6a4c)이 아니라 이미지
    const px = await entrancePixel(page);
    assert.notDeepEqual(px.slice(0, 3), [0x7a, 0x6a, 0x4c]);
    // 벙커도 그려진다
    await page.click('[data-tab="bunker"]');
    await nextFrame(page);
    assert.deepEqual(errors, [], '콘솔 에러·요청 실패 0');
  } finally {
    await browser.close();
    server.close();
  }
});

test('브라우저: 이미지를 못 불러오면 도형으로 자동 대체되고 게임은 그대로 된다', { skip: SKIP, timeout: 120000 }, async () => {
  const { server, url } = await serve();
  const browser = await playwright.chromium.launch();
  try {
    const { page } = await start(browser, { blockAssets: true });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(url);
    await page.click('#btn-new');
    await page.evaluate(() => DUSTHOLD.setPaused(true));
    await sleep(300);
    assert.equal((await page.evaluate(() => DUSTHOLD.spriteStats())).loaded, false);
    // 입구 칸이 도형 색 그대로
    const px = await entrancePixel(page);
    assert.deepEqual(px.slice(0, 3), [0x7a, 0x6a, 0x4c], '도형 입구 색');
    // 아이콘은 CSS 도형
    const cls = await page.$eval('#topbar .res[data-res="food"] .ico', (e) => e.className);
    assert.ok(!cls.includes('ico-img'));
    // 조작도 그대로
    await page.click('[data-tab="bunker"]');
    await page.evaluate(() => DUSTHOLD.stepTicks(100));
    await page.click('[data-tab="surface"]');
    assert.deepEqual(pageErrors, [], '페이지 에러 0');
  } finally {
    await browser.close();
    server.close();
  }
});
