// M4 로직 테스트: 성벽·성문 · 망루 · 거인 · 돌벽 · 승패
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBalance } from './helpers.js';
import { createState } from '../js/sim/state.js';
import { step } from '../js/sim/rules.js';
import { buildWalls, layoutWalls } from '../js/sim/walls.js';
import { spawnEnemy, spawnArchers } from '../js/sim/units.js';
import { addBuilding } from '../js/sim/buildings.js';
import { waveStartSeconds } from '../js/sim/waves.js';
import { distToPolyline } from '../js/sim/collision.js';

const B = loadBalance();
const TPS = Math.round(1 / B.sim.tickSeconds);
const STILL = { x: 0, z: 0 };
const run = (s, input, ticks) => { for (let i = 0; i < ticks; i++) step(s, input, B); };
const place = (o, x, z) => { o.x = o.prevX = x; o.z = o.prevZ = z; };
const pad = (s, id) => s.pads.find(p => p.id === id);
const quiet = () => { const s = createState(B, 1); s.coins = []; s.waves.paused = true; return s; };
const W = B.walls.half;
function goTo(s, x, z, maxTicks = 800) {
  for (let i = 0; i < maxTicks; i++) {
    const dx = x - s.commander.x, dz = z - s.commander.z, d = Math.hypot(dx, dz);
    if (d < 0.2) return true;
    const k = Math.min(1, d / (B.commander.speed * B.sim.tickSeconds));
    step(s, { x: dx / d * k, z: dz / d * k }, B);
  }
  return false;
}
const gateOf = (s, pathId) => {
  const path = s.paths.find(p => p.id === pathId);
  return s.walls.find(w => w.gate && distToPolyline(w.x, w.z, path.points) < 0.5);
};

test('성벽 배치: 성채를 빈틈없이 두르고, 두 길이 지나는 자리에만 성문이 있다', () => {
  const s = quiet();
  const walls = layoutWalls(s, B);
  const gates = walls.filter(w => w.gate);
  assert.equal(gates.length, 2);
  for (const p of s.paths) assert.ok(gates.some(g => distToPolyline(g.x, g.z, p.points) < 0.5), `${p.id} 길 위 성문`);
  for (const w of walls.filter(w => !w.gate)) {
    for (const p of s.paths) assert.ok(distToPolyline(w.x, w.z, p.points) > 1, '목책이 길을 막지 않음(성문만)');
  }
  // 둘레를 0.25m 간격으로 돌며 어느 구간에든 덮이는지
  const covered = (x, z) => walls.some(w => Math.abs(x - w.x) <= w.halfWidth + 1e-6 && Math.abs(z - w.z) <= w.halfDepth + 1e-6);
  for (let v = -W; v <= W; v += 0.25) {
    for (const [x, z] of [[v, W], [v, -W], [W, v], [-W, v]]) assert.ok(covered(x, z), `빈틈 (${x},${z})`);
  }
  // 성벽 안쪽에 나무·바위 없음 / 패드는 모두 안쪽
  for (const o of s.obstacles) assert.ok(Math.max(Math.abs(o.x), Math.abs(o.z)) > W + 1, '성벽 근처 장애물');
  for (const p of s.pads) assert.ok(Math.max(Math.abs(p.x), Math.abs(p.z)) + p.half < W - 0.3, `${p.id} 패드가 성벽 안`);
});

test('성벽 패드: 세금 탁자 뒤에 열리고, 해금하면 목책(구간당 600)·성문이 생긴다', () => {
  const s = quiet();
  const wp = pad(s, 'walls');
  run(s, STILL, 1);
  assert.equal(wp.open, false);
  s.unlocked.taxTable = true;
  run(s, STILL, 1);
  assert.equal(wp.open, true);
  s.commander.coins = 40;
  place(s.commander, wp.x, wp.z);
  run(s, STILL, 4 * TPS);
  assert.ok(s.unlocked.walls);
  assert.ok(s.walls.length >= 10);
  for (const w of s.walls) assert.equal(w.hp, B.walls.woodHp);
  assert.equal(s.wallLevel, 1);
  // 망루 패드 4개가 열림
  for (const id of ['tower1', 'tower2', 'tower3', 'tower4']) assert.equal(pad(s, id).open, true, id);
});

test('적은 성벽(성문)을 공격해야 지나간다 — 성문이 버티는 동안 성채는 멀쩡', () => {
  const s = createState(B, 1);
  buildWalls(s, B, 1);
  place(s.commander, -8, -8);
  run(s, STILL, 60 * TPS);
  const gate = gateOf(s, 'south');
  assert.ok(gate, '성문 남아 있음');
  assert.ok(gate.hp < B.walls.woodHp, '성문이 공격당함');
  assert.equal(s.castle.hp, B.castle.hp, '성채는 피해 없음');
  for (const e of s.enemies) assert.ok(Math.max(Math.abs(e.x), Math.abs(e.z)) > W - 0.05, '적이 벽 안으로 못 들어옴');
});

test('성문이 부서지면 적이 들어와 성채를 공격한다', () => {
  const s = createState(B, 1);
  buildWalls(s, B, 1);
  place(s.commander, -8, -8);
  gateOf(s, 'south').hp = 1;
  run(s, STILL, 60 * TPS);
  assert.equal(gateOf(s, 'south'), undefined, '성문 부서짐');
  assert.ok(s.castle.hp < B.castle.hp);
});

test('성주는 성문을 통과하고, 목책은 통과하지 못한다', () => {
  const s = quiet();
  buildWalls(s, B, 1);
  const gate = gateOf(s, 'south');
  place(s.commander, gate.x, W - 2);
  run(s, { x: 0, z: 1 }, 2 * TPS);
  assert.ok(s.commander.z > W + 1, `성문 밖으로 나감 z=${s.commander.z}`);
  place(s.commander, -6, W - 2); // 목책 쪽
  run(s, { x: 0, z: 1 }, 2 * TPS);
  assert.ok(s.commander.z < W - B.walls.thickness / 2, `목책 통과함 z=${s.commander.z}`);
});

test('궁수는 성주를 따라 성문으로 나갔다 들어온다', () => {
  const s = quiet();
  buildWalls(s, B, 1);
  const gate = gateOf(s, 'south');
  place(s.commander, -4, 4);
  spawnArchers(s, 6, -4, 3, B);
  run(s, STILL, TPS);
  assert.ok(goTo(s, gate.x, W - 2));
  assert.ok(goTo(s, gate.x, W + 5));
  run(s, STILL, 3 * TPS);
  for (const a of s.archers) assert.ok(a.z > W + 0.5, `궁수가 밖으로 나옴 z=${a.z.toFixed(2)}`);
  assert.ok(goTo(s, gate.x, W - 3));
  assert.ok(goTo(s, -3, 6));
  run(s, STILL, 4 * TPS);
  for (const a of s.archers) assert.ok(a.z < W - 0.5, `궁수가 안으로 돌아옴 z=${a.z.toFixed(2)}`);
});

test('망루를 해금하면 궁수 4명이 올라가 사거리 8m 안 적을 고정 사격한다 (무적)', () => {
  const s = quiet();
  s.unlocked.walls = true;
  buildWalls(s, B, 1);
  const tp = pad(s, 'tower1');
  s.commander.coins = 30;
  place(s.commander, tp.x, tp.z);
  run(s, STILL, 4 * TPS);
  const tower = s.buildings.find(b => b.kind === 'tower');
  assert.ok(tower, '망루 생김');
  assert.equal(tower.towerArchers.length, 4);
  place(s.commander, -8, -8);
  const e = spawnEnemy(s, 'shield', 'south', B);
  const r = B.enemies.types.shield.radius;
  place(e, tower.x, tower.z + B.towers.range + r + 1); e.wp = 99;
  for (let i = 0; i < 5; i++) { place(e, tower.x, tower.z + B.towers.range + r + 1); step(s, STILL, B); }
  assert.equal(e.hp, e.maxHp, '사거리 밖은 안 쏨');
  place(e, tower.x, tower.z + 5);
  step(s, STILL, B);
  assert.equal(e.maxHp - e.hp, 4 * B.towers.attack, '4명이 한 번에 쏨');
  const shots = s.events.filter(ev => ev.type === 'shot' && ev.from === 'tower').length;
  assert.equal(shots, 4);
});

test('망루 강화: 망루 2개 이상이면 열리고, 쓸 때마다 망루 1개 공격력 ×1.5', () => {
  const s = quiet();
  s.unlocked.walls = true;
  buildWalls(s, B, 1);
  const up = pad(s, 'towerUpgrade');
  addBuilding(s, 'tower', -4.5, 9.3, B); s.unlocked.tower = true;
  run(s, STILL, 1);
  assert.equal(up.open, false, '망루 1개면 닫힘');
  addBuilding(s, 'tower', 3.5, 9.3, B);
  run(s, STILL, 1);
  assert.equal(up.open, true);
  s.commander.coins = 100;
  place(s.commander, up.x, up.z);
  run(s, STILL, 11 * TPS);
  const towers = s.buildings.filter(b => b.kind === 'tower');
  assert.equal(towers.filter(t => t.upgraded).length, 1);
  s.commander.coins = 100;
  run(s, STILL, 11 * TPS);
  assert.equal(towers.filter(t => t.upgraded).length, 2);
  assert.equal(up.open, false, '모두 강화되면 닫힘');
  // 강화된 망루의 한 발 = 8 × 1.5
  place(s.commander, -8, -8);
  const e = spawnEnemy(s, 'shield', 'south', B); e.wp = 99;
  place(e, towers[0].x - 7.5, towers[0].z); // 망루 0만 사거리 안
  step(s, STILL, B);
  const dmg = s.events.filter(ev => ev.type === 'hit' && ev.target === 'enemy').map(ev => ev.dmg);
  assert.ok(dmg.length > 0 && dmg.every(d => d === B.towers.attack * B.towers.upgradeMultiplier), `피해 ${dmg}`);
});

test('웨이브 5에 거인이 나와, 성주가 옆에 있어도 성벽부터 부순다', () => {
  const s = createState(B, 1);
  buildWalls(s, B, 1);
  s.waves.current = 4;
  s.tick = Math.round(waveStartSeconds(5, B) * TPS) - 1;
  s.time = s.tick * B.sim.tickSeconds;
  const gate = gateOf(s, 'south');
  place(s.commander, gate.x + 0.6, W - 1.2); // 성문 바로 안쪽
  s.commander.cooldown = 1e9;
  let giant = null, firstHit = null;
  for (let i = 0; i < 120 * TPS && !firstHit; i++) {
    step(s, STILL, B);
    giant = giant || s.enemies.find(e => e.type === 'giant');
    if (giant) {
      // 다른 적이 성문을 먼저 부수지 않도록 일반 병사는 치움
      for (const e of s.enemies) if (e.type !== 'giant') e.hp = 0;
      s.commander.hp = B.commander.hp; s.commander.alive = true;
    }
    if (giant && giant.cooldown > 0 && giant.attacking) firstHit = s.events.find(ev => ev.type === 'hit' && ev.target !== 'enemy');
  }
  assert.ok(giant, '웨이브 5에 거인 등장');
  assert.equal(giant.wave, 5, '웨이브 5의 거인');
  assert.ok(firstHit, '거인이 공격함');
  assert.equal(firstHit.target, 'wall', `거인의 첫 공격 대상: ${firstHit.target}`);
  // 목책 체력 ÷ 거인 공격력 만큼 내려치면 부서짐
  const hitsNeeded = Math.ceil(B.walls.woodHp / B.enemies.types.giant.attack);
  run(s, STILL, Math.ceil((hitsNeeded + 1) * B.enemies.types.giant.attackInterval * TPS));
  assert.equal(gateOf(s, 'south'), undefined, '거인이 성문을 부숨');
});

test('돌벽: 웨이브 5부터 열리고, 부서진 구간까지 모두 1500으로 다시 세운다', () => {
  const s = quiet();
  s.unlocked.walls = true;
  const wp = pad(s, 'walls');
  wp.done = true;
  buildWalls(s, B, 1);
  const total = s.walls.length;
  s.walls = s.walls.slice(2); // 두 구간 부서짐
  const sp = pad(s, 'stoneWalls');
  run(s, STILL, 1);
  assert.equal(sp.open, false, '웨이브 5 전에는 닫힘');
  s.waves.current = 5;
  run(s, STILL, 1);
  assert.equal(sp.open, true);
  s.commander.coins = 100;
  place(s.commander, sp.x, sp.z);
  run(s, STILL, 11 * TPS);
  assert.equal(s.wallLevel, 2);
  assert.equal(s.walls.length, total, '부서진 구간도 다시');
  for (const w of s.walls) { assert.equal(w.hp, B.walls.stoneHp); assert.equal(w.maxHp, B.walls.stoneHp); }
});

test('승리: 웨이브 10까지 다 나오고 적을 모두 처치하면 win, 그 뒤로는 멈춤', () => {
  const s = quiet();
  s.waves.paused = false;
  s.waves.current = B.waves.total;
  const e = spawnEnemy(s, 'raider', 'south', B); e.wp = 99;
  place(e, 0, 25);
  run(s, STILL, 1);
  assert.equal(s.result, null, '적이 남아 있으면 아직');
  e.hp = 0;
  run(s, STILL, 1);
  assert.equal(s.result, 'win');
  const t = s.tick;
  run(s, { x: 1, z: 0 }, 10);
  assert.equal(s.tick, t, '끝난 판은 멈춤');
});

test('패배: 성채 체력이 0이 되면 lose', () => {
  const s = createState(B, 1);
  place(s.commander, -25, -25);
  let lostAt = -1;
  for (let i = 0; i < 300 * TPS && !s.result; i++) { step(s, STILL, B); if (s.result) lostAt = s.time; }
  assert.equal(s.result, 'lose');
  assert.equal(s.castle.hp, 0);
  console.log(`  아무것도 안 하면 ${lostAt.toFixed(0)}초(웨이브 ${s.waves.current})에 패배`);
});
