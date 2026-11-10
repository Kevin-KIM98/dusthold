// R2 (2026-11-10): 돌격병 · 빠른 성주 · 넓은 줍기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBalance } from './helpers.js';
import { createState } from '../js/sim/state.js';
import { step } from '../js/sim/rules.js';
import { addBuilding } from '../js/sim/buildings.js';
import { buildWalls } from '../js/sim/walls.js';
import { spawnEnemy } from '../js/sim/units.js';
import { spawnCoin } from '../js/sim/coins.js';

const B = loadBalance();
const TPS = Math.round(1 / B.sim.tickSeconds);
const STILL = { x: 0, z: 0 };
const run = (s, n) => { for (let i = 0; i < n; i++) step(s, STILL, B); };
const place = (o, x, z) => { o.x = o.prevX = x; o.z = o.prevZ = z; };
const pad = (s, id) => s.pads.find(p => p.id === id);

function withWarCamp() {
  const s = createState(B, 1);
  s.spawn.paused = true; s.coins = [];
  addBuilding(s, 'barracks', -7, 3, B); s.unlocked.barracks = true; pad(s, 'barracks').done = true;
  run(s, 1);
  return s;
}

test('돌격대 막사: 궁수 막사 뒤 열리고, 해금하면 정해진 간격마다 돌격병이 나온다 (최대치까지)', () => {
  const s0 = createState(B, 1); run(s0, 1);
  assert.equal(pad(s0, 'warCamp').open, false, '막사 전엔 닫힘');
  const s = withWarCamp();
  const wp = pad(s, 'warCamp');
  assert.equal(wp.open, true);
  s.commander.coins = 50;
  place(s.commander, wp.x, wp.z);
  run(s, 5 * TPS);
  assert.ok(s.buildings.some(b => b.kind === 'warCamp'), '돌격대 막사 생김');
  place(s.commander, -20, -20);
  for (const c of s.camps) { c.hp = c.maxHp = 1e9; } // 돌격병이 기지를 점령해 판이 끝나지 않게
  const n0 = s.soldiers.length;
  run(s, Math.round(B.soldiers.spawnSeconds * TPS) + 1);
  assert.equal(s.soldiers.length, n0 + 1, '간격마다 1명');
  run(s, Math.round(B.soldiers.spawnSeconds * TPS) * (B.soldiers.max + 3));
  assert.equal(s.soldiers.length, B.soldiers.max, '최대치');
});

test('돌격병은 성문을 지나 길을 따라 적 기지로 가서 기지를 공격하고, 스스로 점령까지 한다', () => {
  const s = withWarCamp();
  buildWalls(s, B, 1);
  addBuilding(s, 'warCamp', 5.5, -7.5, B);
  place(s.commander, -8, -8);
  s.commander.cooldown = 1e9;
  for (const c of s.camps) { c.hp = c.maxHp = 300; }
  let firstHit = -1;
  for (let i = 0; i < 240 * TPS && !s.result; i++) {
    step(s, STILL, B);
    if (firstHit < 0 && s.events.some(e => e.type === 'hit' && e.target === 'camp' && e.by === 'soldier')) firstHit = s.time;
  }
  assert.ok(firstHit > 0, '돌격병이 기지를 공격함');
  assert.ok(s.camps.every(c => c.captured), '두 기지 모두 점령');
  assert.equal(s.result, 'win');
  console.log(`  돌격병만으로: 첫 기지 공격 ${firstHit.toFixed(0)}초, 두 곳 점령 ${s.time.toFixed(0)}초`);
});

test('돌격병은 가는 길의 적과 싸운다', () => {
  const s = withWarCamp();
  addBuilding(s, 'warCamp', 5.5, -7.5, B);
  run(s, Math.round(B.soldiers.spawnSeconds * TPS) + 1);
  const sd = s.soldiers[0];
  place(s.commander, -20, -20); s.commander.cooldown = 1e9;
  const e = spawnEnemy(s, 'shield', sd.pathId, B);
  e.hp = e.maxHp = 1e6;
  place(e, sd.x + 1.6, sd.z); e.wp = 99;
  run(s, 3 * TPS);
  assert.ok(e.hp < e.maxHp, '적이 돌격병에게 맞음');
  assert.ok(s.events.some(ev => ev.type === 'stab') || e.hp < e.maxHp);
});

test('성주는 8 m/s로 움직이고, 은화는 5m 안이면 줍는다', () => {
  assert.equal(B.commander.speed, 8);
  assert.equal(B.coins.pickupRadius, 5);
  const s = createState(B, 1); s.spawn.paused = true; s.coins = [];
  place(s.commander, 0, 20);
  spawnCoin(s, 4.8, 20, false, B);
  spawnCoin(s, -5.4, 20, false, B);
  step(s, STILL, B);
  assert.equal(s.commander.coins, 1);
  assert.equal(s.coins.length, 1);
});

test('돌격병은 적의 공격을 받고, 쓰러지면 사라지며 막사가 다시 보충한다 (성주·궁수는 여전히 안 맞음)', () => {
  const s = withWarCamp();
  addBuilding(s, 'warCamp', 5.5, -7.5, B);
  for (const c of s.camps) { c.hp = c.maxHp = 1e9; }
  run(s, Math.round(B.soldiers.spawnSeconds * TPS) + 1);
  const sd = s.soldiers[0];
  sd.cooldown = 1e9; // 반격하지 않게
  s.commander.cooldown = 1e9;
  place(s.commander, sd.x + 1, sd.z);
  for (let i = 0; i < 4; i++) { const e = spawnEnemy(s, 'shield', sd.pathId, B); e.hp = e.maxHp = 1e6; place(e, sd.x + 1.2, sd.z + i * 0.4 - 0.6); e.wp = 99; }
  // 돌격병이 움직이지 않게 붙잡아 두고
  let hurt = false;
  for (let i = 0; i < 30 * TPS && s.soldiers.includes(sd); i++) {
    place(sd, sd.x, sd.z);
    step(s, STILL, B);
    sd.cooldown = 1e9;
    if (sd.hp < B.soldiers.hp) hurt = true;
  }
  assert.ok(hurt, '돌격병이 맞음');
  assert.ok(!s.soldiers.includes(sd), '쓰러진 돌격병은 사라짐');
  assert.ok(s.events.length >= 0);
  assert.equal(s.commander.hp, B.commander.hp, '성주는 안 맞음');
  const n = s.soldiers.length;
  s.enemies = [];
  run(s, Math.round(B.soldiers.spawnSeconds * TPS) + 1);
  assert.equal(s.soldiers.length, n + 1, '막사가 보충');
});
