// M1 화면 테스트 (헤드리스 브라우저). Playwright가 없는 환경에서는 건너뛴다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './helpers.js';
import { skip, openGame } from './browser.js';

let game, page, cdp, errors;

before(async () => {
  if (skip) return;
  game = await openGame('?seed=1');
  ({ page, errors } = game);
  cdp = await game.ctx.newCDPSession(page);
});

after(async () => { if (game) await game.close(); });

const pos = () => page.evaluate(() => ({ x: __game.state.commander.x, z: __game.state.commander.z }));
const resetTo = (x, z) => page.evaluate(([x, z]) => {
  const c = __game.state.commander; c.x = c.prevX = x; c.z = c.prevZ = z;
}, [x, z]);
const yaw = () => page.evaluate(() => __game.balance.camera.yawDeg * Math.PI / 180);
const dirOf = (a, b) => { const dx = b.x - a.x, dz = b.z - a.z, m = Math.hypot(dx, dz); return { x: dx / m, z: dz / m, m }; };

test('화면이 뜨고(바닥·길·성채·나무) 콘솔 에러가 0건', { skip }, async () => {
  await mkdir(join(ROOT, 'test-results'), { recursive: true });
  const shot = await page.screenshot({ path: join(ROOT, 'test-results/m1-start.png') });
  assert.ok(shot.length > 20000, '스크린샷이 너무 단순함(빈 화면?)');
  const info = await page.evaluate(() => {
    const r = __game.view.renderer.info.render;
    const names = [];
    __game.view.scene.traverse(o => { if (o.isInstancedMesh) names.push(o.count); });
    return { calls: r.calls, triangles: r.triangles, instanced: names, obstacles: __game.state.obstacles.length };
  });
  assert.ok(info.calls > 5 && info.calls <= 150, `draw call ${info.calls}`);
  assert.ok(info.triangles <= 200000, `삼각형 ${info.triangles}`);
  assert.ok(info.instanced.length >= 4, '나무·바위 InstancedMesh');
  // 화면 가운데(성주·성채 주변)에 여러 색이 있는지 = 실제로 그려졌는지
  const colors = await page.evaluate(() => {
    const v = __game.view; v.renderer.render(v.scene, __game.camera.camera); // 같은 작업 안에서 읽어야 함
    const c = document.getElementById('game');
    const tmp = document.createElement('canvas'); tmp.width = 40; tmp.height = 40;
    const g = tmp.getContext('2d'); g.drawImage(c, c.width / 2 - 200, c.height / 2 - 200, 400, 400, 0, 0, 40, 40);
    const d = g.getImageData(0, 0, 40, 40).data, set = new Set();
    for (let i = 0; i < d.length; i += 4) set.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
    return set.size;
  });
  assert.ok(colors > 8, `색 종류 ${colors}`);
  assert.deepEqual(errors, []);
});

test('폰: 화면을 누르고 끌면 조이스틱이 나타나고 성주가 그 방향으로 움직인다', { skip }, async () => {
  await resetTo(0, 12);
  const a = await pos();
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
  });
  await touch('touchStart', 195, 600);
  for (let i = 1; i <= 5; i++) await touch('touchMove', 195 + i * 10, 600); // 오른쪽으로 끌기
  const shown = await page.evaluate(() => document.querySelector('.joy-base').classList.contains('on'));
  await page.waitForTimeout(500);
  const b = await pos();
  await touch('touchEnd');
  const hidden = await page.evaluate(() => !document.querySelector('.joy-base').classList.contains('on'));
  assert.ok(shown, '조이스틱이 나타나지 않음');
  assert.ok(hidden, '손을 떼도 조이스틱이 남아 있음');
  const d = dirOf(a, b), y = await yaw();
  const expect = { x: Math.cos(y), z: -Math.sin(y) }; // 화면 오른쪽
  assert.ok(d.m > 0.5, `이동 거리 ${d.m}`);
  assert.ok(d.x * expect.x + d.z * expect.z > 0.9, `방향이 다름 ${JSON.stringify(d)}`);
  const c = await pos(); await page.waitForTimeout(300);
  assert.deepEqual(await pos(), c, '손을 떼면 멈춘다');
});

test('PC: 마우스 드래그로도 조이스틱이 동작한다', { skip }, async () => {
  await resetTo(0, 12);
  const a = await pos();
  await page.mouse.move(195, 500);
  await page.mouse.down();
  await page.mouse.move(195, 440, { steps: 5 }); // 위로
  await page.waitForTimeout(400);
  await page.mouse.up();
  const d = dirOf(a, await pos()), y = await yaw();
  assert.ok(d.m > 0.5);
  assert.ok(d.x * -Math.sin(y) + d.z * -Math.cos(y) > 0.9, `방향 ${JSON.stringify(d)}`);
});

test('PC: WASD로 성주가 움직인다', { skip }, async () => {
  const y = await yaw();
  const cases = { KeyW: [-Math.sin(y), -Math.cos(y)], KeyS: [Math.sin(y), Math.cos(y)], KeyA: [-Math.cos(y), Math.sin(y)], KeyD: [Math.cos(y), -Math.sin(y)] };
  for (const [key, [ex, ez]] of Object.entries(cases)) {
    await resetTo(0, 14);
    const a = await pos();
    await page.keyboard.down(key.replace('Key', '').toLowerCase());
    await page.waitForTimeout(400);
    await page.keyboard.up(key.replace('Key', '').toLowerCase());
    const d = dirOf(a, await pos());
    assert.ok(d.m > 0.5, `${key} 이동 거리 ${d.m}`);
    assert.ok(d.x * ex + d.z * ez > 0.9, `${key} 방향 ${JSON.stringify(d)}`);
  }
});

test('카메라가 성주를 따라간다', { skip }, async () => {
  await resetTo(0, 12);
  await page.keyboard.down('s');
  await page.waitForTimeout(1200);
  await page.keyboard.up('s');
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const c = __game.state.commander, t = __game.camera.target;
    return { dist: Math.hypot(c.x - t.x, c.z - t.z), moved: Math.hypot(c.x, c.z - 12) };
  });
  assert.ok(r.moved > 3, `성주 이동 ${r.moved}`);
  assert.ok(r.dist < 0.5, `카메라와 성주 거리 ${r.dist}`);
});

test('성주는 성채·나무를 뚫지 못한다 (실제 화면에서)', { skip }, async () => {
  await resetTo(0, 6);
  await page.evaluate(() => { __game.state.commander.x = __game.state.commander.prevX = 0; });
  // 성채(북서쪽 화면 위 방향이 아닌 정북쪽)로 밀기: W+D = 화면 위+오른쪽 = 바닥 -z
  await page.keyboard.down('w'); await page.keyboard.down('d');
  await page.waitForTimeout(1500);
  await page.keyboard.up('w'); await page.keyboard.up('d');
  const r = await page.evaluate(() => {
    const c = __game.state.commander, k = __game.state.castle;
    return { inside: Math.abs(c.x - k.x) < k.halfWidth && Math.abs(c.z - k.z) < k.halfDepth, z: c.z };
  });
  assert.ok(!r.inside, `성채 안으로 들어감 ${JSON.stringify(r)}`);
  await page.screenshot({ path: join(ROOT, 'test-results/m1-castle.png') });
  assert.deepEqual(errors, []);
});
