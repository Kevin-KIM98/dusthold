// M2 로직 테스트: 은화 줍기·운반 상한·패드 납부·해금·세금 탁자
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBalance } from './helpers.js';
import { createState } from '../js/sim/state.js';
import { step } from '../js/sim/rules.js';
import { spawnCoin } from '../js/sim/coins.js';
import { distToPolyline } from '../js/sim/collision.js';

const B = loadBalance();
const TPS = Math.round(1 / B.sim.tickSeconds); // 1초 틱 수
const STILL = { x: 0, z: 0 };
const run = (s, input, ticks) => { for (let i = 0; i < ticks; i++) step(s, input, B); };
const place = (s, x, z) => { const c = s.commander; c.x = c.prevX = x; c.z = c.prevZ = z; };
const pad = (s, id) => s.pads.find(p => p.id === id);
const fresh = () => { const s = createState(B, 1); s.coins = []; s.waves.paused = true; return s; };

/** 간단한 자동 조종: 목표 지점까지 직선으로 걷기 */
function goTo(s, x, z, maxTicks = 600) {
  for (let i = 0; i < maxTicks; i++) {
    const dx = x - s.commander.x, dz = z - s.commander.z, d = Math.hypot(dx, dz);
    if (d < 0.2) return true;
    const k = Math.min(1, d / (B.commander.speed * B.sim.tickSeconds));
    step(s, { x: dx / d * k, z: dz / d * k }, B);
  }
  return false;
}

test('시작할 때 은화 25개가 바닥에 있고, 시간이 지나도 사라지지 않는다', () => {
  const s = createState(B, 1);
  assert.equal(s.coins.length, B.coins.start.count);
  place(s, -20, -20); // 멀리
  run(s, STILL, (B.coins.lifetimeSeconds + 5) * TPS);
  assert.equal(s.coins.length, B.coins.start.count);
});

test('은화 근처(1.5m)를 지나가면 줍고 들고 있는 수가 오른다, 멀면 안 줍는다', () => {
  const s = fresh();
  place(s, 0, 12);
  spawnCoin(s, 1.4, 12, false, B);  // 1.4m: 주움
  spawnCoin(s, 0, 14, false, B);    // 2m: 안 주움
  step(s, STILL, B);
  assert.equal(s.commander.coins, 1);
  assert.equal(s.coins.length, 1);
  assert.ok(s.events.some(e => e.type === 'pickup'));
});

test('시작 은화 더미를 걸어서 지나가면 25개를 모두 줍는다', () => {
  const s = createState(B, 1);
  const st = B.coins.start;
  assert.ok(goTo(s, st.x, st.z));
  run(s, STILL, 2);
  assert.equal(s.commander.coins, st.count);
  assert.equal(s.coins.length, 0);
});

test('100개를 넘으면 더 줍지 않는다', () => {
  const s = fresh();
  place(s, 0, 12);
  s.commander.coins = B.coins.carryMax - 1;
  spawnCoin(s, 0.5, 12, false, B);
  spawnCoin(s, -0.5, 12, false, B);
  run(s, STILL, 3);
  assert.equal(s.commander.coins, B.coins.carryMax);
  assert.equal(s.coins.length, 1, '하나는 바닥에 남아야 함');
});

test('바닥 은화는 20초 뒤 사라진다', () => {
  const s = fresh();
  place(s, -20, -20);
  spawnCoin(s, 0, 14, false, B);
  run(s, STILL, B.coins.lifetimeSeconds * TPS - 1);
  assert.equal(s.coins.length, 1);
  run(s, STILL, 1);
  assert.equal(s.coins.length, 0);
});

test('패드 위에 서 있으면 초당 10개씩 들어가고 패드 남은 비용도 같이 준다', () => {
  const s = fresh();
  const p = pad(s, 'taxTable');
  s.unlocked.barracks = true; // 막사 해금된 상황
  run(s, STILL, 1);
  p.open = true;
  s.commander.coins = 30;
  place(s, p.x, p.z);
  run(s, STILL, TPS / 2); // 0.5초
  assert.equal(p.paid, 5);
  assert.equal(s.commander.coins, 25);
  run(s, STILL, TPS / 2); // 1초
  assert.equal(p.paid, B.pads.payPerSecond);
  assert.equal(p.cost - p.paid, 15 - 10);
});

test('패드를 떠났다가 돌아와도 넣은 만큼은 유지된다', () => {
  const s = fresh();
  const p = pad(s, 'barracks');
  s.commander.coins = 4;
  place(s, p.x, p.z);
  run(s, STILL, TPS);       // 4개 다 넣음 (비용 6)
  assert.equal(p.paid, 4);
  assert.equal(s.commander.coins, 0);
  place(s, 0, 12);
  run(s, STILL, TPS * 5);   // 떠나 있기
  assert.equal(p.paid, 4);
  s.commander.coins = 10;
  place(s, p.x, p.z);
  run(s, STILL, TPS);
  assert.equal(p.done, true, '남은 2개를 넣으면 해금');
  assert.equal(s.commander.coins, 8);
});

test('막사 해금 → 건물이 생기고 모집 패드·세금 탁자 패드가 열린다 (전에는 닫혀 있음)', () => {
  const s = fresh();
  assert.equal(pad(s, 'barracks').open, true);
  assert.equal(pad(s, 'recruit').open, false);
  assert.equal(pad(s, 'taxTable').open, false);
  // 닫힌 패드 위에서는 납부되지 않는다
  s.commander.coins = 20;
  const tax = pad(s, 'taxTable');
  place(s, tax.x, tax.z);
  run(s, STILL, TPS);
  assert.equal(tax.paid, 0);
  assert.equal(s.commander.coins, 20);
  // 막사 납부
  const bp = pad(s, 'barracks');
  place(s, bp.x, bp.z);
  run(s, STILL, TPS);
  assert.equal(bp.done, true);
  assert.equal(bp.open, false);
  assert.equal(s.buildings.filter(b => b.kind === 'barracks').length, 1);
  assert.equal(pad(s, 'recruit').open, true);
  assert.equal(pad(s, 'taxTable').open, true);
  // 건물 자리에 서 있던 성주는 밖으로 밀려난다
  const b = s.buildings[0];
  const c = s.commander;
  assert.ok(Math.abs(c.x - b.x) >= b.halfWidth || Math.abs(c.z - b.z) >= b.halfDepth);
});

test('모집 패드: 해금마다 궁수 +3, 다음 비용 +4, 궁수 6명이면 닫힌다', () => {
  const s = fresh();
  s.unlocked.barracks = true;
  run(s, STILL, 1);
  const rp = pad(s, 'recruit');
  rp.open = true;
  s.commander.coins = 100;
  place(s, rp.x, rp.z);
  run(s, STILL, TPS); // 8개 → 해금 1회
  assert.equal(s.archers.length, 3);
  assert.equal(rp.cost, 12);
  assert.equal(rp.paid, 2, '남은 시간 동안 다음 회차에 계속 납부');
  run(s, STILL, TPS * 2);
  assert.equal(s.archers.length, 6);
  assert.equal(rp.open, false);
  const left = s.commander.coins;
  run(s, STILL, TPS);
  assert.equal(s.commander.coins, left, '닫힌 뒤에는 더 안 들어감');
});

test('세금 탁자: 정해진 간격마다 1개씩(최대 40) 쌓이고, 가까이 가면 전부 가져간다', () => {
  const s = fresh();
  s.unlocked.barracks = true;
  run(s, STILL, 1);
  const tp = pad(s, 'taxTable');
  s.commander.coins = 15;
  place(s, tp.x, tp.z);
  run(s, STILL, TPS * 2);
  const table = s.buildings.find(b => b.kind === 'taxTable');
  assert.ok(table, '세금 탁자 생김');
  place(s, -20, -20); // 멀리 가서 기다리기
  table.stored = 0; table.timer = 0;
  const every = Math.round(B.buildings.taxTable.intervalSeconds * TPS);
  run(s, STILL, every - 1);
  assert.equal(table.stored, 0);
  run(s, STILL, 1);
  assert.equal(table.stored, 1);
  run(s, STILL, every * 50);
  assert.equal(table.stored, B.buildings.taxTable.max);
  const before = s.commander.coins;
  place(s, table.x, table.z + table.halfDepth + 1);
  run(s, STILL, 1);
  assert.equal(table.stored, 0);
  assert.equal(s.commander.coins, before + B.buildings.taxTable.max);
});

test('세금 탁자에서 가져올 때도 100개 상한을 지킨다', () => {
  const s = fresh();
  s.unlocked.taxTable = true;
  s.buildings.push({ id: 999, kind: 'taxTable', x: 6.5, z: 6.5, halfWidth: 0.8, halfDepth: 0.5, stored: 30, timer: 0, hp: 0, maxHp: 0 });
  s.commander.coins = 90;
  place(s, 6.5, 7.6);
  run(s, STILL, 1);
  assert.equal(s.commander.coins, 100);
  assert.equal(s.buildings[0].stored, 20);
});

test('건물은 성주의 이동을 막는다', () => {
  const s = fresh();
  s.commander.coins = 6;
  const bp = pad(s, 'barracks');
  place(s, bp.x, bp.z);
  run(s, STILL, TPS);
  const b = s.buildings[0];
  place(s, b.x + b.halfWidth + 2, b.z);
  run(s, { x: -1, z: 0 }, TPS * 2);
  assert.ok(s.commander.x >= b.x + b.halfWidth + B.commander.radius - 1e-6, `건물 안으로 들어감 x=${s.commander.x}`);
});

test('패드 자리는 길·성채·나무·바위·다른 패드와 겹치지 않는다', () => {
  for (const seed of [1, 2, 3, 42, 777]) {
    const s = createState(B, seed);
    for (const p of s.pads) {
      for (const path of s.paths) assert.ok(distToPolyline(p.x, p.z, path.points) > path.width / 2 + p.half, `${p.id} 길 위`);
      const k = s.castle;
      assert.ok(Math.abs(p.x - k.x) > k.halfWidth + p.half || Math.abs(p.z - k.z) > k.halfDepth + p.half, `${p.id} 성채`);
      for (const o of s.obstacles) assert.ok(Math.hypot(p.x - o.x, p.z - o.z) > p.half * Math.SQRT2 + o.r, `${p.id} 장애물 seed ${seed}`);
      const shares = q => { const d = B.pads.list.find(x => x.id === p.id), e = B.pads.list.find(x => x.id === q.id); return d.sharesSpotWith === q.id || e.sharesSpotWith === p.id; };
      for (const q of s.pads) if (q !== p && !shares(q)) assert.ok(Math.hypot(p.x - q.x, p.z - q.z) > p.half * 2 + 1, `${p.id}-${q.id}`);
    }
  }
});

test('처음부터 끝까지: 은화 줍기 → 막사 → 세금 탁자 → 모집 (자동 조종, 결정론)', () => {
  const play = () => {
    const s = createState(B, 1);
    const st = B.coins.start;
    const route = [];
    const walk = (x, z) => { assert.ok(goTo(s, x, z), `(${x},${z})에 못 감`); route.push([s.commander.x, s.commander.z]); };
    walk(st.x, st.z);
    for (let i = 0; i < 4; i++) walk(st.x + Math.cos(i * 1.6) * st.spread, st.z + Math.sin(i * 1.6) * st.spread);
    walk(st.x, st.z);
    assert.equal(s.commander.coins, 25);
    const bp = pad(s, 'barracks');
    walk(bp.x, bp.z + 3); walk(bp.x, bp.z);
    run(s, STILL, TPS);
    assert.ok(s.unlocked.barracks);
    const tp = pad(s, 'taxTable');
    walk(tp.x - 3, tp.z + 2.5); walk(tp.x, tp.z);
    run(s, STILL, TPS * 2);
    assert.ok(s.unlocked.taxTable);
    assert.equal(s.commander.coins, 25 - 6 - 15);
    // 세금이 쌓일 때까지 기다렸다가 가져가서 모집 패드에
    walk(tp.x, tp.z + 3);
    run(s, STILL, TPS * 30);
    walk(tp.x, tp.z + 1.5);
    assert.ok(s.commander.coins >= 8 + 4, `세금 수거 후 ${s.commander.coins}`);
    const rp = pad(s, 'recruit');
    walk(rp.x + 3, rp.z + 2); walk(rp.x, rp.z);
    run(s, STILL, TPS);
    assert.equal(s.archers.length, 3);
    return { tick: s.tick, coins: s.commander.coins, x: s.commander.x, z: s.commander.z, route };
  };
  assert.deepEqual(play(), play());
});
