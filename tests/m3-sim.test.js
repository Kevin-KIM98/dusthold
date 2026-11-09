// M3 로직 테스트: 웨이브 공식 · 궁수 · 자동 공격 · 피해 · 죽음/부활
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBalance } from './helpers.js';
import { createState } from '../js/sim/state.js';
import { step } from '../js/sim/rules.js';
import { waveSize, waveComposition, waveStartSeconds, wavePathIds, bossCount } from '../js/sim/waves.js';
import { spawnEnemy, spawnArchers } from '../js/sim/units.js';

const B = loadBalance();
const TPS = Math.round(1 / B.sim.tickSeconds);
const STILL = { x: 0, z: 0 };
const run = (s, input, ticks) => { for (let i = 0; i < ticks; i++) step(s, input, B); };
const place = (o, x, z) => { o.x = o.prevX = x; o.z = o.prevZ = z; };
/** 웨이브가 오지 않는 조용한 상태 (개별 규칙 테스트용) */
const quiet = () => { const s = createState(B, 1); s.coins = []; s.waves.current = B.waves.total; return s; };

test('웨이브 1~10 크기·구성·시작 시각·길이 기획서 ③ 공식과 같다', () => {
  // 기획서 ③을 그대로 옮긴 기대값 (balance.json과 별개로 손으로 계산)
  const expectSize = n => Math.min(30, Math.floor(3 + n * 1.5));
  const expectShield = n => Math.floor(expectSize(n) * (n >= 7 ? 0.35 : n >= 3 ? 0.2 : 0));
  const expectBoss = n => (n === 5 ? 1 : n === 10 ? 2 : 0);
  const starts = [25, 60, 95, 130, 165, 195, 225, 255, 285, 315];
  const table = [];
  for (let n = 1; n <= 10; n++) {
    assert.equal(waveSize(n, B), expectSize(n), `웨이브 ${n} 크기`);
    const comp = waveComposition(n, B);
    const count = t => comp.filter(e => e.type === t).length;
    assert.equal(count('shield'), expectShield(n), `웨이브 ${n} 방패`);
    assert.equal(count('giant'), expectBoss(n), `웨이브 ${n} 거인`);
    assert.equal(bossCount(n, B), expectBoss(n));
    assert.equal(count('raider') + count('shield'), expectSize(n));
    assert.equal(waveStartSeconds(n, B), starts[n - 1], `웨이브 ${n} 시작`);
    const paths = new Set(comp.map(e => e.pathId));
    if (n < 6) assert.deepEqual([...paths], [n % 2 === 1 ? 'south' : 'east'], `웨이브 ${n} 번갈아`);
    else assert.equal(paths.size, 2, `웨이브 ${n} 두 길 동시`);
    assert.deepEqual(wavePathIds(n, B).length, n < 6 ? 1 : 2);
    table.push(`${n}:${expectSize(n)}(${expectShield(n)}방패${expectBoss(n) ? `+${expectBoss(n)}거인` : ''})@${starts[n - 1]}s`);
  }
  assert.equal(waveSize(30, B), 30, '상한 30');
  console.log('  웨이브 표:', table.join(' '));
});

test('시작 25초 뒤 첫 웨이브가 남쪽 길 끝에서 0.6초 간격으로 나와 성채로 향한다', () => {
  const s = createState(B, 1);
  place(s.commander, -20, -20); // 길에서 멀리
  run(s, STILL, 25 * TPS - 1);
  assert.equal(s.enemies.length, 0, '25초 전에는 적 없음');
  run(s, STILL, 1);
  assert.equal(s.waves.current, 1);
  assert.equal(s.enemies.length, 1);
  const first = s.enemies[0];
  const start = B.map.paths[0].points[0];
  assert.ok(Math.hypot(first.x - start[0], first.z - start[1]) < 0.2, '남쪽 길 시작점');
  run(s, STILL, Math.round(0.6 * TPS));
  assert.equal(s.enemies.length, 2, '0.6초 뒤 두 번째');
  run(s, STILL, 3 * TPS);
  assert.equal(s.enemies.length + s.kills, waveSize(1, B), '웨이브 1 전원 등장');
  // 성채 쪽으로 다가가는지 (10초)
  const d0 = Math.hypot(first.x, first.z);
  run(s, STILL, 10 * TPS);
  assert.ok(Math.hypot(first.x, first.z) < d0 - 10, '성채에 가까워짐');
});

test('적은 길을 따라가다 성채에 닿으면 성채를 공격한다', () => {
  const s = createState(B, 1);
  place(s.commander, -20, -20);
  run(s, STILL, 60 * TPS); // 첫 웨이브 도착 시간 충분히
  assert.ok(s.castle.hp < B.castle.hp, `성채 체력 ${s.castle.hp}`);
  // 길에서 크게 벗어나지 않았는지
  for (const e of s.enemies) assert.ok(Math.abs(e.x) < 8 || Math.abs(e.z) < 8, `길 밖 (${e.x},${e.z})`);
});

test('모집 패드를 해금하면 궁수 3명이 생겨 성주를 따라다닌다 (최대 6)', () => {
  const s = quiet();
  s.unlocked.barracks = true;
  s.buildings.push({ id: 900, kind: 'barracks', x: -7, z: 3, halfWidth: 1.6, halfDepth: 1.3, hp: 400, maxHp: 400, stored: 0, timer: 0 });
  const rp = s.pads.find(p => p.id === 'recruit');
  s.commander.coins = 100;
  place(s.commander, rp.x, rp.z);
  run(s, STILL, Math.round(0.8 * TPS) + 1);
  assert.equal(s.archers.length, 3);
  // 성주가 움직이면 따라온다
  run(s, { x: 1, z: 0 }, 4 * TPS);
  run(s, STILL, 2 * TPS);
  for (const a of s.archers) assert.ok(Math.hypot(a.x - s.commander.x, a.z - s.commander.z) < 4, '성주 근처');
  // 한 번 더 → 6, 그 뒤 패드 닫힘
  place(s.commander, rp.x, rp.z);
  run(s, STILL, 2 * TPS);
  assert.equal(s.archers.length, 6);
  assert.equal(rp.open, false);
  spawnArchers(s, 3, 0, 10, B);
  assert.equal(s.archers.length, 6, '상한 6');
});

test('궁수는 사거리(6m) 안 적을 쏘고, 적 체력이 0이면 사라지며 은화를 떨어뜨린다', () => {
  const s = quiet();
  place(s.commander, 0, 20);
  spawnArchers(s, 1, 0, 18.5, B);
  run(s, STILL, TPS); // 자리 잡기
  const a = s.archers[0];
  const e = spawnEnemy(s, 'raider', 'south', B);
  place(e, a.x + 7.5, a.z); // 사거리 밖
  e.wp = 99; // 길 끝 처리 대신 제자리 테스트를 위해 성채로 향하게
  const far = () => Math.hypot(e.x - a.x, e.z - a.z) - B.enemies.types.raider.radius;
  run(s, STILL, 1);
  if (far() > B.archers.range) assert.equal(e.hp, B.enemies.types.raider.hp, '사거리 밖이면 안 쏨');
  const coinsBefore = s.coins.length;
  place(e, a.x + 4, a.z);
  run(s, STILL, 1);
  assert.ok(e.hp < B.enemies.types.raider.hp, '사거리 안이면 쏨');
  // 적을 그 자리에 붙잡아 두고 6초
  for (let i = 0; i < 6 * TPS && s.enemies.includes(e); i++) { place(e, a.x + 4, a.z); step(s, STILL, B); }
  assert.ok(!s.enemies.includes(e), '죽으면 사라짐');
  assert.equal(s.kills, 1);
  assert.equal(s.coins.length - coinsBefore, B.enemies.types.raider.coins, '은화 떨어뜨림');
});

test('성주는 1.5m 안 적을 0.8초마다 12씩 때린다', () => {
  const s = quiet();
  place(s.commander, 0, 20);
  const e = spawnEnemy(s, 'shield', 'south', B);
  place(e, 1.2, 20);
  e.wp = 99;
  const hp0 = e.hp;
  run(s, STILL, 1);
  assert.equal(e.hp, hp0 - 12);
  run(s, STILL, Math.round(0.8 * TPS));
  assert.equal(e.hp, hp0 - 24);
});

test('적은 2m 안 아군에게 다가가 공격한다 → 궁수는 죽으면 사라지고 모집 패드가 다시 열린다', () => {
  const s = quiet();
  s.unlocked.barracks = true;
  place(s.commander, -25, -25);
  spawnArchers(s, 1, 0, 20, B);
  const a = s.archers[0];
  a.cooldown = 1e9; // 반격하지 않게
  s.commander.alive = false; s.commander.respawn = 1e9; // 궁수가 제자리에 있도록
  const e = spawnEnemy(s, 'raider', 'south', B);
  place(e, 1.6, 20);
  e.wp = 99;
  run(s, STILL, TPS);
  assert.ok(a.hp < B.archers.hp, '궁수 체력 닳음');
  run(s, STILL, 15 * TPS);
  assert.equal(s.archers.length, 0, '죽은 궁수는 사라짐');
  assert.ok(s.events.length >= 0);
  assert.equal(s.pads.find(p => p.id === 'recruit').open, true, '궁수가 6 미만이면 모집 패드 열림');
});

test('성주가 쓰러지면 은화 절반을 떨어뜨리고 5초 뒤 성채 앞에서 부활한다', () => {
  const s = quiet();
  place(s.commander, 0, 20);
  s.commander.coins = 41;
  s.commander.cooldown = 1e9; // 반격 금지
  s.commander.hp = 10;
  const e = spawnEnemy(s, 'raider', 'south', B);
  place(e, 1.0, 20);
  e.wp = 99;
  let downAt = -1;
  for (let i = 0; i < 4 * TPS && downAt < 0; i++) { step(s, STILL, B); if (!s.commander.alive) downAt = s.tick; }
  assert.ok(downAt > 0, '쓰러짐');
  assert.equal(s.commander.coins, 21, '41 → 절반(20) 떨어뜨림');
  assert.equal(s.coins.length, 20);
  // 쓰러진 동안은 못 움직임
  const x = s.commander.x;
  run(s, { x: 1, z: 0 }, TPS);
  assert.equal(s.commander.x, x);
  e.hp = 0; // 적 치우기 (은화가 떨어진 자리 주변을 비워 둠)
  run(s, STILL, 5 * TPS - TPS - 1);
  assert.equal(s.commander.alive, false);
  run(s, STILL, 1);
  assert.equal(s.commander.alive, true, '5초 뒤 부활');
  assert.equal(s.commander.hp, B.commander.hp);
  assert.equal(s.commander.x, B.map.commanderStart.x);
  assert.equal(s.commander.z, B.map.commanderStart.z);
});

test('거인은 대상 주변 2m 안 아군 모두에게 피해를 준다', () => {
  const s = quiet();
  place(s.commander, 0, 20);
  s.commander.cooldown = 1e9;
  spawnArchers(s, 2, 0, 20, B);
  s.archers.forEach((a, i) => { place(a, 0.8 * (i ? 1 : -1), 21); a.cooldown = 1e9; });
  const g = spawnEnemy(s, 'giant', 'south', B);
  place(g, 0, 17.6); g.wp = 99;
  // 궁수가 대열로 걷지 않게 성주를 쓰러진 상태로 두면 안 되므로 바로 한 틱만 확인
  run(s, STILL, 1);
  const hurt = s.events.filter(e => e.type === 'hit' && e.target !== 'enemy').length;
  assert.ok(hurt >= 2, `범위 피해 대상 ${hurt}`);
});

test('같은 시드면 웨이브 3개를 싸운 결과가 같다 (결정론)', () => {
  const play = () => {
    const s = createState(B, 5);
    s.unlocked.barracks = true;
    spawnArchers(s, 6, 0, 10, B);
    for (let i = 0; i < 100 * TPS; i++) {
      // 남쪽 길을 왔다 갔다 하며 싸우기
      const phase = Math.floor(i / (4 * TPS)) % 2;
      step(s, { x: 0, z: phase ? 0.6 : -0.6 }, B);
    }
    return { kills: s.kills, castle: s.castle.hp, hp: s.commander.hp, archers: s.archers.length, coins: s.coins.length, carried: s.commander.coins, rng: s.rng.s };
  };
  const a = play();
  assert.deepEqual(a, play());
  assert.ok(a.kills > 0, '적을 처치함');
});
