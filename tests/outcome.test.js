// M5: 1장 클리어·게임 오버, 최악 장면 구성, 1차 밸런싱 확인 (plan.md ⑥ 목표·종료, 성능)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { createState, serialize, deserialize } from '../js/sim/state.js';
import { tick, advance, isFinished, checkOutcome } from '../js/sim/time.js';
import { debugDig, startBuild, assignBuilder, canBuild } from '../js/sim/bunker.js';
import { createWorstState, occupiedCells } from '../js/sim/worst.js';
import { playGame } from '../tools/bot.js';

const B = CONFIG.BUNKER;
const SC = B.SHAFT_COL;

test('⑥ 통신부품을 가지고 무선실을 완성하면 1장 클리어 (시뮬레이션이 멈춘다)', () => {
  const s = createState(500);
  s.door.hp = 1e9;
  Object.assign(s.resources, { wood: 150, scrap: 150 });
  debugDig(s, 2, SC + 1); debugDig(s, 2, SC + 2);
  assert.deepEqual(canBuild(s, 'radio', 2, SC + 1).params.need, { parts: 1 }, '통신부품 없으면 못 짓는다');
  s.resources.parts = 1;
  const r = startBuild(s, 'radio', 2, SC + 1);
  assert.equal(r.ok, true);
  assert.equal(s.resources.parts, 0, '통신부품을 쓴다');
  const b = s.survivors.find((v) => v.specialty === 'build');
  assignBuilder(s, b.id, r.id);
  let n = 0;
  while (!s.outcome && n < 2000) { tick(s); n++; }
  assert.equal(s.outcome, 'victory');
  assert.ok(Math.abs(n - B.ROOMS.radio.sec * 0.67 * 10) <= 2, `무선실 60초 × 건설 특기 (${n}틱)`);
  assert.ok(s.events.some((e) => e.key === 'outcome.victory'));
  assert.ok(s.log.some((e) => e.key === 'log.victory'));
  assert.equal(isFinished(s), true);
  const t0 = s.time.tick;
  assert.equal(advance(s, 0.2), 0, '클리어하면 시간이 멈춘다');
  assert.equal(s.time.tick, t0);
  // '계속 둘러보기'
  s.afterVictory = true;
  assert.equal(isFinished(s), false);
  assert.ok(advance(s, 0.2) > 0);
  // 저장·복원해도 결과가 남는다
  const back = deserialize(serialize(s));
  assert.equal(back.outcome, 'victory');
  assert.equal(back.stats.built >= 1, true);
});

test('⑥ 생존자가 0명이 되면 게임 오버 (대기자가 있으면 아직 아님)', () => {
  const s = createState(501);
  s.waiting.push({ ...s.survivors[0], id: 99, name: '대기' });
  for (const v of s.survivors) v.hp = 0;
  tick(s);
  assert.equal(s.outcome, null, '대기자가 입주해 버틴다');
  assert.equal(s.survivors.length, 1);
  s.survivors[0].hp = 0;
  tick(s);
  assert.equal(s.outcome, 'defeat');
  assert.ok(s.events.some((e) => e.key === 'outcome.defeat'));
  assert.equal(advance(s, 0.2), 0, '게임 오버면 멈춘다');
  assert.equal(checkOutcome(s), 'defeat', '한 번 정해지면 바뀌지 않는다');
});

test('통계: 처치한 좀비·탐험한 칸·지은 방이 쌓인다', () => {
  const s = createState(502);
  assert.deepEqual(s.stats, { killed: 0, explored: 0, built: 0 });
  const r = playGame(1010, 20);
  assert.ok(r.state.stats.killed > 0 && r.state.stats.explored > 0 && r.state.stats.built > 0);
});

test('⑥ 성능: 최악 장면 = 지상 121칸 전부 + 벙커 40칸 + 좀비 40마리', () => {
  const s = createWorstState();
  assert.equal(s.surface.tiles.filter((t) => t.revealed).length, 121);
  assert.equal(occupiedCells(s), 40);
  assert.equal(s.raid.zombies.length, CONFIG.RAID.MAX);
  assert.equal(CONFIG.FX.MAX_PARTICLES, 150);
  assert.ok(s.raid.zombies.some((z) => z.phase === 'door') && s.raid.zombies.some((z) => z.phase === 'approach'), '문 앞과 접근 중이 섞여 있다');
  // 시뮬레이션도 최악 장면에서 빠르다: ×3 배속 1초 = 30틱이 2ms 안쪽이어야 프레임에 여유
  const t0 = performance.now();
  for (let k = 0; k < 300; k++) tick(s);
  const perTick = (performance.now() - t0) / 300;
  assert.ok(perTick < 1, `틱 1회 ${perTick.toFixed(3)}ms`);
});

test('1차 밸런싱: 자동 플레이어가 클리어할 수 있고, 첫날 밤에 문이 부서지지 않는다', () => {
  const runs = [];
  for (let k = 1; k <= 12; k++) runs.push(playGame(1000 + k, 20));
  const wins = runs.filter((r) => r.outcome === 'victory');
  assert.ok(wins.length >= 2, `12판 중 ${wins.length}판 클리어`);
  assert.ok(wins.every((r) => r.day >= 7), '너무 쉽게 끝나지 않는다 (7일차 이상)');
  assert.equal(runs.filter((r) => r.firstBreachDay === 1).length, 0, '첫날 밤 문 파괴 0');
  assert.ok(runs.filter((r) => r.outcome === 'defeat').length <= 4, '전멸은 소수');
});
