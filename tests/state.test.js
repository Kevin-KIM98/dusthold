// 완료 기준: 새로고침해도 진행 상황이 복원된다 (직렬화/복원), 시작 상태가 기획서와 같다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { createState, serialize, deserialize, pushLog } from '../js/sim/state.js';
import { tick, setSpeed } from '../js/sim/time.js';
import { createRng } from '../js/sim/rng.js';

test('시작 자원: 식량 20·물 20·목재 40·고철 25·통신부품 0, 생존자 4, 인구 상한 6', () => {
  const s = createState(42);
  assert.deepEqual(s.resources, { food: 20, water: 20, wood: 40, scrap: 25, parts: 0 });
  assert.equal(s.survivors.length, 4);
  assert.equal(s.popCap, 6);
  assert.equal(s.storageCap, 150);
  const specs = s.survivors.map((v) => v.specialty).sort();
  assert.deepEqual(specs, ['build', 'combat', 'gather', 'tech'], '특기 4종 1명씩');
  assert.equal(new Set(s.survivors.map((v) => v.name)).size, 4, '이름 중복 없음');
  assert.ok(s.log.length >= 1);
});

test('같은 시드면 같은 생존자, 다른 시드면 보통 다르다', () => {
  const a = createState(7), b = createState(7), c = createState(8);
  assert.deepEqual(a.survivors.map((v) => v.name), b.survivors.map((v) => v.name));
  assert.notDeepEqual(a.survivors.map((v) => v.name), c.survivors.map((v) => v.name));
});

test('시드 RNG: 결정적이고 0~1 범위, 상태 저장·복원 가능', () => {
  const r1 = createRng(123), r2 = createRng(123);
  for (let i = 0; i < 100; i++) {
    const v = r1.next();
    assert.equal(v, r2.next());
    assert.ok(v >= 0 && v < 1);
  }
  const st = r1.getState();
  const next = r1.next();
  r2.setState(st);
  assert.equal(r2.next(), next);
  for (let i = 0; i < 50; i++) { const n = r1.int(3, 5); assert.ok(n >= 3 && n <= 5); }
});

test('직렬화 → 복원하면 진행 상황(틱·배속·자원·기록)이 그대로다', () => {
  const s = createState(99);
  for (let i = 0; i < 2500; i++) tick(s); // 2일차 밤 전
  setSpeed(s, 2);
  s.resources.wood = 123;
  pushLog(s, 'log.nightFalls', null);
  const json = serialize(s);
  assert.equal(typeof json, 'string');
  const r = deserialize(json);
  assert.ok(r);
  assert.equal(r.version, CONFIG.SAVE.VERSION);
  assert.equal(r.time.tick, 2500);
  assert.equal(r.speed, 2);
  assert.equal(r.resources.wood, 123);
  assert.equal(r.log.length, s.log.length);
  assert.deepEqual(r.survivors, s.survivors);
  assert.deepEqual(r.events, [], '임시 이벤트는 저장되지 않는다');
  assert.equal(r.time.acc, 0);
});

test('깨진 저장·버전 불일치는 null (새로 시작 안내로 이어짐)', () => {
  assert.equal(deserialize('not json'), null);
  assert.equal(deserialize('null'), null);
  assert.equal(deserialize('{}'), null);
  const s = createState(1);
  const bad = JSON.parse(serialize(s));
  bad.version = CONFIG.SAVE.VERSION + 1;
  assert.equal(deserialize(JSON.stringify(bad)), null);
});

test('기록은 LOG_MAX를 넘지 않는다', () => {
  const s = createState(1);
  for (let i = 0; i < CONFIG.UI.LOG_MAX + 50; i++) pushLog(s, 'log.nightFalls');
  assert.equal(s.log.length, CONFIG.UI.LOG_MAX);
});

test('저장 키는 dusthold.save.v1', () => {
  assert.equal(CONFIG.SAVE.KEY, 'dusthold.save.v1');
});
