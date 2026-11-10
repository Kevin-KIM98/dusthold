// M3 로직 테스트: 웨이브 공식 · 궁수 · 자동 공격 · 피해 · 죽음/부활
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBalance } from './helpers.js';
import { createState } from '../js/sim/state.js';
import { step } from '../js/sim/rules.js';
import { spawnEnemy, spawnArchers } from '../js/sim/units.js';
import { swordAngle, SWORD_IDLE, SWORD_RAISE, SWORD_STRIKE } from '../js/render/anim.js';

const B = loadBalance();
const TPS = Math.round(1 / B.sim.tickSeconds);
const STILL = { x: 0, z: 0 };
const run = (s, input, ticks) => { for (let i = 0; i < ticks; i++) step(s, input, B); };
const place = (o, x, z) => { o.x = o.prevX = x; o.z = o.prevZ = z; };
/** 웨이브가 오지 않는 조용한 상태 (개별 규칙 테스트용) */
const quiet = () => { const s = createState(B, 1); s.coins = []; s.spawn.paused = true; return s; };

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
  s.commander.cooldown = 1e9; // 궁수만 보기 (성주 손도끼 제외)
  run(s, STILL, TPS); // 자리 잡기
  const a = s.archers[0];
  const e = spawnEnemy(s, 'raider', 'south', B);
  place(e, a.x + 7.5, a.z); // 사거리 밖
  e.wp = 99; // 길 끝 처리 대신 제자리 테스트를 위해 성채로 향하게
  const far = () => Math.hypot(e.x - a.x, e.z - a.z) - B.enemies.types.raider.radius;
  run(s, STILL, 1);
  if (far() > B.archers.range) assert.equal(e.hp, B.enemies.types.raider.hp, '사거리 밖이면 안 쏨');
  const money = () => s.coins.reduce((a, k) => a + (k.value || 1), 0) + s.commander.coins; // 성주가 바로 주울 수도 있음
  const coinsBefore = money();
  place(e, a.x + 4, a.z);
  run(s, STILL, 1);
  assert.ok(e.hp < B.enemies.types.raider.hp, '사거리 안이면 쏨');
  // 적을 그 자리에 붙잡아 두고 6초
  for (let i = 0; i < 6 * TPS && s.enemies.includes(e); i++) { place(e, a.x + 4, a.z); step(s, STILL, B); }
  assert.ok(!s.enemies.includes(e), '죽으면 사라짐');
  assert.equal(s.kills, 1);
  assert.equal(money() - coinsBefore, B.enemies.types.raider.coins, '은화 떨어뜨림');
});

test('성주는 사거리 안 적을 공격 간격마다 공격력만큼 때린다 (궁수보다 훨씬 셈)', () => {
  assert.ok(B.commander.attack / B.commander.attackInterval >= 2.5 * B.archers.attack / B.archers.attackInterval, '성주 초당 피해가 궁수의 2.5배 이상');
  const s = quiet();
  place(s.commander, 0, 20);
  const e = spawnEnemy(s, 'shield', 'south', B);
  place(e, B.commander.range, 20); // 가장자리까지 거리 = 사거리 − 반지름 → 닿음
  e.wp = 99;
  const hp0 = e.hp;
  run(s, STILL, 1);
  assert.equal(e.hp, hp0 - B.commander.attack);
  assert.ok(s.events.some(ev => ev.type === 'slash'), '휘두르기 이벤트');
  run(s, STILL, Math.round(B.commander.attackInterval * TPS));
  assert.equal(e.hp, hp0 - 2 * B.commander.attack); // 방패 약탈자(140)는 두 대로는 안 죽음
});

test('성주 칼 휘두르기 연출: 치켜들었다가 → 앞으로 내려치고 → 제자리', () => {
  assert.equal(swordAngle(-0.1), SWORD_IDLE);
  assert.equal(swordAngle(0), SWORD_IDLE);
  assert.ok(Math.abs(swordAngle(0.3) - SWORD_RAISE) < 1e-9, '뒤로 치켜듦');
  assert.ok(Math.abs(swordAngle(0.7) - SWORD_STRIKE) < 1e-9, '앞으로 내려침');
  assert.ok(Math.abs(swordAngle(1.6) - SWORD_IDLE) < 1e-9, '제자리');
  // 0.3→0.7 구간에서 계속 앞으로만 움직임
  for (let u = 0.3; u < 0.7; u += 0.05) assert.ok(swordAngle(u + 0.05) > swordAngle(u));
});

test('성주 원거리: 칼이 안 닿고 사거리 안이면 손도끼(18), 칼이 닿으면 칼 우선, 사거리 밖이면 공격 안 함', () => {
  const C = B.commander;
  assert.ok(C.rangedAttack > B.archers.attack && C.rangedRange > B.archers.range, '손도끼가 궁수보다 세고 멀리');
  assert.ok(C.attack > C.rangedAttack, '칼이 더 셈');
  const s = quiet();
  place(s.commander, 0, 20);
  const e = spawnEnemy(s, 'shield', 'south', B); e.wp = 99;
  const r = B.enemies.types.shield.radius;
  const at = (d) => { place(e, d, 20); e.hp = e.maxHp; s.commander.cooldown = 0; step(s, STILL, B); return e.maxHp - e.hp; };
  // 적이 움직이지 않도록 매번 다시 세우며 한 틱씩
  assert.equal(at(C.rangedRange + r + 0.5), 0, '사거리 밖');
  assert.equal(at(C.rangedRange + r - 0.3), C.rangedAttack, '손도끼');
  assert.ok(s.events.some(ev => ev.type === 'throw'), '던지기 이벤트');
  assert.equal(s.commander.cooldown, Math.round(C.rangedInterval / B.sim.tickSeconds), '손도끼 대기 시간');
  assert.equal(at(C.range + r - 0.2), C.attack, '가까우면 칼');
  assert.ok(s.events.some(ev => ev.type === 'slash'));
});
