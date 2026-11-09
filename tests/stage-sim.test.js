// 스테이지(이기면 다음 판) 로직 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBalance } from './helpers.js';
import { createState } from '../js/sim/state.js';
import { step } from '../js/sim/rules.js';
import { nextStage, stageScale } from '../js/sim/stages.js';
import { waveSize, waveComposition } from '../js/sim/waves.js';
import { spawnEnemy } from '../js/sim/units.js';
import { buildWalls } from '../js/sim/walls.js';
import { addBuilding } from '../js/sim/buildings.js';
import { serialize, deserialize } from '../js/sim/save.js';
import { playGame } from './bot.js';

const B = loadBalance();
const TPS = Math.round(1 / B.sim.tickSeconds);
const STILL = { x: 0, z: 0 };
const run = (s, ticks) => { for (let i = 0; i < ticks; i++) step(s, STILL, B); };

/** 스테이지 1을 이긴 상태 만들기 */
function wonState() {
  const s = createState(B, 1);
  addBuilding(s, 'barracks', -7, 3, B); s.unlocked.barracks = true; s.pads.find(p => p.id === 'barracks').done = true;
  buildWalls(s, B, 1);
  s.walls = s.walls.slice(3); // 몇 구간 부서진 채로
  s.commander.coins = 57;
  s.waves.current = B.waves.total;
  s.castle.hp = 321;
  s.commander.x = s.commander.prevX = -20; s.commander.z = s.commander.prevZ = -20;
  run(s, 3 * TPS);
  return s;
}

test('이기면(웨이브 10 전멸) 결과는 win, 다음 스테이지로 넘기면 건물·은화 유지 + 성채·성벽 정비 + 웨이브 처음부터', () => {
  const s = wonState();
  assert.equal(s.result, 'win');
  const full = createState(B, 1); buildWalls(full, B, 1);
  const wallsBefore = s.walls.length;
  assert.ok(nextStage(s, B));
  assert.equal(s.stage, 2);
  assert.equal(s.result, null);
  assert.equal(s.commander.coins, 57, '은화 유지');
  assert.equal(s.buildings.length, 1, '건물 유지');
  assert.equal(s.castle.hp, s.castle.maxHp, '성채 가득');
  assert.ok(s.walls.length > wallsBefore && s.walls.length === full.walls.length, '성벽 다시 세움');
  assert.equal(s.waves.current, 0);
  assert.ok(s.events.some(e => e.type === 'stageStart' && e.stage === 2));
  assert.equal(nextStage(s, B), false, '이긴 판에서만 넘어감');
});

test('다음 스테이지의 첫 웨이브도 시작 25초 뒤 (스테이지 시작 기준)', () => {
  const s = wonState();
  nextStage(s, B);
  run(s, B.waves.firstAt * TPS - 1);
  assert.equal(s.waves.current, 0);
  run(s, 1);
  assert.equal(s.waves.current, 1);
});

test('스테이지가 오를수록 적이 강해진다 (체력·공격력·웨이브 크기)', () => {
  const k2 = stageScale(2, B), k3 = stageScale(3, B);
  assert.ok(k3.hp > k2.hp && k2.hp > 1 && k2.attack > 1 && k2.size > 1);
  for (let n = 1; n <= 10; n++) assert.ok(waveSize(n, B, 3) >= waveSize(n, B, 1));
  assert.ok(waveSize(10, B, 3) > waveSize(10, B, 1));
  assert.ok(waveSize(10, B, 50) <= B.waves.cap, '상한 30');
  assert.equal(waveComposition(5, B, 2).filter(e => e.type === 'giant').length, 1, '거인 수는 그대로');
  const s = createState(B, 1); s.stage = 2;
  const e = spawnEnemy(s, 'raider', 'south', B);
  assert.equal(e.maxHp, Math.round(B.enemies.types.raider.hp * k2.hp));
  assert.equal(e.atk, k2.attack);
});

test('스테이지 2부터는 돌벽 패드가 웨이브 5를 기다리지 않는다', () => {
  const s = wonState();
  s.unlocked.walls = true; s.pads.find(p => p.id === 'walls').done = true;
  nextStage(s, B);
  run(s, 1);
  assert.equal(s.pads.find(p => p.id === 'stoneWalls').open, true);
});

test('저장: 클리어 화면에서 나갔다가 다시 오면 다음 스테이지부터 / 이전 형식(버전 1) 저장도 이어진다', () => {
  const s = wonState();
  const loaded = deserialize(serialize(s, B), B);
  assert.equal(loaded.stage, 2);
  assert.equal(loaded.result, null);
  assert.equal(loaded.commander.coins, 57);
  // 버전 1 (스테이지 없음)
  const v1 = createState(B, 1); run(v1, 10);
  const data = JSON.parse(serialize(v1, B));
  data.v = 1; delete data.state.stage; delete data.state.waves.startTick;
  const old = deserialize(JSON.stringify(data), B);
  assert.ok(old, '버전 1 저장 불러오기');
  assert.equal(old.stage, 1);
  assert.equal(old.waves.startTick, 0);
});

test('자동 플레이어: 스테이지 1을 이기고 다음 판으로 넘어가 스테이지 2도 진행된다 (결정론)', () => {
  const play = () => {
    const s = playGame(createState, B, 5, 600);
    assert.equal(s.result, 'win', '스테이지 1 승리');
    nextStage(s, B);
    for (let i = 0; i < 200 * TPS && !s.result; i++) step(s, STILL, B); // 가만히 있어도 망루·궁수가 막는지 일부 진행
    return { stage: s.stage, tick: s.tick, wave: s.waves.current, castle: s.castle.hp, kills: s.kills, result: s.result, rng: s.rng.s };
  };
  const a = play();
  assert.deepEqual(a, play());
  assert.equal(a.stage, 2);
  assert.ok(a.wave >= 5, `스테이지 2 웨이브 진행 ${a.wave}`);
  console.log('  스테이지 2 (가만히):', JSON.stringify(a));
});
