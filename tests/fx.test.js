// 파티클 풀: 성능 상한 150개를 넘지 않는다 (plan.md 성능 상한)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { createFx } from '../js/render/fx.js';

test('파티클은 최대 150개, 넘치면 오래된 것부터 다시 쓴다', () => {
  const fx = createFx();
  assert.equal(CONFIG.FX.MAX_PARTICLES, 150);
  for (let k = 0; k < 500; k++) fx.dirt(k, 0);
  assert.equal(fx.count(), 150);
  assert.equal(fx.pool.length, 150, '새 객체를 만들지 않는다');
  fx.sparkle(0, 0, 10, 10, 50);
  assert.equal(fx.count(), 150);
  fx.update(5);
  assert.equal(fx.count(), 0, '수명이 다하면 사라진다');
});
