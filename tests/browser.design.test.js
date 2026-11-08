// 브라우저 확인: 화면 다듬기 — 타이틀 배경 장면, 벙커 방 이름표·화면 채우기·팔 수 있는 칸 표시
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright, nextFrame, collectErrors, skipHints } from './helpers/server.js';

const playwright = loadPlaywright();
const SKIP = !playwright && 'playwright 없음';

for (const noImg of [false, true]) {
  test(`브라우저: 타이틀 배경 장면·벙커 화면 채우기 ${noImg ? '(이미지 없이)' : ''}`, { skip: SKIP, timeout: 120000 }, async () => {
    const { server, url } = await serve();
    const browser = await playwright.chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await skipHints(ctx);
    if (noImg) await ctx.route('**/assets/**', (r) => r.abort());
    const page = await ctx.newPage();
    const errors = collectErrors(page);
    try {
      await page.goto(url);
      await page.waitForTimeout(500);
      // 타이틀: 배경 캔버스가 그려지고(하늘·흙 픽셀), 버튼은 그 위에서 눌린다
      const px = await page.evaluate(() => {
        const c = document.getElementById('title-art');
        const g = c.getContext('2d');
        const at = (fx, fy) => Array.from(g.getImageData(Math.floor(c.width * fx), Math.floor(c.height * fy), 1, 1).data);
        return { w: c.width, sky: at(0.5, 0.3), soil: at(0.05, 0.6) };
      });
      assert.ok(px.w > 0);
      assert.equal(px.sky[3], 255, '하늘이 칠해짐');
      assert.ok(px.soil[0] > px.soil[2], '흙(갈색)');
      const hit = await page.evaluate(() => {
        const b = document.getElementById('btn-new').getBoundingClientRect();
        return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2).id;
      });
      assert.equal(hit, 'btn-new', '버튼이 배경 위');

      // 벙커: 화면을 꽉 채운다 (월드 아래 빈 띠 없음), 7칸 모두 보임
      await page.click('#btn-new');
      await page.evaluate(() => DUSTHOLD.setPaused(true));
      await page.click('#gd-skip');
      await page.click('[data-tab="bunker"]');
      await nextFrame(page);
      const fit = await page.evaluate(() => {
        const c = document.getElementById('view').getBoundingClientRect();
        const left = DUSTHOLD.cellToPage(1, 0), right = DUSTHOLD.cellToPage(1, 6), deep = DUSTHOLD.cellToPage(8, 0);
        return { c: { l: c.left, r: c.right, b: c.bottom }, left: left.x, right: right.x, deep: deep.y, zoom: DUSTHOLD.bunkerCamera.zoom };
      });
      assert.ok(fit.left > fit.c.l && fit.right < fit.c.r, '맨 왼쪽·오른쪽 칸 가운데가 화면 안');
      assert.ok(fit.deep < fit.c.b, '8층까지 화면 안 (스크롤 없이)');
      assert.ok(fit.zoom > 0.85, `처음 배율이 화면 높이에 맞춰 커짐 (${fit.zoom.toFixed(2)})`);
      // 팔 수 있는 칸(1층 맨 왼쪽)을 누르면 굴착 버튼
      const p = await page.evaluate(() => DUSTHOLD.cellToPage(1, 0));
      await page.mouse.click(p.x, p.y);
      await nextFrame(page);
      assert.ok(await page.isVisible('[data-action="dig"]'), '점선 칸 = 굴착 가능');
      assert.deepEqual(errors.filter((e) => !(noImg && (e.includes('/assets/') || e.includes('ERR_FAILED')))), []);
    } finally {
      await browser.close();
      server.close();
    }
  });
}
