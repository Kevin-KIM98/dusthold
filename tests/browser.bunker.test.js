// 브라우저 확인: M3 벙커를 실제로 탭·길게 눌러 끌기로 조작해 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { serve, loadPlaywright, nextFrame, collectErrors, sleep, skipHints } from './helpers/server.js';

const playwright = loadPlaywright();
const GEN = CONFIG.BUNKER.ROOMS.generator.perWorker;

test('브라우저: 벙커 — 굴착·건설 3단계·배치·전력·끊김·굶주림·길게 눌러 옮기기', { skip: !playwright && 'playwright 없음', timeout: 120000 }, async () => {
  const { server, url } = await serve();
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await skipHints(ctx);
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  const st = (fn, arg) => page.evaluate(fn, arg);
  const tapCell = async (floor, col) => {
    const p = await st(([f, c]) => DUSTHOLD.cellToPage(f, c), [floor, col]);
    await page.mouse.click(p.x, p.y);
    await nextFrame(page);
    const sel = await st(() => DUSTHOLD.bsel);
    assert.deepEqual(sel, { kind: 'cell', floor, col }, `탭한 칸 ${floor}층 ${col}`);
  };
  const body = () => page.textContent('#panel-body');
  const bar = (id) => page.textContent(`#topbar .res[data-res="${id}"] .val`);

  try {
    await page.goto(url);
    await page.click('#btn-new');
    await page.waitForSelector('#game:not([hidden])');
    await st(() => DUSTHOLD.setPaused(true));
    await page.click('[data-tab="bunker"]');
    await nextFrame(page);
    assert.equal(await st(() => DUSTHOLD.view), 'bunker');
    assert.equal(await bar('power'), '0/3', '시작: 생산 0 / 수요 3');

    // 발전실 탭 → + 배치 → 전력 6
    await tapCell(1, 1);
    assert.equal(await page.textContent('#panel-title'), '발전실 · 1층');
    await page.click('[data-action="addWorker"]');
    await page.locator('[data-action="assign"]').nth(0).click();
    await nextFrame(page);
    assert.equal(await bar('power'), `${GEN}/3`, '근무자 1명 → 전력 +GEN');
    assert.ok((await body()).includes('근무 1/2'));
    // 빼기 → 0, 다시 넣기
    await page.click('[data-action="unassign"]');
    await nextFrame(page);
    assert.equal(await bar('power'), '0/3', '빼면 내려감');
    await tapCell(1, 4);
    assert.ok((await body()).includes('전력 부족으로 꺼짐'), '정수실이 꺼진 상태로 표시');
    await tapCell(1, 1);
    await page.click('[data-action="addWorker"]');
    await page.locator('[data-action="assign"]').nth(0).click();
    await nextFrame(page);
    await tapCell(1, 4);
    assert.ok((await body()).includes('가동 중'));

    // 2층 샤프트 오른쪽 흙 굴착: 목재 -5, 사람 배치, 10초 뒤 열림
    await tapCell(2, 4);
    assert.equal(await page.textContent('#panel-title'), '흙 · 2층');
    const wood0 = Number(await bar('wood'));
    await page.click('[data-action="dig"]');
    await nextFrame(page);
    assert.equal(Number(await bar('wood')), wood0 - 5);
    assert.ok(await page.locator('[data-action="assign"]').count() > 0, '굴착 시작하면 바로 건설 인원 고르기');
    await page.locator('[data-action="assign"]').nth(0).click();
    await nextFrame(page);
    assert.ok((await body()).includes('건설 인원 1/2'));
    await st(() => DUSTHOLD.stepTicks(30));
    await nextFrame(page);
    const mid = await body();
    const pctNow = Number((mid.match(/진행 (\d+)%/) || [])[1]);
    assert.ok(pctNow >= 30 && pctNow < 100, `진행바가 차오른다: ${mid}`);
    await st(() => DUSTHOLD.stepTicks(70));
    await nextFrame(page);
    assert.equal(await page.textContent('#panel-title'), '빈 칸 · 2층', '굴착 끝 → 빈 칸');
    // 멀리 떨어진 흙은 못 판다
    await tapCell(2, 6);
    assert.equal(await page.isDisabled('[data-action="dig"]'), true);
    assert.ok((await body()).includes('샤프트와 이어진 칸 옆만 팔 수 있다'));
    // 옆 칸도 판다 (숙소 2칸 자리)
    await tapCell(2, 5);
    await page.click('[data-action="dig"]');
    await page.locator('[data-action="assign"]').nth(0).click();
    await st(() => DUSTHOLD.stepTicks(100));

    // 자원 부족이면 건설 버튼 비활성 + 이유
    await st(() => { DUSTHOLD.state.resources.wood = 5; });
    await tapCell(2, 4);
    const q = page.locator('[data-action="build"][data-arg="quarters"]');
    assert.equal(await q.isDisabled(), true, '목재 5로는 숙소(목재 20) 못 지음');
    assert.ok((await q.textContent()).includes('목재 15 부족'), await q.textContent());
    await st(() => { DUSTHOLD.state.resources.wood = 40; });
    await nextFrame(page);
    assert.equal(await q.isDisabled(), false);

    // 숙소 건설: 비계 → 골조 → 완성, 2명이면 더 빠르다
    await q.click();
    await nextFrame(page);
    const builders = page.locator('[data-action="assign"]');
    await builders.nth(0).click();
    await nextFrame(page);
    assert.ok((await body()).includes('비계 단계'));
    await page.click('[data-action="addBuilder"]');
    await page.locator('[data-action="assign"]').nth(0).click();
    await nextFrame(page);
    assert.ok((await body()).includes('건설 인원 2/2'));
    const remain = await body();
    assert.ok(/남은 시간 0:(0\d|1[0-2])/.test(remain), `2명이면 20초보다 짧다: ${remain}`);
    const stages = [];
    for (let k = 0; k < 40; k++) {
      await st(() => DUSTHOLD.stepTicks(5));
      const s = await st(() => { const r = DUSTHOLD.state.bunker.rooms.find((x) => x.type === 'quarters'); return r.done ? 'done' : r.progress < 0.5 ? 'scaffold' : 'frame'; });
      if (stages[stages.length - 1] !== s) stages.push(s);
      if (s === 'done') break;
    }
    assert.deepEqual(stages, ['scaffold', 'frame', 'done']);
    await nextFrame(page);
    assert.equal(await bar('pop'), '4/10', '숙소 완공 → 인구 상한 +4');
    assert.ok((await page.textContent('#toasts')).includes('숙소 완공'));

    // 샤프트와 끊긴 방: 1층 정수실 오른쪽(6)을 파고 1칸 창고를 짓되, 2층 왼쪽은 빈 칸을 사이에 둔다
    const disconnected = await page.evaluate(async () => {
      const B = await import('/js/sim/bunker.js');
      const s = DUSTHOLD.state;
      B.debugDig(s, 2, 1); B.debugDig(s, 2, 2);
      const room = B.debugPlaceRoom(s, 'storage', 2, 1); // 2층 col 2가 빈 칸 → 끊김
      return { connected: room.connected, on: room.on, cap: s.storageCap };
    });
    assert.deepEqual(disconnected, { connected: false, on: false, cap: 150 }, '끊긴 창고는 저장 상한을 안 올림');
    await tapCell(2, 1);
    assert.ok((await body()).includes('샤프트와 끊겨 작동 안 함'));

    // 길게 눌러 사람 옮기기: 발전실 근무자 → 정수실
    await st(() => DUSTHOLD.render());
    await nextFrame(page);
    const genWorker = await st(() => DUSTHOLD.state.survivors.find((s) => s.job === 'room').id);
    const from = await st((id) => DUSTHOLD.figureToPage(id), genWorker);
    assert.ok(from, '근무자가 그려져 있다');
    const to = await st(() => DUSTHOLD.cellToPage(1, 5));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await sleep(700); // 길게 누르기 (500ms)
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
    await nextFrame(page);
    const moved = await st((id) => { const s = DUSTHOLD.state.survivors.find((v) => v.id === id); const r = DUSTHOLD.state.bunker.rooms.find((x) => x.id === s.jobRef); return r && r.type; }, genWorker);
    assert.equal(moved, 'water', '정수실로 옮겨짐');
    assert.equal(await bar('power'), '0/4', '발전실이 비어 전력 0');

    // 새벽에 식량 0 → 체력 -30, 토스트
    await st(() => { DUSTHOLD.state.resources.food = 0; DUSTHOLD.setTick(2399); DUSTHOLD.stepTicks(1); });
    await nextFrame(page);
    assert.ok(await st(() => DUSTHOLD.state.survivors.every((s) => s.hp <= 70)));
    assert.ok((await page.textContent('#toasts')).includes('식량 부족'));

    // 드래그 = 단면도 이동, 휠 = 줌
    const cam0 = await st(() => ({ ...DUSTHOLD.bunkerCamera }));
    await page.mouse.wheel(0, -500);
    await nextFrame(page);
    const cam1 = await st(() => ({ ...DUSTHOLD.bunkerCamera }));
    assert.ok(cam1.zoom > cam0.zoom, '휠로 확대');
    await page.mouse.move(200, 400);
    await page.mouse.down();
    await page.mouse.move(200, 250, { steps: 5 });
    await page.mouse.up();
    const cam2 = await st(() => ({ ...DUSTHOLD.bunkerCamera }));
    assert.ok(cam2.cy > cam1.cy, '위로 끌면 아래층이 보인다');

    // 패널 버튼 44px
    const small = await page.$$eval('#panel button, #tabs button, #speed button', (els) => els.filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent, w: r.width, h: r.height }; }).filter((b) => b.w < 44 || b.h < 44));
    assert.deepEqual(small, [], '44px 미만 버튼');

    // 저장 → 새로고침 → 벙커 복원
    await st(() => DUSTHOLD.saveNow());
    await page.reload();
    await page.click('#btn-continue');
    await page.waitForSelector('#game:not([hidden])');
    const kept = await st(() => DUSTHOLD.state.bunker.rooms.map((r) => r.type).sort().join(','));
    assert.ok(kept.includes('quarters') && kept.includes('storage'), kept);

    assert.deepEqual(errors, [], '콘솔 에러 0건');
  } finally {
    await browser.close();
    server.close();
  }
});
