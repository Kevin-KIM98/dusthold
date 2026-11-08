// 브라우저 확인: 일차별 미션 카드 (plan v0.4)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright, nextFrame, collectErrors, skipHints } from './helpers/server.js';

const playwright = loadPlaywright();
const SKIP = !playwright && 'playwright 없음';

test('브라우저: 미션 카드 — 가이드 뒤에 뜨고, 필수·목표 표시, 경비를 세우면 "안전" 알림, 접기, 대규모 습격 전날 안내', { skip: SKIP, timeout: 120000 }, async () => {
  const { server, url } = await serve();
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await skipHints(ctx);
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  const st = (fn) => page.evaluate(fn);
  try {
    await page.goto(url);
    await page.click('#btn-new');
    await st(() => DUSTHOLD.setPaused(true));
    await nextFrame(page);
    assert.equal(await page.isVisible('#guide'), true);
    assert.equal(await page.isVisible('#missions'), false, '가이드 중엔 미션 카드 없음');
    await page.click('#gd-skip');
    await nextFrame(page);
    assert.equal(await page.isVisible('#missions'), true, '가이드를 끝내면 미션 카드');
    assert.equal(await page.textContent('#ms-title'), '1일차 미션');

    // 2일차 낮: 필수 미션(방어 화력) 미달 → 빨간 테두리
    await st(() => { DUSTHOLD.setTick(2400 + 10); DUSTHOLD.render(); });
    await nextFrame(page);
    assert.equal(await page.textContent('#ms-title'), '2일차 미션');
    const body = await page.textContent('#ms-body');
    assert.ok(body.includes('필수') && body.includes('방어 화력 0/') && body.includes('내일 아침 식량'), body);
    assert.ok(body.includes('수경재배실'), '오늘의 목표');
    assert.ok(await page.$eval('#missions', (e) => e.classList.contains('danger')));

    // 경비를 세워 필수를 채우면 "안전" 알림
    await page.evaluate(async () => {
      const B = await import('/js/sim/bunker.js');
      const S = await import('/js/sim/survivors.js');
      const s = DUSTHOLD.state;
      const gen = s.bunker.rooms.find((r) => r.type === 'generator');
      B.assignWorker(s, s.survivors[0].id, gen.id);
      for (const [f, c] of [[1, 0], [1, 6]]) {
        const g = B.debugPlaceRoom(s, 'guard', f, c);
        for (const v of s.survivors.filter(S.isAvailable).slice(0, 2)) { v.weapon = true; B.assignWorker(s, v.id, g.id); }
      }
    });
    await nextFrame(page);
    await nextFrame(page);
    assert.equal(await page.$eval('#missions', (e) => e.classList.contains('danger')), false, '필수 다 지킴');
    assert.ok((await page.textContent('#toasts')).includes('오늘 밤은 안전해요'));

    // 접기
    await page.click('#ms-head');
    await nextFrame(page);
    assert.equal(await page.isVisible('#ms-body'), false);
    assert.ok((await page.textContent('#ms-summary')).includes('필수 3/3'));
    const head = await page.$eval('#ms-head', (e) => e.getBoundingClientRect().height);
    assert.ok(head >= 44, '머리 44px 이상');
    await page.click('#ms-head');

    // 4일차: 내일 대규모 습격 안내
    await st(() => { DUSTHOLD.setTick(2400 * 3 + 10); DUSTHOLD.render(); });
    await nextFrame(page);
    assert.ok((await page.textContent('#ms-body')).includes('내일 밤은 대규모 습격'));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
