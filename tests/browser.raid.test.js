// 브라우저 확인: M4 습격 — 방폭문 패널에서 포탑·강화, 밤 습격, 문 파괴·고장·수리를 실제 화면으로.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { serve, loadPlaywright, nextFrame, collectErrors, skipHints } from './helpers/server.js';

const playwright = loadPlaywright();
const GEN = CONFIG.BUNKER.ROOMS.generator.perWorker;

test('브라우저: 습격 — 포탑 설치·문 강화·좀비 습격·문 파괴·방 고장·수리', { skip: !playwright && 'playwright 없음', timeout: 120000 }, async () => {
  const { server, url } = await serve();
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await skipHints(ctx);
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  const st = (fn, arg) => page.evaluate(fn, arg);
  const body = () => page.textContent('#panel-body');
  const tapDoor = async () => {
    const p = await st(() => DUSTHOLD.doorToPage());
    await page.mouse.click(p.x, p.y);
    await nextFrame(page);
    assert.deepEqual(await st(() => DUSTHOLD.bsel), { kind: 'door' });
  };

  try {
    await page.goto(url);
    await page.click('#btn-new');
    await page.waitForSelector('#game:not([hidden])');
    await st(() => {
      DUSTHOLD.setPaused(true);
      const s = DUSTHOLD.state;
      Object.assign(s.resources, { wood: 150, scrap: 150 });
      for (const t of s.surface.tiles) if (t.type === 'nest') { t.type = 'forest'; t.deposit = 120; } // 마릿수를 공식 기본값으로
    });
    await page.click('[data-tab="bunker"]');
    await nextFrame(page);

    // 발전실에 2명 (전력 12)
    const gen = await st(() => DUSTHOLD.cellToPage(1, 1));
    for (let k = 0; k < 2; k++) {
      await page.mouse.click(gen.x, gen.y);
      await nextFrame(page);
      await page.click('[data-action="addWorker"]');
      await page.locator('[data-action="assign"]').nth(0).click();
      await nextFrame(page);
    }
    assert.equal(await page.textContent('#topbar .res[data-res="power"] .val'), `${GEN * 2}/3`);

    // 방폭문 패널: 체력 300 · Lv1 → 강화 → 600
    await tapDoor();
    assert.equal(await page.textContent('#panel-title'), '방폭문');
    assert.ok((await body()).includes('체력 300/300 · Lv1'));
    await page.click('[data-action="upgradeDoor"]');
    await nextFrame(page);
    assert.ok((await body()).includes('체력 600/600 · Lv2'), await body());

    // 포탑 설치 → 건설 인원 → 완공
    await page.click('[data-action="turret"]');
    await page.locator('[data-action="assign"]').nth(0).click();
    await nextFrame(page);
    assert.ok((await body()).includes('포탑 공사'));
    await st(() => DUSTHOLD.stepTicks(260));
    await nextFrame(page);
    assert.ok((await body()).includes('자동 포탑 1/2기'), await body());
    assert.ok((await body()).includes('방어 화력 초당 8'));
    assert.equal(await page.textContent('#topbar .res[data-res="power"] .val'), `${GEN * 2}/7`, '포탑 전력 -4');

    // 2일차 밤 (1일차는 연습 습격): 6마리가 가장자리에서 등장 → 입구로
    await st(() => { DUSTHOLD.setTick(2400 + 1799); DUSTHOLD.stepTicks(1); });
    await nextFrame(page);
    const raid = await st(() => ({ n: DUSTHOLD.state.raid.zombies.length, edge: DUSTHOLD.state.raid.zombies.every((z) => z.sx < 0 || z.sy < 0 || z.sx > 11 || z.sy > 11) }));
    assert.deepEqual(raid, { n: 6, edge: true });
    assert.ok((await page.textContent('#toasts')).includes('좀비 6마리 습격'));
    await tapDoor();
    assert.ok((await body()).includes('접근 중 6'), await body());
    await st(() => DUSTHOLD.stepTicks(60));
    await page.click('[data-tab="bunker"]');
    await nextFrame(page);
    await st(() => DUSTHOLD.stepTicks(100));
    await tapDoor();
    const t1 = await body();
    assert.ok(/체력 (\d+)\/600/.test(t1) && Number(t1.match(/체력 (\d+)\/600/)[1]) < 600, `문이 깎인다: ${t1}`);
    // 포탑이 다 처치
    await st(() => DUSTHOLD.stepTicks(300));
    const after = await st(() => ({ active: DUSTHOLD.state.raid.active, killed: DUSTHOLD.state.raid.killed }));
    assert.deepEqual(after, { active: false, killed: 6 }, '포탑이 6마리 모두 처치');
    assert.ok((await page.textContent('#toasts')).includes('습격을 막아냈다'));

    // 3일차 밤: 문이 거의 부서진 상태 → 파괴 → 1층 방 고장
    await st(() => { DUSTHOLD.state.bunker.rooms.filter((r) => r.type === 'turret').forEach((r) => { r.broken = true; }); });
    await st(() => { DUSTHOLD.setTick(2400 * 2 + 1799); DUSTHOLD.stepTicks(1); DUSTHOLD.state.door.hp = 1; DUSTHOLD.stepTicks(130); });
    await nextFrame(page);
    assert.equal(await st(() => DUSTHOLD.state.raid.breached), true);
    await tapDoor();
    assert.ok((await body()).includes('부서져 있다'));
    await st(() => DUSTHOLD.stepTicks(300));
    await nextFrame(page);
    const broken = await st(() => DUSTHOLD.state.bunker.rooms.filter((r) => r.floor === 1 && r.broken).map((r) => r.type).sort());
    assert.deepEqual(broken, ['generator', 'water']);
    assert.ok(await st(() => DUSTHOLD.state.survivors.some((s) => s.hp < 100)), '생존자가 다쳤다');
    assert.equal(await page.textContent('#topbar .res[data-res="power"] .val'), '0/0', '고장 난 방은 전력망에서 빠짐');

    // 발전실 수리: 고철 8·목재 3 + 10초
    const g = await st(() => DUSTHOLD.cellToPage(1, 1));
    await page.mouse.click(g.x, g.y);
    await nextFrame(page);
    assert.ok((await body()).includes('고장'));
    const repair = page.locator('[data-action="repair"]');
    assert.ok((await repair.textContent()).includes('고철 8, 목재 3'));
    await repair.click();
    await page.locator('[data-action="assign"]').nth(0).click();
    await nextFrame(page);
    assert.ok((await body()).includes('수리 중'));
    await st(() => DUSTHOLD.stepTicks(110));
    await nextFrame(page);
    assert.equal(await st(() => DUSTHOLD.state.bunker.rooms.find((r) => r.type === 'generator').broken), false, '수리 완료');

    // 새벽: 침입 종료, 전원 -15
    await st(() => { DUSTHOLD.setTick(2400 * 3 - 1); });
    const hp0 = await st(() => DUSTHOLD.state.survivors.map((s) => s.hp));
    await st(() => DUSTHOLD.stepTicks(1));
    const hp1 = await st(() => DUSTHOLD.state.survivors.map((s) => s.hp));
    assert.equal(await st(() => DUSTHOLD.state.raid.active), false);
    hp1.forEach((h, k) => assert.ok(Math.abs(hp0[k] - 15 - h) < 0.5 || h <= 0 || hp1.length !== hp0.length));

    // 버튼 44px
    await tapDoor();
    const small = await page.$$eval('#panel button, #tabs button, #speed button', (els) => els.filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent, w: r.width, h: r.height }; }).filter((b) => b.w < 44 || b.h < 44));
    assert.deepEqual(small, [], '44px 미만 버튼');

    assert.deepEqual(errors, [], '콘솔 에러 0건');
  } finally {
    await browser.close();
    server.close();
  }
});
