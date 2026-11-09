// 화면 비교용 스크린샷 (테스트 아님): node tests/shots.mjs <접두어>
// 1) 시작 화면  2) 기지 완성 + 전투 장면  3) PC 가로 화면
import { openGame } from './browser.js';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { ROOT } from './helpers.js';

const tag = process.argv[2] || 'shot';
await mkdir(join(ROOT, 'test-results'), { recursive: true });

async function base(page) {
  await page.evaluate(async () => {
    const s = __game.state, B = __game.balance;
    const { addBuilding } = await import('./js/sim/buildings.js');
    const { buildWalls } = await import('./js/sim/walls.js');
    const { spawnArchers, spawnEnemy } = await import('./js/sim/units.js');
    s.waves.paused = true;
    s.coins = s.coins.slice(0, 8);
    for (const id of ['barracks', 'taxTable', 'walls', 'tower1', 'tower2']) s.pads.find(p => p.id === id).done = true;
    s.unlocked.barracks = s.unlocked.taxTable = s.unlocked.walls = s.unlocked.tower = true;
    addBuilding(s, 'barracks', -7, 3, B);
    const t = addBuilding(s, 'taxTable', 6.5, 6.5, B); t.stored = 14;
    addBuilding(s, 'tower', -4.5, 9.3, B);
    addBuilding(s, 'tower', 3.5, 9.3, B).upgraded = true;
    buildWalls(s, B, 1);
    const c = s.commander; c.x = c.prevX = -0.8; c.z = c.prevZ = 9.0; c.coins = 37; c.angle = c.prevAngle = 0;
    spawnArchers(s, 6, -0.8, 7, B);
    for (let i = 0; i < 7; i++) {
      const e = spawnEnemy(s, i % 3 ? 'raider' : 'shield', 'south', B);
      e.x = e.prevX = -1.5 + (i % 4) * 0.9; e.z = e.prevZ = 12.4 + Math.floor(i / 4) * 1.2; e.wp = 3;
    }
    const g = spawnEnemy(s, 'giant', 'south', B); g.x = g.prevX = 1.2; g.z = g.prevZ = 15; g.wp = 3;
  });
}

{
  const g = await openGame('?seed=1');
  await g.page.waitForTimeout(600);
  await g.page.screenshot({ path: join(ROOT, `test-results/${tag}-1-start.png`) });
  await base(g.page);
  await g.page.waitForTimeout(1500);
  await g.page.screenshot({ path: join(ROOT, `test-results/${tag}-2-battle.png`) });
  const info = await g.page.evaluate(() => __game.view.renderer.info.render);
  console.log(tag, 'calls', info.calls, 'tris', info.triangles, 'errors', g.errors.length);
  await g.close();
}
{
  const g = await openGame('?seed=1', { width: 1280, height: 720 });
  await base(g.page);
  await g.page.waitForTimeout(1500);
  await g.page.screenshot({ path: join(ROOT, `test-results/${tag}-3-pc.png`) });
  await g.close();
}
