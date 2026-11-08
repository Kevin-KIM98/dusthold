// 브라우저 확인: M2 지상을 실제로 탭·드래그·휠·핀치로 조작해 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, loadPlaywright, nextFrame, collectErrors } from './helpers/server.js';

const playwright = loadPlaywright();
const N = 11;
const at = (x, y) => y * N + x;

test('브라우저: 지상 맵 — 탭으로 탐험·채집, 밤 귀환, 드래그·줌', { skip: !playwright && 'playwright 없음', timeout: 120000 }, async () => {
  const { server, url } = await serve();
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = collectErrors(page);

  const tap = async (i) => {
    const p = await page.evaluate((k) => DUSTHOLD.tileToPage(k), i);
    await page.mouse.click(p.x, p.y);
    await nextFrame(page);
  };
  const st = (fn) => page.evaluate(fn);

  try {
    await page.goto(url);
    await page.click('#btn-new');
    await page.waitForSelector('#game:not([hidden])');
    await st(() => DUSTHOLD.setPaused(true));
    await nextFrame(page);

    // 맵이 실제로 그려진다: 입구 칸과 안개 칸의 픽셀 색이 다르다
    const px = await page.evaluate(() => {
      const c = document.getElementById('view');
      const g = c.getContext('2d');
      const r = c.getBoundingClientRect();
      const dpr = c.width / r.width;
      const read = (i) => { const p = DUSTHOLD.tileToPage(i); return Array.from(g.getImageData(Math.round((p.x - r.left) * dpr), Math.round((p.y - r.top - 18) * dpr), 1, 1).data); };
      return { entrance: read(60), fog: read(5 * 11 + 8) };
    });
    assert.notDeepEqual(px.entrance, px.fog, '입구와 안개가 다르게 그려짐');
    assert.equal(await st(() => DUSTHOLD.state.surface.tiles.filter((t) => t.revealed).length), 9);

    // 링 3 안개 칸: 탐험 버튼 비활성 + 이유
    await tap(at(5, 2));
    assert.equal(await st(() => DUSTHOLD.selected), at(5, 2));
    assert.equal(await page.textContent('#panel-title'), '안개 · 거리 3');
    assert.equal(await page.isDisabled('[data-action="explore"]'), true);
    assert.ok((await page.textContent('#panel-body')).includes('밝혀진 땅과 붙어 있어야 한다'));

    // 링 2 안개 칸: 탐험 → 2명 고르기 → 출발
    const target = at(5, 3);
    await tap(target);
    assert.equal(await page.textContent('#panel-title'), '안개 · 거리 2');
    assert.ok((await page.textContent('#panel-body')).includes('왕복 40초'));
    await page.click('[data-action="explore"]');
    assert.equal(await page.isDisabled('[data-action="depart"]'), true, '아무도 안 고르면 출발 불가');
    await page.locator('[data-action="pick"]').nth(0).click();
    await page.locator('[data-action="pick"]').nth(1).click();
    assert.equal(await page.textContent('[data-action="depart"]'), '출발 (2명)');
    await page.click('[data-action="depart"]');
    assert.equal(await st(() => DUSTHOLD.state.surface.expeditions.length), 1);
    assert.ok((await page.textContent('#panel-body')).includes('원정 중 (2명)'));
    await st(() => DUSTHOLD.stepTicks(399));
    assert.equal(await st(() => DUSTHOLD.state.surface.tiles[5 + 3 * 11].revealed), false);
    await st(() => DUSTHOLD.stepTicks(1));
    await nextFrame(page);
    assert.equal(await st(() => DUSTHOLD.state.surface.tiles[5 + 3 * 11].revealed), true, '40초 뒤 밝혀짐');
    assert.notEqual(await page.textContent('#panel-title'), '안개 · 거리 2', '패널이 밝혀진 칸 정보로 바뀜');
    assert.ok(await page.locator('.toast').count() >= 1, '귀환 토스트');

    // 숲 채집: + 배치 → 사람 고르기 → 목재가 쌓이고 매장량이 준다
    const forest = await st(() => DUSTHOLD.state.surface.tiles.findIndex((t) => t.type === 'forest' && t.revealed));
    await tap(forest);
    assert.ok((await page.textContent('#panel-body')).includes('남은 양 120'));
    await page.click('[data-action="gather"]');
    await page.locator('[data-action="assign"]').nth(0).click();
    assert.equal(await st(() => DUSTHOLD.state.survivors.filter((s) => s.job === 'gather').length), 1);
    assert.ok((await page.textContent('#panel-body')).includes('채집 중 1명'));
    const wood0 = Number(await page.textContent('#topbar .res[data-res="wood"] .val'));
    await st(() => DUSTHOLD.stepTicks(800)); // 80초
    await nextFrame(page);
    const wood1 = Number(await page.textContent('#topbar .res[data-res="wood"] .val'));
    assert.ok(wood1 > wood0, `목재 ${wood0} → ${wood1}`);
    assert.ok(!(await page.textContent('#panel-body')).includes('남은 양 120'), '매장량 줄어듦');

    // 빼기 버튼 동작
    await page.click('[data-action="unassign"]');
    assert.equal(await st(() => DUSTHOLD.state.survivors.filter((s) => s.job === 'gather').length), 0);
    await page.click('[data-action="gather"]');
    await page.locator('[data-action="assign"]').nth(0).click();

    // 밤이 되면 자동 귀환 + 배치 버튼 비활성
    await st(() => { DUSTHOLD.setTick(1799); DUSTHOLD.stepTicks(1); });
    await nextFrame(page);
    assert.equal(await st(() => DUSTHOLD.state.survivors.filter((s) => s.job === 'gather').length), 0);
    assert.equal(await page.isDisabled('[data-action="gather"]'), true);
    assert.ok((await page.textContent('#panel-body')).includes('밤에는 채집할 수 없다'));
    assert.ok((await page.textContent('#toasts')).includes('채집 인원 귀환'));

    // 기록 탭에 지상 기록
    await page.click('[data-tab="log"]');
    await nextFrame(page);
    const log = await page.textContent('#log-view');
    assert.ok(log.includes('출발'), log);
    assert.ok(log.includes('귀환'), log);
    await page.click('[data-tab="surface"]');
    await nextFrame(page);

    // 드래그 = 맵 이동, 휠 = 줌, 두 손가락 = 핀치 줌
    const cam0 = await st(() => ({ ...DUSTHOLD.camera }));
    await page.mouse.move(200, 400);
    await page.mouse.down();
    await page.mouse.move(260, 450, { steps: 5 });
    await page.mouse.up();
    const cam1 = await st(() => ({ ...DUSTHOLD.camera }));
    assert.ok(cam1.cx < cam0.cx && cam1.cy < cam0.cy, '드래그하면 카메라 이동');
    assert.equal(await st(() => DUSTHOLD.selected), forest, '드래그는 탭으로 치지 않음');
    await page.mouse.wheel(0, -300);
    await nextFrame(page);
    const cam2 = await st(() => ({ ...DUSTHOLD.camera }));
    assert.ok(cam2.zoom > cam1.zoom, '휠 위로 = 확대');
    for (let k = 0; k < 30; k++) await page.mouse.wheel(0, -300);
    await nextFrame(page);
    assert.equal(await st(() => DUSTHOLD.camera.zoom), 2, '최대 줌 2.0');
    const pinched = await page.evaluate(() => {
      const c = document.getElementById('view');
      const r = c.getBoundingClientRect();
      const ev = (type, id, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: r.left + x, clientY: r.top + y, bubbles: true, isPrimary: id === 1 }));
      ev('pointerdown', 1, 150, 300); ev('pointerdown', 2, 250, 300);
      ev('pointermove', 2, 210, 300); ev('pointermove', 1, 190, 300);
      ev('pointerup', 2, 190, 300); ev('pointerup', 1, 190, 300);
      return DUSTHOLD.camera.zoom;
    });
    assert.ok(pinched < 2, `핀치로 축소 (${pinched})`);
    for (let k = 0; k < 40; k++) await page.mouse.wheel(0, 300);
    assert.equal(await st(() => DUSTHOLD.camera.zoom), 0.6, '최소 줌 0.6');

    // Esc = 패널 닫기
    await page.keyboard.press('Escape');
    assert.equal(await st(() => DUSTHOLD.selected), -1);

    // 패널 버튼도 44px 이상 (피커 열어서 확인)
    await page.evaluate(() => { DUSTHOLD.setTick(2400 * 2); });
    await st(() => { DUSTHOLD.camera.zoom = 1; DUSTHOLD.camera.cx = 5.5; DUSTHOLD.camera.cy = 5.5; });
    await nextFrame(page);
    await tap(at(4, 3));
    await page.click('[data-action="explore"]');
    await nextFrame(page);
    const small = await page.$$eval('#panel button', (els) => els.filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent, w: r.width, h: r.height }; }).filter((b) => b.w < 44 || b.h < 44));
    assert.deepEqual(small, [], '44px 미만 버튼');

    assert.deepEqual(errors, [], '콘솔 에러 0건');
  } finally {
    await browser.close();
    server.close();
  }
});
