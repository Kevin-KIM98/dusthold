// 이어하기 저장 로직 테스트 (브라우저 없이)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBalance } from './helpers.js';
import { createState } from '../js/sim/state.js';
import { step } from '../js/sim/rules.js';
import { serialize, deserialize, summary } from '../js/sim/save.js';
import { botInput } from './bot.js';

const B = loadBalance();
const TPS = Math.round(1 / B.sim.tickSeconds);

test('저장했다가 불러와서 이어 하면, 멈추지 않고 계속한 판과 똑같다', () => {
  const a = createState(B, 3);
  for (let i = 0; i < 120 * TPS; i++) step(a, botInput(a, B), B); // 2분 (웨이브·건물·전투 포함)
  const text = serialize(a, B);
  const b = deserialize(text, B);
  assert.ok(b, '불러오기 성공');
  for (let i = 0; i < 90 * TPS; i++) { step(a, botInput(a, B), B); step(b, botInput(b, B), B); }
  const pick = s => JSON.stringify({ t: s.tick, rng: s.rng.s, c: s.commander, castle: s.castle.hp, e: s.enemies, ar: s.archers, w: s.walls, k: s.kills, r: s.result });
  assert.equal(pick(b), pick(a));
  assert.ok(a.kills > 0 && a.buildings.length > 0, '진행된 판이었음');
});

test('저장 크기는 작다 (폰 저장소에 부담 없음)', () => {
  const a = createState(B, 3);
  for (let i = 0; i < 200 * TPS; i++) step(a, botInput(a, B), B);
  const kb = serialize(a, B).length / 1024;
  console.log(`  저장 크기 ${kb.toFixed(1)}KB`);
  assert.ok(kb < 200, `${kb}KB`);
});

test('쓸 수 없는 저장은 버린다: 망가진 데이터·버전 다름·패드 구성 바뀜·끝난 판', () => {
  const a = createState(B, 1);
  step(a, { x: 0, z: 0 }, B);
  const good = serialize(a, B);
  assert.ok(deserialize(good, B));
  assert.equal(deserialize('', B), null);
  assert.equal(deserialize('{망가짐', B), null);
  assert.equal(deserialize(null, B), null);
  const other = JSON.parse(JSON.stringify(B)); other.save.version += 1;
  assert.equal(deserialize(good, other), null, '버전 다름');
  const morePads = JSON.parse(JSON.stringify(B)); morePads.pads.list.push({ id: 'newPad', x: 0, z: 0, cost: 1, requires: [] });
  assert.equal(deserialize(good, morePads), null, '패드 구성 바뀜');
  a.result = 'lose';
  assert.equal(deserialize(serialize(a, B), B), null, '끝난 판은 이어하지 않음');
});

test('요약: 웨이브·은화·진행 시간', () => {
  const a = createState(B, 1);
  a.commander.coins = 12; a.waves.current = 3;
  for (let i = 0; i < 40; i++) step(a, { x: 0, z: 0 }, B);
  const s = summary(a);
  assert.equal(s.coins, 12);
  assert.equal(s.wave, 3);
  assert.ok(s.time > 1.9);
});
