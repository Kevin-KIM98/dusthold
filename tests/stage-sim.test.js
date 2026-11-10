// 스테이지 (이기면 다음 판) 로직 테스트 — 적 기지 점령 방식
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBalance } from './helpers.js';
import { createState } from '../js/sim/state.js';
import { step } from '../js/sim/rules.js';
import { nextStage, stageScale } from '../js/sim/stages.js';
import { spawnEnemy } from '../js/sim/units.js';
import { buildWalls } from '../js/sim/walls.js';
import { addBuilding } from '../js/sim/buildings.js';
import { serialize, deserialize } from '../js/sim/save.js';

const B = loadBalance();
const TPS = Math.round(1 / B.sim.tickSeconds);
const run = (s, n) => { for (let i = 0; i < n; i++) step(s, { x: 0, z: 0 }, B); };

function wonState() {
  const s = createState(B, 1);
  addBuilding(s, 'barracks', -7, 3, B); s.unlocked.barracks = true; s.pads.find(p => p.id === 'barracks').done = true;
  buildWalls(s, B, 1); s.unlocked.walls = true; s.pads.find(p => p.id === 'walls').done = true;
  s.walls = s.walls.slice(3);
  s.commander.coins = 57;
  s.castle.hp = 321;
  for (const c of s.camps) c.hp = 0;
  run(s, 2);
  return s;
}

test('적 기지를 모두 점령하면 win → 다음 스테이지: 건물·은화 유지, 성채·성벽 정비, 적 기지 새로', () => {
  const s = wonState();
  assert.equal(s.result, 'win');
  const full = createState(B, 1); buildWalls(full, B, 1);
  const oldIds = s.camps.map(c => c.id);
  assert.ok(nextStage(s, B));
  assert.equal(s.stage, 2);
  assert.equal(s.result, null);
  assert.equal(s.commander.coins, 57);
  assert.equal(s.buildings.length, 1);
  assert.equal(s.castle.hp, s.castle.maxHp);
  assert.equal(s.walls.length, full.walls.length);
  assert.equal(s.camps.length, 2);
  assert.ok(s.camps.every(c => !c.captured && !oldIds.includes(c.id)), '새 기지');
  assert.equal(s.camps[0].maxHp, Math.round(B.camps.hp * stageScale(2, B).hp), '기지도 강해짐');
  assert.equal(nextStage(s, B), false);
});

test('다음 스테이지도 시작 지연 뒤부터 적이 나온다 (스테이지 시작 기준)', () => {
  const s = wonState();
  nextStage(s, B);
  s.commander.x = s.commander.prevX = -25; s.commander.z = s.commander.prevZ = -25;
  run(s, B.camps.startDelaySeconds * TPS - 2);
  assert.equal(s.enemies.length, 0);
  run(s, 3 * TPS);
  assert.ok(s.enemies.length > 0);
});

test('스테이지가 오를수록 적이 강해지고 더 빨리 나온다', () => {
  const k2 = stageScale(2, B);
  assert.ok(k2.hp > 1 && k2.attack > 1 && k2.spawn > 1);
  const s = createState(B, 1); s.stage = 2;
  const e = spawnEnemy(s, 'raider', 'south', B);
  assert.equal(e.maxHp, Math.round(B.enemies.types.raider.hp * k2.hp));
  assert.equal(e.atk, k2.attack);
});

test('저장: 클리어 화면에서 나갔다가 오면 다음 스테이지부터 / 예전(웨이브 방식) 저장도 기지·은화 그대로 이어진다', () => {
  const s = wonState();
  const loaded = deserialize(serialize(s, B), B);
  assert.equal(loaded.stage, 2);
  assert.equal(loaded.result, null);
  assert.equal(loaded.commander.coins, 57);
  const v2 = createState(B, 1); run(v2, 10);
  v2.commander.coins = 33;
  const data = JSON.parse(serialize(v2, B));
  data.v = 2; data.state.waves = { current: 4, queue: [], paused: false, startTick: 0 };
  delete data.state.spawn; delete data.state.camps;
  data.state.obstacles = data.state.obstacles.filter(o => o.kind !== 'cliff'); // 예전엔 절벽 없음
  const old = deserialize(JSON.stringify(data), B);
  assert.ok(old, '예전 저장 불러오기');
  assert.equal(old.commander.coins, 33);
  assert.equal(old.camps.length, 2);
  assert.ok(old.obstacles.some(o => o.kind === 'cliff'), '새 지형(절벽)');
  assert.equal(old.waves, undefined);
});
