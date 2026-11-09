// 이어하기 화면 테스트: 다시 접속 → 이어서 하기 / 처음부터, 사람(브라우저)마다 따로
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skip, openGame } from './browser.js';

const snap = page => page.evaluate(() => ({
  coins: __game.state.commander.coins, built: __game.state.buildings.map(b => b.kind),
  tick: __game.state.tick, ground: __game.state.coins.length, resumed: __game.resumed,
}));

test('진행 → 다시 접속하면 "이어서 하기"로 그대로 이어지고, "처음부터"는 새 판, 다른 사람에겐 저장이 없다', { skip, timeout: 120000 }, async () => {
  const g = await openGame('?seed=1');
  try {
    const { page } = g;
    // 막사 짓고 은화 들고 있는 상태 만들기 (실제 규칙으로)
    await page.evaluate(() => { __game.state.waves.paused = false; __game.state.commander.coins = 30; });
    const bp = await page.evaluate(() => __game.state.pads.find(p => p.id === 'barracks'));
    await page.evaluate(([x, z]) => { const c = __game.state.commander; c.x = c.prevX = x; c.z = c.prevZ = z; }, [bp.x, bp.z]);
    await page.waitForFunction(() => __game.state.unlocked.barracks, null, { timeout: 10000 });
    await page.evaluate(() => __game.saveNow());
    const before = await snap(page);
    assert.deepEqual(before.built, ['barracks']);

    // 다시 접속 (같은 브라우저)
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready, null, { timeout: 20000 });
    assert.equal(await page.$eval('.resume', el => getComputedStyle(el).display !== 'none'), true, '이어하기 창');
    assert.match(await page.$eval('.resume .r-info', el => el.textContent), /웨이브 \d+ · 은화 \d+개 · \d+분 진행/);
    assert.equal(await page.evaluate(() => __game.isPaused()), true, '고르기 전엔 멈춤');
    const box = await page.$eval('.resume .r-go', el => { const r = el.getBoundingClientRect(); return r.height; });
    assert.ok(box >= 44, '버튼 44px 이상');
    await page.click('.resume .r-go');
    const after = await snap(page);
    assert.equal(after.resumed, true);
    assert.deepEqual(after.built, before.built, '건물 그대로');
    assert.equal(after.coins, before.coins, '은화 그대로');
    assert.ok(after.tick >= before.tick, '시간 이어짐');
    assert.equal(await page.evaluate(() => __game.isPaused()), false);

    // 다른 사람(새 브라우저 = 다른 저장소)은 처음부터
    const other = await openGame('?seed=1');
    try {
      assert.equal(await other.page.$('.resume'), null, '다른 사람에겐 이어하기 창 없음');
      assert.deepEqual((await snap(other.page)).built, []);
    } finally { await other.close(); }

    // 다시 접속 → 처음부터
    await page.evaluate(() => __game.saveNow());
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready, null, { timeout: 20000 });
    await page.click('.resume .r-new');
    await page.waitForFunction(() => window.__game && __game.ready && !document.querySelector('.resume'), null, { timeout: 20000 });
    const fresh = await snap(page);
    assert.deepEqual(fresh.built, []);
    assert.equal(fresh.ground, 25, '시작 은화 25개부터');
    assert.equal(fresh.resumed, false);
    assert.deepEqual(g.errors, []);
  } finally { await g.close(); }
});

test('판이 끝나면 저장이 지워져서, 다시 접속하면 새 판', { skip, timeout: 60000 }, async () => {
  const g = await openGame('?seed=1');
  try {
    const { page } = g;
    await page.waitForFunction(() => __game.state.tick > 2, null, { timeout: 10000 }); // 게임이 돌기 시작한 뒤 (안 건드린 판은 저장 안 함)
    const st = await page.evaluate(() => { __game.state.commander.coins = 9; __game.saveNow(); return { has: !!localStorage.getItem('lastgate.save'), tick: __game.state.tick, res: __game.state.result, paused: __game.isPaused() }; });
    assert.ok(st.has, '저장됨 ' + JSON.stringify(st));
    await page.evaluate(() => { __game.state.castle.hp = 0; });
    await page.waitForSelector('.result:not(.hidden)', { timeout: 5000 });
    await page.waitForFunction(() => !localStorage.getItem('lastgate.save'), null, { timeout: 5000 });
    await page.reload();
    await page.waitForFunction(() => window.__game && __game.ready, null, { timeout: 20000 });
    assert.equal(await page.$('.resume'), null);
  } finally { await g.close(); }
});
