// R1 개편 로직 테스트 (2026-11-10): 적 기지·무한 등장·건물만 공격·재건·점령·절벽·범위 베기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBalance } from './helpers.js';
import { createState } from '../js/sim/state.js';
import { step } from '../js/sim/rules.js';
import { spawnRate } from '../js/sim/camps.js';
import { spawnEnemy, spawnArchers } from '../js/sim/units.js';
import { addBuilding } from '../js/sim/buildings.js';
import { buildWalls } from '../js/sim/walls.js';
import { distToPolyline } from '../js/sim/collision.js';
import { playGame } from './bot.js';

const B = loadBalance();
const TPS = Math.round(1 / B.sim.tickSeconds);
const STILL = { x: 0, z: 0 };
const run = (s, n, input = STILL) => { for (let i = 0; i < n; i++) step(s, input, B); };
const place = (o, x, z) => { o.x = o.prevX = x; o.z = o.prevZ = z; };
const pad = (s, id) => s.pads.find(p => p.id === id);
const W = B.walls.half;

test('적 기지 2곳(길마다 1곳)에서 시작 지연 뒤부터 적이 끝없이 나오고, 시간이 갈수록 빨라진다', () => {
  const s = createState(B, 1);
  assert.equal(s.camps.length, 2);
  for (const c of s.camps) {
    const p = s.paths.find(q => q.id === c.pathId);
    assert.ok(distToPolyline(c.x, c.z, p.points) < 0.01 && Math.max(Math.abs(c.x), Math.abs(c.z)) > 20, '길 끝 바깥쪽');
  }
  place(s.commander, -8, -8);
  run(s, B.camps.startDelaySeconds * TPS - 2);
  assert.equal(s.enemies.length, 0, '시작 지연 전엔 없음');
  run(s, 3 * TPS);
  assert.ok(s.enemies.length >= 2, '두 기지에서 나옴');
  assert.deepEqual([...new Set(s.enemies.map(e => e.pathId))].sort(), ['east', 'south']);
  const early = spawnRate(s, B).interval;
  s.tick += (B.camps.rampSeconds + 10) * TPS;
  const late = spawnRate(s, B);
  assert.ok(late.interval < early, `빨라짐 ${early} → ${late.interval}`);
  assert.ok(Math.abs(late.interval - B.camps.intervalMin) < 1e-9);
  assert.ok(late.shield > B.camps.shieldStart);
});

test('동시에 살아 있는 적은 최대치를 넘지 않는다 (폰 성능)', () => {
  const s = createState(B, 1);
  s.tick = (B.camps.rampSeconds + 60) * TPS; s.spawn.startTick = 0;
  for (const c of s.camps) { c.nextTick = 0; c.hp = 1e9; c.maxHp = 1e9; }
  s.castle.hp = s.castle.maxHp = 1e12;
  place(s.commander, -25, -25);
  let max = 0;
  for (let i = 0; i < 400 * TPS; i++) { step(s, STILL, B); max = Math.max(max, s.enemies.length); }
  assert.ok(max <= B.camps.maxAlive, `최대 ${max}`);
  assert.ok(max >= B.camps.maxAlive - 5, `대군이 실제로 모임 ${max}`);
});

test('적은 성주·궁수를 공격하지 않는다 (옆을 지나가도 체력 그대로)', () => {
  const s = createState(B, 1);
  s.commander.cooldown = 1e9; // 성주도 공격 안 하게 (지나가는지만 보기)
  place(s.commander, 1.0, 22);
  spawnArchers(s, 3, 1.0, 20, B);
  s.archers.forEach(a => { a.cooldown = 1e9; });
  for (let i = 0; i < 6; i++) { const e = spawnEnemy(s, i % 2 ? 'shield' : 'raider', 'south', B); place(e, 0.5 + i * 0.3, 23 + i); e.wp = 2; }
  const g = spawnEnemy(s, 'giant', 'south', B); place(g, 1.5, 24); g.wp = 2;
  run(s, 15 * TPS);
  assert.equal(s.commander.hp, B.commander.hp);
  for (const a of s.archers) assert.equal(a.hp, B.archers.hp);
  assert.ok(!s.events.some(e => e.type === 'hit' && (e.target === 'commander' || e.target === 'archer')));
});

test('적은 막사·세금 탁자·망루를 공격하지 않고 지나가, 메인 성채만 공격한다', () => {
  const s = createState(B, 1);
  s.spawn.paused = true;
  // 남쪽 길 끝(성채 앞) 바로 옆에 건물들을 둔다
  const blds = [addBuilding(s, 'barracks', -3.2, 7.5, B), addBuilding(s, 'taxTable', 2.6, 8.5, B), addBuilding(s, 'tower', 3.0, 11.0, B)];
  blds[2].towerArchers.forEach(t => { t.cooldown = 1e9; }); // 망루가 적을 잡지 않게
  s.commander.cooldown = 1e9;
  place(s.commander, -20, -20);
  for (let i = 0; i < 8; i++) { const e = spawnEnemy(s, i % 3 ? 'raider' : 'shield', 'south', B); place(e, -0.6 + (i % 3) * 0.5, 14 + i * 0.8); e.wp = 3; }
  const g = spawnEnemy(s, 'giant', 'south', B); place(g, 0, 16); g.wp = 3;
  const hp0 = blds.map(b => b.hp);
  run(s, 60 * TPS);
  blds.forEach((b, i) => assert.equal(b.hp, hp0[i], `${b.kind}는 멀쩡`));
  assert.ok(s.castle.hp < B.castle.hp, '성채는 공격당함');
  assert.ok(!s.events.some(e => e.type === 'hit' && e.target === 'building'));
});

test('성벽 구간이 부서지면 성벽 패드가 절반 비용(15)으로 열리고, 내면 모든 구간을 지금 단계로 다시 세운다', () => {
  const s = createState(B, 1);
  s.spawn.paused = true;
  s.unlocked.taxTable = true;
  pad(s, 'walls').done = true; s.unlocked.walls = true;
  buildWalls(s, B, 1);
  const total = s.walls.length;
  s.walls[3].hp = 0;
  run(s, 1);
  const wp = pad(s, 'walls');
  assert.equal(s.walls.length, total - 1);
  assert.equal(wp.done, false);
  assert.equal(wp.cost, Math.ceil(30 * B.buildings.rebuildCostFactor));
  s.commander.coins = 20;
  place(s.commander, wp.x, wp.z);
  run(s, 3 * TPS);
  assert.equal(s.walls.length, total, '모든 구간 다시');
  assert.equal(s.wallLevel, 1);
  assert.equal(wp.done, true);
});

test('성주·궁수가 적 기지를 부수면 점령: 더는 안 나오고 은화 60개, 두 곳 다 점령하면 승리 + 남은 적은 은화로', () => {
  const s = createState(B, 1);
  s.tick = s.spawn.startTick + B.camps.startDelaySeconds * TPS; // 바로 나오기 시작
  const [c1, c2] = s.camps;
  place(s.commander, c1.sx, c1.sz);
  spawnArchers(s, 3, c1.sx, c1.sz + 1, B);
  const money = () => s.coins.reduce((a, k) => a + (k.value || 1), 0) + s.commander.coins;
  const coins0 = money();
  for (let i = 0; i < 120 * TPS && !c1.captured; i++) step(s, STILL, B);
  assert.equal(c1.captured, true, '점령');
  assert.ok(s.events.some(e => e.type === 'campCaptured') || c1.captured);
  assert.ok(money() - coins0 >= B.camps.captureCoins, '은화 쏟아짐 (바닥 + 주운 것)');
  const fromC1 = () => s.enemies.filter(e => e.pathId === c1.pathId && e.id > 0).length;
  const before = s.enemies.filter(e => e.pathId === c1.pathId).map(e => e.id);
  run(s, 20 * TPS);
  const newFromC1 = s.enemies.filter(e => e.pathId === c1.pathId && !before.includes(e.id));
  assert.equal(newFromC1.length, 0, '점령한 기지에선 안 나옴');
  // 두 번째 기지 점령 → 승리
  const alive = s.enemies.length;
  c2.hp = 1;
  place(s.commander, c2.sx, c2.sz);
  const kills0 = s.kills;
  for (let i = 0; i < 10 * TPS && !s.result; i++) step(s, STILL, B);
  assert.equal(s.result, 'win');
  assert.equal(s.enemies.length, 0, '남은 적 없음');
  assert.ok(s.kills >= kills0 + alive - 2, '남은 적은 은화로 바뀜');
});

test('절벽: 성벽 밖 길 양쪽에 절벽이 있고, 성주는 절벽을 넘어 길 밖으로 못 나간다', () => {
  const s = createState(B, 1);
  s.spawn.paused = true;
  const cliffs = s.obstacles.filter(o => o.kind === 'cliff');
  assert.ok(cliffs.length > 40, `절벽 ${cliffs.length}`);
  for (const o of cliffs) assert.ok(Math.max(Math.abs(o.x), Math.abs(o.z)) > W + 1, '성벽 안엔 없음');
  for (const p of s.paths) for (const o of cliffs) assert.ok(distToPolyline(o.x, o.z, p.points) > p.width / 2 + o.r * 0.9, '길을 막지 않음');
  // 남쪽 길 위(성벽 밖)에서 길과 수직으로 걸어가면 절벽에 막힘
  place(s.commander, 2.3, 20); // (3,22)-(−1,13) 선분 근처
  run(s, 4 * TPS, { x: 1, z: -0.45 });
  const p = s.paths.find(q => q.id === 'south');
  assert.ok(distToPolyline(s.commander.x, s.commander.z, p.points) < p.width / 2 + B.map.cliffs.offset + 0.1, '길 안에 머묾');
});

test('성주 칼: 2.2m 안 적 여럿을 한 번에(최대 8명) 벤다', () => {
  const s = createState(B, 1);
  s.spawn.paused = true;
  place(s.commander, 0, 20);
  const es = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, e = spawnEnemy(s, 'shield', 'south', B);
    place(e, Math.cos(a) * 1.6, 20 + Math.sin(a) * 1.6); e.wp = 99;
    es.push(e);
  }
  step(s, STILL, B);
  const hit = es.filter(e => e.hp < e.maxHp).length;
  assert.equal(hit, B.commander.cleaveMax, `한 번에 ${hit}명`);
  assert.ok(s.events.some(e => e.type === 'slash' && e.n === B.commander.cleaveMax));
});

test('자동 플레이어가 적 기지를 점령해 스테이지 1을 이긴다 (같은 시드 두 번 = 같은 결과)', () => {
  const a = playGame(createState, B, 5, 900), b = playGame(createState, B, 5, 900);
  assert.equal(a.result, 'win', `결과 ${a.result} ${a.camps.map(c => c.hp)}`);
  assert.equal(a.tick, b.tick);
  assert.equal(a.rng.s, b.rng.s);
  console.log(`  시드 5: ${(a.tick / TPS).toFixed(0)}초에 두 기지 점령, 처치 ${a.kills}`);
});
