// M5 로직 테스트: 바닥 안내 목표 · 결정론(자동 플레이 10판) · 최악 장면 계산 시간
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { loadBalance } from './helpers.js';
import { createState } from '../js/sim/state.js';
import { step } from '../js/sim/rules.js';
import { guideTarget } from '../js/sim/guide.js';
import { makeWorstScene } from '../js/sim/debug.js';
import { playGame } from './bot.js';

const B = loadBalance();
const TPS = Math.round(1 / B.sim.tickSeconds);
const STILL = { x: 0, z: 0 };
const run = (s, input, ticks) => { for (let i = 0; i < ticks; i++) step(s, input, B); };
const place = (o, x, z) => { o.x = o.prevX = x; o.z = o.prevZ = z; };
const pad = (s, id) => s.pads.find(p => p.id === id);

test('바닥 안내: 은화 없으면 은화 더미 → 모으면 막사 → 세금 탁자 → 모집 → 성벽 → 망루 → 적 기지', () => {
  const s = createState(B, 1);
  s.spawn.paused = true;
  let t = guideTarget(s, B);
  assert.equal(t.kind, 'coin', '처음엔 은화 더미로');
  s.commander.coins = 25; s.coins = [];
  t = guideTarget(s, B);
  assert.deepEqual([t.kind, t.id], ['pad', 'barracks']);
  const order = ['barracks', 'taxTable', 'recruit', 'walls', 'tower1'];
  for (let i = 0; i < order.length; i++) {
    const p = pad(s, order[i]);
    s.commander.coins = 100;
    t = guideTarget(s, B);
    assert.deepEqual([t.kind, t.id], ['pad', order[i]], `${i + 1}번째 안내`);
    place(s.commander, p.x, p.z);
    run(s, STILL, 4 * TPS);
    assert.ok(p.done || p.uses > 0, `${order[i]} 해금`);
    place(s.commander, 0, 6);
    run(s, STILL, 2);
  }
  const last = guideTarget(s, B);
  assert.equal(last.kind, 'camp', '튜토리얼이 끝나면 가장 가까운 적 기지로 안내');
});

test('바닥 안내: 돈이 모자라고 바닥 은화가 없으면 세금 탁자로', () => {
  const s = createState(B, 1);
  s.spawn.paused = true; s.coins = [];
  s.unlocked.barracks = true; pad(s, 'barracks').done = true;
  s.buildings.push({ id: 900, kind: 'taxTable', x: 6.5, z: 6.5, halfWidth: 0.8, halfDepth: 0.5, stored: 5, timer: 0, hp: 0, maxHp: 0 });
  run(s, STILL, 1);
  s.commander.coins = 2;
  const t = guideTarget(s, B);
  assert.equal(t.kind, 'tax');
});

test('같은 시드로 자동 플레이 10판 → 매번 결과가 같다 (결정론)', () => {
  const summary = s => JSON.stringify({
    result: s.result, tick: s.tick, camps: s.camps.map(k => k.hp), kills: s.kills, castle: s.castle.hp,
    hp: s.commander.hp, coins: s.commander.coins, rng: s.rng.s, nextId: s.nextId,
    archers: s.archers.map(a => [a.x, a.z, a.hp]), enemies: s.enemies.map(e => [e.type, e.x, e.z, e.hp]),
    walls: s.walls.map(w => w.hp), buildings: s.buildings.map(b => b.kind), ground: s.coins.length,
  });
  const first = summary(playGame(createState, B, 7));
  for (let i = 1; i < 10; i++) assert.equal(summary(playGame(createState, B, 7)), first, `${i + 1}번째 판이 다름`);
  const r = JSON.parse(first);
  console.log(`  시드 7 자동 플레이: ${r.result} · ${(r.tick / TPS).toFixed(0)}초 · 기지 체력 ${r.camps} · 처치 ${r.kills}`);
  // 다른 시드는 다른 판 (맵·전투가 달라짐)
  assert.notEqual(summary(playGame(createState, B, 8)), first);
});

test('최악 장면에서 sim 1틱 계산이 충분히 빠르다 (폰 성능 여유 확인용)', () => {
  const s = createState(B, 1);
  makeWorstScene(s, B);
  run(s, STILL, 20); // 워밍업
  const n = 400;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    step(s, { x: Math.sin(i / 30), z: Math.cos(i / 30) }, B);
    if (s.enemies.length < 40) makeWorstScene(s, B); // 계속 붐비게
  }
  const ms = (performance.now() - t0) / n;
  console.log(`  최악 장면 sim 1틱 평균 ${ms.toFixed(3)}ms (PC 기준, 1틱 예산 50ms)`);
  // 화면 1프레임(16.7ms)에 틱은 보통 1번. 적 180명 기준 PC에서 3ms 미만이면 폰(약 5~8배 느림)에서도 한 프레임 안
  // (혼자 돌리면 약 0.7ms, 브라우저 테스트와 동시에 돌면 1.5ms 정도)
  assert.ok(ms < 3, `sim이 너무 느림 ${ms}ms`);
});
