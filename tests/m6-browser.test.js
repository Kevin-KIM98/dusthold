// M6 화면 테스트: 아트 불러오기 + 없거나 망가진 파일은 도형으로 자동 대체 + 성능 상한 유지
// (실제 아트 대신 tests/fixtures/art 의 테스트용 파일 사용 — node tests/fixtures/make-art-fixtures.mjs 로 생성)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './helpers.js';
import { skip, openGame } from './browser.js';

const meshInfo = page => page.evaluate(() => {
  const by = {};
  __game.view.scene.traverse(o => {
    if (!o.isInstancedMesh || !o.name) return;
    // 도형은 꼭짓점 색으로 구운 한 덩어리(color 속성 있음), 모델은 color 속성 없음
    (by[o.name] = by[o.name] || []).push(o.geometry.attributes.color ? 'shape' : 'model');
  });
  return by;
});

test('기본 아트 목록: 바닥 텍스처 2장만 쓰고 모델은 전부 도형, 에러 0', { skip }, async () => {
  const g = await openGame('?seed=1');
  try {
    assert.deepEqual((await g.page.evaluate(() => __game.art)).sort(), ['grass: 텍스처', 'path: 텍스처']);
    const by = await meshInfo(g.page);
    assert.deepEqual([by.archer, by.raider, by.giant], [['shape'], ['shape'], ['shape']], '모두 도형');
    assert.deepEqual(g.errors, []);
  } finally { await g.close(); }
});

test('모델·텍스처가 있으면 쓰고, 상한 초과·없는 파일은 그 항목만 도형으로 대체', { skip }, async () => {
  await mkdir(join(ROOT, 'test-results'), { recursive: true });
  const g = await openGame('?seed=1&assets=tests/fixtures/art/manifest.json');
  try {
    const report = await g.page.evaluate(() => __game.art);
    const line = slot => report.find(r => r.startsWith(slot + ':')) || '';
    assert.match(line('raider'), /모델/);
    assert.match(line('tree'), /모델/);
    assert.match(line('castle'), /모델/);
    assert.match(line('archer'), /도형 \(삼각형 \d+ > 상한 1500\)/);
    assert.match(line('giant'), /도형/);
    assert.match(line('grass'), /텍스처/);
    const by = await meshInfo(g.page);
    assert.deepEqual(by.raider, ['model'], '약탈자 = 모델');
    assert.deepEqual(by.archer, ['shape'], '궁수는 도형 그대로');
    assert.deepEqual(by.giant, ['shape'], '거인은 도형 그대로');
    // 잔디 텍스처가 바닥 재질에 들어갔는지
    const grassMapped = await g.page.evaluate(() => {
      let ok = false;
      __game.view.scene.traverse(o => { if (o.isMesh && o.geometry.type === 'PlaneGeometry' && o.material.map) ok = true; });
      return ok;
    });
    assert.ok(grassMapped, '바닥 텍스처');
    // 게임은 그대로 동작 (이동)
    const a = await g.page.evaluate(() => ({ x: __game.state.commander.x, z: __game.state.commander.z }));
    await g.page.keyboard.down('s'); await g.page.waitForTimeout(500); await g.page.keyboard.up('s');
    const b = await g.page.evaluate(() => ({ x: __game.state.commander.x, z: __game.state.commander.z }));
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) > 0.5, '이동');
    await g.page.screenshot({ path: join(ROOT, 'test-results/m6-fixture-art.png') });
    // 없는 파일(404) 말고는 에러 없음
    const unexpected = g.errors.filter(e => !/404|Failed to load resource/.test(e));
    assert.deepEqual(unexpected, []);
  } finally { await g.close(); }
});

test('아트를 넣어도 최악 장면 성능 상한(draw call ≤150, 삼각형 ≤20만)을 지킨다', { skip }, async () => {
  const g = await openGame('?seed=1&worst&assets=tests/fixtures/art/manifest.json');
  try {
    await g.page.waitForTimeout(1200);
    const r = await g.page.evaluate(() => __game.view.renderer.info.render);
    console.log(`  아트+최악 장면: draw call ${r.calls}, 삼각형 ${r.triangles}`);
    assert.ok(r.calls <= 150, `draw call ${r.calls}`);
    assert.ok(r.triangles <= 200000, `삼각형 ${r.triangles}`);
  } finally { await g.close(); }
});
