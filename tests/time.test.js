// 완료 기준: 시계가 흐르고 180초에 밤, 240초에 다음 날 / 일시정지·배속이 속도를 바꾼다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { createState } from '../js/sim/state.js';
import { tick, advance, setSpeed, setPaused, togglePaused, getDay, isNight, getClock, getSecondsToPhaseChange, DAY_TICKS, DAYLIGHT_TICKS } from '../js/sim/time.js';

const T = CONFIG.TIME;

function ticks(state, n) { for (let i = 0; i < n; i++) tick(state); }

test('틱 상수가 config에서 나온다 (하루 2400틱, 낮 1800틱)', () => {
  assert.equal(DAY_TICKS, 2400);
  assert.equal(DAYLIGHT_TICKS, 1800);
});

test('180초에 밤으로 바뀌고 240초에 다음 날이 된다', () => {
  const s = createState(1);
  assert.equal(getDay(s), 1);
  assert.equal(isNight(s), false);
  ticks(s, DAYLIGHT_TICKS - 1);
  assert.equal(isNight(s), false, '179.9초는 아직 낮');
  ticks(s, 1);
  assert.equal(isNight(s), true, '180초에 밤');
  assert.equal(getDay(s), 1);
  ticks(s, DAY_TICKS - DAYLIGHT_TICKS - 1);
  assert.equal(isNight(s), true, '239.9초는 아직 밤');
  ticks(s, 1);
  assert.equal(getDay(s), 2, '240초에 2일차');
  assert.equal(isNight(s), false, '2일차 아침은 낮');
});

test('시계 표시: 하루 시작 06:00, 밤 시작 00:00', () => {
  const s = createState(1);
  assert.deepEqual(getClock(s), { hour: 6, minute: 0 });
  ticks(s, DAYLIGHT_TICKS);
  assert.deepEqual(getClock(s), { hour: 0, minute: 0 });
  assert.equal(getSecondsToPhaseChange(s), 60);
  const s2 = createState(1);
  assert.equal(getSecondsToPhaseChange(s2), 180);
});

test('낮밤 전환이 기록에 남는다', () => {
  const s = createState(1);
  ticks(s, DAY_TICKS);
  const keys = s.log.map((e) => e.key);
  assert.ok(keys.includes('log.raidWarning'));
  assert.ok(keys.includes('log.nightFalls'));
  assert.ok(keys.includes('log.newDay'));
  assert.ok(s.events.some((e) => e.key === 'toast.newDay'));
});

test('advance: 1초 실시간 = 배속×10틱', () => {
  for (const speed of T.SPEEDS) {
    const s = createState(1);
    setSpeed(s, speed);
    let total = 0;
    for (let i = 0; i < 60; i++) total += advance(s, 1 / 60); // 1초를 60프레임으로
    assert.ok(Math.abs(total - 10 * speed) <= 1, `×${speed}: ${total}틱 (기대 ${10 * speed})`);
    assert.equal(s.time.tick, total);
  }
});

test('일시정지면 틱이 전혀 흐르지 않고, 풀면 다시 흐른다', () => {
  const s = createState(1);
  setPaused(s, true);
  let n = 0;
  for (let i = 0; i < 60; i++) n += advance(s, 1 / 60);
  assert.equal(n, 0);
  assert.equal(s.time.tick, 0);
  assert.equal(togglePaused(s), false);
  for (let i = 0; i < 60; i++) n += advance(s, 1 / 60);
  assert.ok(n >= 9 && n <= 11);
});

test('배속 바꾸면 일시정지가 풀리고, 허용되지 않은 배속은 거부된다', () => {
  const s = createState(1);
  setPaused(s, true);
  assert.equal(setSpeed(s, 3), true);
  assert.equal(s.paused, false);
  assert.equal(s.speed, 3);
  assert.equal(setSpeed(s, 7), false);
  assert.equal(s.speed, 3);
});

test('긴 프레임은 잘라낸다 (탭 복귀 폭주 방지)', () => {
  const s = createState(1);
  setSpeed(s, 3);
  const n = advance(s, 5); // 5초가 한 번에 들어와도
  assert.ok(n <= T.MAX_TICKS_PER_FRAME);
  assert.ok(n <= Math.round(T.MAX_FRAME_DT_SEC * 3 / T.TICK_SEC) + 1);
});

test('고정 타임스텝: 작은 dt를 누적해 정확히 틱이 떨어진다', () => {
  const s = createState(1);
  let n = 0;
  for (let i = 0; i < 1000; i++) n += advance(s, 0.001); // 1초
  assert.ok(n >= 9 && n <= 10, `${n}`);
});
