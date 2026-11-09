// M2 화면 테스트: 은화 탑·상단 숫자·패드 숫자·건물 등장 (헤드리스 브라우저)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './helpers.js';
import { skip, openGame } from './browser.js';

let game, page, errors;
before(async () => {
  if (skip) return;
  game = await openGame('?seed=1');
  ({ page, errors } = game);
  await mkdir(join(ROOT, 'test-results'), { recursive: true });
});
after(async () => { if (game) await game.close(); });

const hudCoins = () => page.$eval('.coins .coin-n', el => Number(el.textContent));
const padText = id => page.$eval(`.pad-label[data-pad="${id}"] .pad-n`, el => el.textContent);
const padVisible = id => page.$eval(`.pad-label[data-pad="${id}"]`, el => el.style.display !== 'none').catch(() => false);
const teleport = (x, z) => page.evaluate(([x, z]) => { const c = __game.state.commander; c.x = c.prevX = x; c.z = c.prevZ = z; }, [x, z]);

test('은화 더미로 걸어가면 등 뒤에 쌓이고 상단 숫자가 오른다', { skip }, async () => {
  assert.equal(await hudCoins(), 0);
  const st = await page.evaluate(() => __game.balance.coins.start);
  await teleport(st.x - 3, st.z);
  await page.keyboard.down('d'); await page.keyboard.down('s'); // 화면 오른쪽+아래 = 바닥 +x
  // 더미 가운데를 지날 때까지 (느린 화면에서도 같은 결과가 나오도록 위치로 기다림)
  await page.waitForFunction(x => __game.state.commander.x >= x, st.x + 0.5, { timeout: 10000 });
  await page.keyboard.up('d'); await page.keyboard.up('s');
  await page.waitForTimeout(400);
  const n = await page.evaluate(() => __game.state.commander.coins);
  assert.ok(n >= 20, `주운 은화 ${n}`);
  assert.equal(await hudCoins(), n, '상단 숫자 = 들고 있는 은화');
  const stack = await page.evaluate(() => {
    let k = -1;
    __game.view.scene.traverse(o => { if (o.isInstancedMesh && o.instanceMatrix.count === __game.balance.coins.carryMax) k = o.count; });
    return k;
  });
  assert.equal(stack, n, '등 뒤 탑에 그려진 은화 수');
  await page.screenshot({ path: join(ROOT, 'test-results/m2-stack.png') });
});

test('막사 패드 위에 서면 패드 숫자가 줄고, 0이 되면 건물이 나타나고 다음 패드가 열린다', { skip }, async () => {
  await page.evaluate(() => { __game.state.commander.coins = 30; });
  assert.equal(await padText('barracks'), '6');
  assert.equal(await padVisible('taxTable'), false);
  const p = await page.evaluate(() => __game.state.pads.find(p => p.id === 'barracks'));
  await teleport(p.x, p.z);
  await page.waitForFunction(() => __game.state.pads.find(p => p.id === 'barracks').paid >= 2);
  await page.screenshot({ path: join(ROOT, 'test-results/m2-paying.png') });
  const mid = Number(await padText('barracks'));
  assert.ok(mid < 6 && mid > 0, `납부 중 패드 숫자 ${mid}`);
  await page.waitForFunction(() => __game.state.unlocked.barracks, null, { timeout: 5000 });
  await page.waitForTimeout(700);
  assert.equal(await padVisible('barracks'), false);
  assert.equal(await padVisible('recruit'), true);
  assert.equal(await padVisible('taxTable'), true);
  assert.equal(await hudCoins(), 24);
  const meshes = await page.evaluate(() => {
    let n = 0; __game.view.scene.traverse(o => { if (o.isMesh && !o.isInstancedMesh) n++; });
    return n;
  });
  assert.ok(meshes > 40, '건물 모델이 추가됨');
  await teleport(p.x + 4, p.z + 5);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(ROOT, 'test-results/m2-barracks.png') });
});

test('세금 탁자: 해금 후 은화가 쌓이고, 지나가면 가져간다', { skip }, async () => {
  const p = await page.evaluate(() => __game.state.pads.find(p => p.id === 'taxTable'));
  await teleport(p.x, p.z);
  await page.waitForFunction(() => __game.state.unlocked.taxTable, null, { timeout: 5000 });
  await teleport(p.x, p.z + 4);
  await page.waitForTimeout(200);
  await page.evaluate(() => { const t = __game.state.buildings.find(b => b.kind === 'taxTable'); t.stored = 12; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(ROOT, 'test-results/m2-tax.png') });
  const before = await hudCoins();
  await teleport(p.x, p.z + 1.4);
  await page.waitForTimeout(400);
  assert.ok(await hudCoins() >= before + 12, '세금 수거');
  assert.deepEqual(errors, []);
});
